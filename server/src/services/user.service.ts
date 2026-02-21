import bcrypt from "bcrypt";
import crypto from "crypto";
import { Prisma, UserStatus, type UserRole } from "@prisma/client";
import { AppError } from "../errors/app-error";
import { prisma } from "../prisma/client";
import { logAudit } from "./audit.service";
import { sendUserInviteEmail } from "./email.service";

type GetUsersInput = {
  organizationId: string;
  page: number;
  pageSize: number;
};

type InviteUserInput = {
  organizationId: string;
  email: string;
  role: UserRole;
  performedBy: string;
};

type AcceptInviteInput = {
  token: string;
  newPassword: string;
  name?: string;
};

type UpdateUserRoleInput = {
  organizationId: string;
  userId: string;
  role: UserRole;
  performedBy: string;
};

type DeactivateUserInput = {
  organizationId: string;
  userId: string;
  performedBy: string;
};

type UserSummary = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  status: UserStatus;
  createdAt: Date;
  pendingInvite?: boolean;
  inviteExpiresAt?: Date | null;
};

export type GetUsersResult = {
  items: UserSummary[];
  pagination: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
  };
};

export type InviteUserResult = {
  user: UserSummary;
  inviteExpiresAt: Date;
  emailDelivery: "SENT" | "FAILED";
  setupLink?: string;
  emailDeliveryErrorCode?: string;
};

export type AcceptInviteResult = {
  user: UserSummary;
};

export type UpdateUserRoleResult = {
  user: UserSummary;
};

export type DeactivateUserResult = {
  user: UserSummary;
};

const INVITE_TOKEN_BYTES = 32;
const INVITE_TOKEN_EXPIRY_MS = 24 * 60 * 60 * 1000;
const MIN_BCRYPT_COST_FACTOR = 12;

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


function buildAcceptInviteLink(token: string): string {
  const baseUrl = getFrontendBaseUrl().replace(/\/+$/, "");
  return `${baseUrl}/accept-invite?token=${encodeURIComponent(token)}`;
}

function buildInvitedUserName(email: string): string {
  const localPart = email.split("@")[0]?.trim();
  return localPart && localPart.length > 0 ? localPart : "Invited User";
}

export async function getUsers(input: GetUsersInput): Promise<GetUsersResult> {
  const now = new Date();
  const where = {
    organizationId: input.organizationId,
  };

  const skip = (input.page - 1) * input.pageSize;

  const [items, totalItems] = await prisma.$transaction([
    prisma.user.findMany({
      where,
      skip,
      take: input.pageSize,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        status: true,
        createdAt: true,
      },
    }),
    prisma.user.count({ where }),
  ]);

  const userIds = items.map((item) => item.id);
  const activeInviteTokens =
    userIds.length === 0
      ? []
      : await prisma.passwordResetToken.findMany({
          where: {
            userId: {
              in: userIds,
            },
            usedAt: null,
            expiresAt: { gt: now },
          },
          orderBy: [{ userId: "asc" }, { expiresAt: "desc" }],
          select: {
            userId: true,
            expiresAt: true,
          },
        });

  const inviteExpiryByUserId = new Map<string, Date>();
  for (const token of activeInviteTokens) {
    if (!inviteExpiryByUserId.has(token.userId)) {
      inviteExpiryByUserId.set(token.userId, token.expiresAt);
    }
  }

  return {
    items: items.map((item) => {
      const inviteExpiresAt = inviteExpiryByUserId.get(item.id) ?? null;
      return {
        ...item,
        pendingInvite: item.status === UserStatus.INACTIVE && inviteExpiresAt !== null,
        inviteExpiresAt,
      };
    }),
    pagination: {
      page: input.page,
      pageSize: input.pageSize,
      totalItems,
      totalPages: totalItems === 0 ? 0 : Math.ceil(totalItems / input.pageSize),
    },
  };
}

