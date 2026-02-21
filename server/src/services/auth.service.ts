import bcrypt from "bcrypt";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import { v4 as uuidv4 } from "uuid";
import { UserStatus } from "@prisma/client";
import { prisma } from "../prisma/client";
import { AppError } from "../errors/app-error";
import { logAudit } from "./audit.service";
import { sendPasswordResetEmail } from "./email.service";
import type {
  ForgotPasswordInput,
  LoginInput,
  LogoutInput,
  RefreshInput,
  ResetPasswordInput,
} from "../schemas/auth.schemas";

export type AuthResponse = {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    organizationId: string;
    name: string;
    email: string;
    role: string;
    status: string;
  };
};

type RefreshTokenPayload = {
  sub: string;
  organizationId: string;
  role: string;
  type: "refresh";
  jti: string;
};

type TokenPair = {
  accessToken: string;
  refreshToken: string;
  refreshJti: string;
  refreshExpiresAt: Date;
};

const PASSWORD_RESET_TOKEN_BYTES = 32;
const PASSWORD_RESET_EXPIRY_MS = 60 * 60 * 1000;
const MIN_BCRYPT_COST_FACTOR = 12;

function getJwtConfig(): {
  secret: string;
  accessExpiry: jwt.SignOptions["expiresIn"];
  refreshExpiry: jwt.SignOptions["expiresIn"];
} {
  const secret = process.env.JWT_SECRET;

  if (!secret) {
    throw new AppError(500, "SERVER_MISCONFIGURED", "Internal server error");
  }

  return {
    secret,
    accessExpiry: (process.env.JWT_ACCESS_EXPIRY ?? "15m") as jwt.SignOptions["expiresIn"],
    refreshExpiry: (process.env.JWT_REFRESH_EXPIRY ?? "7d") as jwt.SignOptions["expiresIn"],
  };
}

function hashToken(rawToken: string): string {
  return crypto.createHash("sha256").update(rawToken).digest("hex");
}

function getBcryptCostFactor(): number {
  const parsed = Number.parseInt(process.env.BCRYPT_COST_FACTOR ?? `${MIN_BCRYPT_COST_FACTOR}`, 10);

  if (!Number.isFinite(parsed) || parsed < MIN_BCRYPT_COST_FACTOR) {
    return MIN_BCRYPT_COST_FACTOR;
  }

  return parsed;
}

function decodeJwtExp(token: string): Date {
  const decoded = jwt.decode(token);

  if (!decoded || typeof decoded !== "object" || typeof decoded.exp !== "number") {
    throw new AppError(500, "TOKEN_GENERATION_FAILED", "Internal server error");
  }

  return new Date(decoded.exp * 1000);
}

function issueTokenPair(user: {
  id: string;
  organizationId: string;
  role: string;
}): TokenPair {
  const { secret, accessExpiry, refreshExpiry } = getJwtConfig();
  const refreshJti = uuidv4();

  const accessToken = jwt.sign(
    {
      sub: user.id,
      organizationId: user.organizationId,
      role: user.role,
      type: "access",
    },
    secret,
    { expiresIn: accessExpiry },
  );

  const refreshToken = jwt.sign(
    {
      sub: user.id,
      organizationId: user.organizationId,
      role: user.role,
      type: "refresh",
      jti: refreshJti,
    },
    secret,
    { expiresIn: refreshExpiry },
  );

  return {
    accessToken,
    refreshToken,
    refreshJti,
    refreshExpiresAt: decodeJwtExp(refreshToken),
  };
}

