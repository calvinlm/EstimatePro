import { prisma } from "../prisma/client";
import bcrypt from "bcrypt";
import { UserRole, UserStatus } from "@prisma/client";
import { AppError } from "../errors/app-error";
import { login, type AuthResponse } from "./auth.service";
import { seedMvpFormulasForOrganization } from "./formula-seed.service";
import type { SetupInput } from "../schemas/setup.schemas";

const MIN_BCRYPT_COST_FACTOR = 12;

function getBcryptCostFactor(): number {
  const parsed = Number.parseInt(process.env.BCRYPT_COST_FACTOR ?? `${MIN_BCRYPT_COST_FACTOR}`, 10);

  if (!Number.isFinite(parsed) || parsed < MIN_BCRYPT_COST_FACTOR) {
    return MIN_BCRYPT_COST_FACTOR;
  }

  return parsed;
}

export async function isSetupRequired(): Promise<boolean> {
  const organization = await prisma.organization.findFirst({
    select: { id: true },
  });

  return !organization;
}

export async function completeSetup(input: SetupInput): Promise<AuthResponse> {
  const normalizedEmail = input.adminEmail.toLowerCase();
  const passwordHash = await bcrypt.hash(input.password, getBcryptCostFactor());

  await prisma.$transaction(async (tx) => {
    const existingOrganization = await tx.organization.findFirst({
      select: { id: true },
    });

    if (existingOrganization) {
      throw new AppError(409, "SETUP_ALREADY_COMPLETED", "Setup has already been completed");
    }

    const organization = await tx.organization.create({
      data: {
        name: input.organizationName.trim(),
      },
    });

    const adminUser = await tx.user.create({
      data: {
        organizationId: organization.id,
        name: input.adminFullName.trim(),
        email: normalizedEmail,
        passwordHash,
        role: UserRole.ADMIN,
        status: UserStatus.ACTIVE,
      },
    });

    await seedMvpFormulasForOrganization(
      {
        organizationId: organization.id,
        createdBy: adminUser.id,
      },
      tx,
    );
  });

  return login({
    email: normalizedEmail,
    password: input.password,
  });
}