export async function inviteUser(input: InviteUserInput): Promise<InviteUserResult> {
  const normalizedEmail = input.email.trim().toLowerCase();
  const existingUser = await prisma.user.findUnique({
    where: { email: normalizedEmail },
    select: {
      id: true,
      organizationId: true,
      name: true,
      email: true,
      role: true,
      status: true,
      createdAt: true,
    },
  });

  if (existingUser && existingUser.organizationId !== input.organizationId) {
    throw new AppError(
      409,
      "USER_EMAIL_CONFLICT",
      "A user with this email already exists in another organization",
    );
  }

  if (existingUser && existingUser.status === UserStatus.ACTIVE) {
    throw new AppError(409, "USER_EMAIL_CONFLICT", "A user with this email already exists");
  }

  const rawToken = crypto.randomBytes(INVITE_TOKEN_BYTES).toString("hex");
  const tokenHash = hashToken(rawToken);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + INVITE_TOKEN_EXPIRY_MS);
  const inviteLink = buildAcceptInviteLink(rawToken);

  let invitedUser: UserSummary;

  try {
    invitedUser = await prisma.$transaction(async (tx) => {
      const user = existingUser
        ? await tx.user.update({
            where: { id: existingUser.id },
            data: {
              role: input.role,
              status: UserStatus.INACTIVE,
            },
            select: {
              id: true,
              name: true,
              email: true,
              role: true,
              status: true,
              createdAt: true,
            },
          })
        : await tx.user.create({
            data: {
              organizationId: input.organizationId,
              name: buildInvitedUserName(normalizedEmail),
              email: normalizedEmail,
              passwordHash: await bcrypt.hash(crypto.randomBytes(32).toString("hex"), getBcryptCostFactor()),
              role: input.role,
              status: UserStatus.INACTIVE,
            },
            select: {
              id: true,
              name: true,
              email: true,
              role: true,
              status: true,
              createdAt: true,
            },
          });

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
          organizationId: input.organizationId,
          entityType: "User",
          entityId: user.id,
          action: "USER_INVITED",
          beforeState: existingUser
            ? {
                role: existingUser.role,
                status: existingUser.status,
              }
            : {},
          afterState: {
            email: user.email,
            role: user.role,
            status: user.status,
            inviteExpiresAt: expiresAt.toISOString(),
          },
          performedBy: input.performedBy,
        },
        tx,
      );

      return user;
    });
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }

    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new AppError(409, "USER_EMAIL_CONFLICT", "A user with this email already exists");
    }

    throw error;
  }

  let emailDelivery: InviteUserResult["emailDelivery"] = "SENT";
  let emailDeliveryErrorCode: string | undefined;

  try {
    await sendUserInviteEmail({
      to: normalizedEmail,
      setupLink: inviteLink,
      role: input.role,
    });
  } catch (error) {
    emailDelivery = "FAILED";
    emailDeliveryErrorCode = error instanceof AppError ? error.code : "EMAIL_DISPATCH_FAILED";
  }

  return {
    user: {
      ...invitedUser,
      pendingInvite: true,
      inviteExpiresAt: expiresAt,
    },
    inviteExpiresAt: expiresAt,
    emailDelivery,
    ...(emailDelivery === "FAILED" ? { setupLink: inviteLink, emailDeliveryErrorCode } : {}),
  };
}

