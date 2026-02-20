import { UserRole } from "@prisma/client";
import { prisma } from "./client";
import { seedMvpFormulasForOrganization } from "../services/formula-seed.service";

async function main(): Promise<void> {
  const existingFormulaCount = await prisma.formula.count();
  if (existingFormulaCount > 0) {
    console.info("Seed skipped: formulas already exist.");
    return;
  }

  const seedOwner = await prisma.user.findFirst({
    where: { role: UserRole.ADMIN },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      organizationId: true,
    },
  });

  if (!seedOwner) {
    console.info("Seed skipped: no admin user found. Run setup first.");
    return;
  }

  const createdCount = await seedMvpFormulasForOrganization({
    organizationId: seedOwner.organizationId,
    createdBy: seedOwner.id,
  });

  console.info(`Seed complete: created ${createdCount} MVP formulas.`);
}

main()
  .catch((error: unknown) => {
    console.error("Seed failed.", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