function getFrontendBaseUrl(): string {
  const configuredOrigin = (process.env.FRONTEND_URL ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .find((origin) => origin.length > 0);

  if (!configuredOrigin) {
    throw new AppError(500, "SERVER_MISCONFIGURED", "FRONTEND_URL is not configured");
  }

  return configuredOrigin.replace(/\/+$/, "");
}


function buildResetPasswordLink(token: string): string {
  const baseUrl = getFrontendBaseUrl().replace(/\/+$/, "");
  return `${baseUrl}/reset-password?token=${encodeURIComponent(token)}`;
}

function parseRefreshToken(refreshToken: string): RefreshTokenPayload {
  const { secret } = getJwtConfig();

  try {
    const decoded = jwt.verify(refreshToken, secret);

    if (
      !decoded ||
      typeof decoded !== "object" ||
      decoded.type !== "refresh" ||
      typeof decoded.sub !== "string" ||
      typeof decoded.organizationId !== "string" ||
      typeof decoded.role !== "string" ||
      typeof decoded.jti !== "string"
    ) {
      throw new AppError(401, "AUTH_INVALID_REFRESH_TOKEN", "Invalid refresh token");
    }

    return {
      sub: decoded.sub,
      organizationId: decoded.organizationId,
      role: decoded.role,
      type: "refresh",
      jti: decoded.jti,
    };
  } catch {
    throw new AppError(401, "AUTH_INVALID_REFRESH_TOKEN", "Invalid refresh token");
  }
}

async function buildAuthResponse(user: {
  id: string;
  organizationId: string;
  name: string;
  email: string;
  role: string;
  status: string;
}): Promise<AuthResponse> {
  const tokenPair = issueTokenPair({
    id: user.id,
    organizationId: user.organizationId,
    role: user.role,
  });

  await prisma.refreshToken.create({
    data: {
      userId: user.id,
      jti: tokenPair.refreshJti,
      tokenHash: hashToken(tokenPair.refreshToken),
      expiresAt: tokenPair.refreshExpiresAt,
    },
  });

  return {
    accessToken: tokenPair.accessToken,
    refreshToken: tokenPair.refreshToken,
    user,
  };
}

export async function login(input: LoginInput): Promise<AuthResponse> {
  const user = await prisma.user.findUnique({
    where: { email: input.email.toLowerCase() },
  });

  if (!user) {
    throw new AppError(401, "AUTH_INVALID_CREDENTIALS", "Invalid email or password");
  }

  const validPassword = await bcrypt.compare(input.password, user.passwordHash);
  if (!validPassword) {
    throw new AppError(401, "AUTH_INVALID_CREDENTIALS", "Invalid email or password");
  }

  if (user.status === UserStatus.INACTIVE) {
    throw new AppError(
      403,
      "ACCOUNT_INACTIVE",
      "Your account has been deactivated. Contact your administrator.",
    );
  }

  return buildAuthResponse({
    id: user.id,
    organizationId: user.organizationId,
    name: user.name,
    email: user.email,
    role: user.role,
    status: user.status,
  });
}

export async function refresh(input: RefreshInput): Promise<AuthResponse> {
  const payload = parseRefreshToken(input.refreshToken);
  const providedTokenHash = hashToken(input.refreshToken);

  const record = await prisma.refreshToken.findUnique({
    where: { jti: payload.jti },
  });

  if (
    !record ||
    record.tokenHash !== providedTokenHash ||
    record.userId !== payload.sub ||
    record.usedAt ||
    record.revokedAt ||
    record.expiresAt.getTime() <= Date.now()
  ) {
    throw new AppError(401, "AUTH_INVALID_REFRESH_TOKEN", "Invalid refresh token");
  }

  const user = await prisma.user.findUnique({
    where: { id: payload.sub },
  });

  if (!user) {
    throw new AppError(401, "AUTH_INVALID_REFRESH_TOKEN", "Invalid refresh token");
  }

  if (user.status === UserStatus.INACTIVE) {
    throw new AppError(
      403,
      "ACCOUNT_INACTIVE",
      "Your account has been deactivated. Contact your administrator.",
    );
  }

  const tokenPair = issueTokenPair({
    id: user.id,
    organizationId: user.organizationId,
    role: user.role,
  });

  await prisma.$transaction(async (tx) => {
    const rotation = await tx.refreshToken.updateMany({
      where: {
        id: record.id,
        usedAt: null,
        revokedAt: null,
      },
      data: {
        usedAt: new Date(),
        revokedAt: new Date(),
      },
    });

    if (rotation.count !== 1) {
      throw new AppError(401, "AUTH_INVALID_REFRESH_TOKEN", "Invalid refresh token");
    }

    await tx.refreshToken.create({
      data: {
        userId: user.id,
        jti: tokenPair.refreshJti,
        tokenHash: hashToken(tokenPair.refreshToken),
        expiresAt: tokenPair.refreshExpiresAt,
      },
    });
  });

  return {
    accessToken: tokenPair.accessToken,
    refreshToken: tokenPair.refreshToken,
    user: {
      id: user.id,
      organizationId: user.organizationId,
      name: user.name,
      email: user.email,
      role: user.role,
      status: user.status,
    },
  };
}

export async function revokeRefreshToken(refreshToken: string): Promise<void> {
  try {
    const payload = parseRefreshToken(refreshToken);
    const providedTokenHash = hashToken(refreshToken);

    await prisma.refreshToken.updateMany({
      where: {
        jti: payload.jti,
        tokenHash: providedTokenHash,
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
      },
    });
  } catch {
    // Keep revoke idempotent and non-enumerating.
  }
}

export async function forgotPassword(input: ForgotPasswordInput): Promise<void> {
  const normalizedEmail = input.email.toLowerCase();
  const user = await prisma.user.findUnique({
    where: { email: normalizedEmail },
    select: {
      id: true,
      organizationId: true,
      email: true,
      name: true,
      status: true,
    },
  });

  if (!user || user.status === UserStatus.INACTIVE) {
    return;
  }

  const rawToken = crypto.randomBytes(PASSWORD_RESET_TOKEN_BYTES).toString("hex");
  const tokenHash = hashToken(rawToken);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + PASSWORD_RESET_EXPIRY_MS);

  await prisma.$transaction(async (tx) => {
    await tx.passwordResetToken.updateMany({
      where: {
        userId: user.id,
        usedAt: null,
        expiresAt: { gt: now },
      },
      data: { usedAt: now },
    });

    await tx.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt,
      },
    });

    await logAudit(
      {
        organizationId: user.organizationId,
        entityType: "User",
        entityId: user.id,
        action: "PASSWORD_RESET_REQUESTED",
        beforeState: {},
        afterState: {
          requestedAt: now.toISOString(),
          expiresAt: expiresAt.toISOString(),
        },
        performedBy: user.id,
      },
      tx,
    );
  });

  try {
    await sendPasswordResetEmail({
      to: user.email,
      recipientName: user.name,
      resetLink: buildResetPasswordLink(rawToken),
    });
  } catch {
    // Keep forgot-password non-enumerating and resilient to provider outages.
  }
}