export async function acceptInvite(input: AcceptInviteInput): Promise<AcceptInviteResult> {
  const now = new Date();
  const tokenHash = hashToken(input.token);

  const inviteToken = await prisma.passwordResetToken.findFirst({
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
          id: true,
          organizationId: true,
          name: true,
          email: true,
          role: true,
          status: true,
          createdAt: true,
        },
      },
    },
  });

  if (!inviteToken) {
    throw new AppError(400, "AUTH_INVALID_INVITE_TOKEN", "Invalid or expired invite token");
  }

  if (inviteToken.user.status !== UserStatus.INACTIVE) {
    throw new AppError(409, "INVITE_NOT_APPLICABLE", "Invite is no longer applicable");
  }

  const passwordHash = await bcrypt.hash(input.newPassword, getBcryptCostFactor());

  const acceptedUser = await prisma.$transaction(async (tx) => {
    const consumed = await tx.passwordResetToken.updateMany({
      where: {
        id: inviteToken.id,
        usedAt: null,
        expiresAt: { gt: now },
      },
      data: { usedAt: now },
    });

    if (consumed.count !== 1) {
      throw new AppError(400, "AUTH_INVALID_INVITE_TOKEN", "Invalid or expired invite token");
    }

    await tx.passwordResetToken.updateMany({
      where: {
        userId: inviteToken.userId,
        id: { not: inviteToken.id },
        usedAt: null,
        expiresAt: { gt: now },
      },
      data: { usedAt: now },
    });

    const updatedUser = await tx.user.update({
      where: { id: inviteToken.userId },
      data: {
        ...(input.name ? { name: input.name.trim() } : {}),
        passwordHash,
        status: UserStatus.ACTIVE,
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        status: true,
        createdAt: true,
      },
    });

    await tx.refreshToken.updateMany({
      where: {
        userId: inviteToken.userId,
        revokedAt: null,
      },
      data: {
        revokedAt: now,
      },
    });

    await logAudit(
      {
        organizationId: inviteToken.user.organizationId,
        entityType: "User",
        entityId: updatedUser.id,
        action: "USER_INVITE_ACCEPTED",
        beforeState: {
          name: inviteToken.user.name,
          status: inviteToken.user.status,
        },
        afterState: {
          name: updatedUser.name,
          status: updatedUser.status,
          acceptedAt: now.toISOString(),
        },
        performedBy: updatedUser.id,
      },
      tx,
    );

    return updatedUser;
  });

  return {
    user: acceptedUser,
  };
}

export async function updateUserRole(input: UpdateUserRoleInput): Promise<UpdateUserRoleResult> {
  const user = await prisma.user.findFirst({
    where: {
      id: input.userId,
      organizationId: input.organizationId,
    },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      status: true,
      createdAt: true,
    },
  });

  if (!user) {
    throw new AppError(404, "USER_NOT_FOUND", "User not found");
  }

  if (user.role === input.role) {
    return { user };
  }

  const updated = await prisma.$transaction(async (tx) => {
    const updatedUser = await tx.user.update({
      where: { id: user.id },
      data: { role: input.role },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        status: true,
        createdAt: true,
      },
    });

    await logAudit(
      {
        organizationId: input.organizationId,
        entityType: "User",
        entityId: updatedUser.id,
        action: "USER_ROLE_CHANGED",
        beforeState: {
          role: user.role,
        },
        afterState: {
          role: updatedUser.role,
        },
        performedBy: input.performedBy,
      },
      tx,
    );

    return updatedUser;
  });

  return {
    user: updated,
  };
}

export async function deactivateUser(input: DeactivateUserInput): Promise<DeactivateUserResult> {
  const user = await prisma.user.findFirst({
    where: {
      id: input.userId,
      organizationId: input.organizationId,
    },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      status: true,
      createdAt: true,
    },
  });

  if (!user) {
    throw new AppError(404, "USER_NOT_FOUND", "User not found");
  }

  if (user.status === UserStatus.INACTIVE) {
    return { user };
  }

  const now = new Date();
  const updated = await prisma.$transaction(async (tx) => {
    const deactivatedUser = await tx.user.update({
      where: { id: user.id },
      data: { status: UserStatus.INACTIVE },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        status: true,
        createdAt: true,
      },
    });

    await tx.refreshToken.updateMany({
      where: {
        userId: user.id,
        revokedAt: null,
      },
      data: {
        revokedAt: now,
      },
    });

    await tx.passwordResetToken.updateMany({
      where: {
        userId: user.id,
        usedAt: null,
        expiresAt: { gt: now },
      },
      data: {
        usedAt: now,
      },
    });

    await logAudit(
      {
        organizationId: input.organizationId,
        entityType: "User",
        entityId: deactivatedUser.id,
        action: "USER_DEACTIVATED",
        beforeState: {
          status: user.status,
        },
        afterState: {
          status: deactivatedUser.status,
        },
        performedBy: input.performedBy,
      },
      tx,
    );

    return deactivatedUser;
  });

  return {
    user: updated,
  };
}
