import { prisma } from "@sayan-sentinel/database";

function baseSlug(input: string): string {
  const slug = input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "org";
}

/** Appends `-2`, `-3`, ... until the slug is free — Organization.slug is unique. */
export async function generateUniqueOrganizationSlug(accountLogin: string): Promise<string> {
  const base = baseSlug(accountLogin);
  let candidate = base;
  let suffix = 2;
  while (await prisma.organization.findUnique({ where: { slug: candidate } })) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
  return candidate;
}