export async function resetPassword(input: ResetPasswordInput): Promise<void> {
  const now = new Date();
  const tokenHash = hashToken(input.token);

  const resetToken = await prisma.passwordResetToken.findFirst({
    where: {
      tokenHash,
      usedAt: null,
      expiresAt: { gt: now },
    },
    select: {
      id: true,
      userId: true,
      user: {
        select: {
          organizationId: true,
        },
      },
    },
  });

  if (!resetToken) {
    throw new AppError(400, "AUTH_INVALID_RESET_TOKEN", "Invalid or expired reset token");
  }

  const passwordHash = await bcrypt.hash(input.newPassword, getBcryptCostFactor());

  await prisma.$transaction(async (tx) => {
    const consumed = await tx.passwordResetToken.updateMany({
      where: {
        id: resetToken.id,
        usedAt: null,
        expiresAt: { gt: now },
      },
      data: { usedAt: now },
    });

    if (consumed.count !== 1) {
      throw new AppError(400, "AUTH_INVALID_RESET_TOKEN", "Invalid or expired reset token");
    }

    await tx.passwordResetToken.updateMany({
      where: {
        userId: resetToken.userId,
        id: { not: resetToken.id },
        usedAt: null,
        expiresAt: { gt: now },
      },
      data: { usedAt: now },
    });

    await tx.user.update({
      where: { id: resetToken.userId },
      data: { passwordHash },
    });

    await tx.refreshToken.updateMany({
      where: {
        userId: resetToken.userId,
        revokedAt: null,
      },
      data: {
        revokedAt: now,
      },
    });

    await logAudit(
      {
        organizationId: resetToken.user.organizationId,
        entityType: "User",
        entityId: resetToken.userId,
        action: "PASSWORD_RESET_COMPLETED",
        beforeState: {
          resetTokenId: resetToken.id,
        },
        afterState: {
          completedAt: now.toISOString(),
          refreshTokensRevoked: true,
        },
        performedBy: resetToken.userId,
      },
      tx,
    );
  });
}

export async function logout(input: LogoutInput): Promise<void> {
  await revokeRefreshToken(input.refreshToken);
}
