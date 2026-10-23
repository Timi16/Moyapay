import type { PrismaClient } from "@prisma/client";

/** Deletes rows that only ever matter for a short while. */
export async function housekeeping(prisma: PrismaClient, now = new Date()): Promise<void> {
  await prisma.authChallenge.deleteMany({ where: { createdAt: { lt: new Date(now.getTime() - 24 * 3600_000) } } });
  await prisma.session.deleteMany({ where: { expiresAt: { lt: now } } });
  await prisma.rateLimit.deleteMany({ where: { resetAt: { lt: now } } });
}
