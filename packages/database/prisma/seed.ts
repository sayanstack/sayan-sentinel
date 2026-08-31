import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/**
 * Seeds the minimum local-dev identity so the app has somewhere to log in.
 * Does NOT create fake repositories, scans, or findings — those only ever
 * come from a real ingestion run against the demo fixture (Phase 15) or an
 * authorized repository.
 */
async function main() {
  const user = await prisma.user.upsert({
    where: { email: "demo@sayansentinel.local" },
    update: {},
    create: {
      email: "demo@sayansentinel.local",
      name: "Local Demo User",
    },
  });

  const organization = await prisma.organization.upsert({
    where: { slug: "local-demo" },
    update: {},
    create: {
      name: "Local Demo",
      slug: "local-demo",
    },
  });

  await prisma.membership.upsert({
    where: { userId_organizationId: { userId: user.id, organizationId: organization.id } },
    update: {},
    create: {
      userId: user.id,
      organizationId: organization.id,
      role: "OWNER",
    },
  });

  console.log(`Seeded local demo user (${user.email}) in organization "${organization.slug}".`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
