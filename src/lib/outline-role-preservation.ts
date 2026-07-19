import type { OrgRole } from "@prisma/client";
import { db } from "@/lib/db";

export type PreservedScheduleRole = {
  organizationId: string;
  userId: string;
  role: Extract<OrgRole, "OWNER" | "MANAGER">;
};

/**
 * Outline controls identity and group membership. Scheduling leadership roles
 * remain local and must survive an identity synchronization.
 */
export async function captureScheduleLeadershipRoles(): Promise<
  PreservedScheduleRole[]
> {
  const memberships = await db.organizationMember.findMany({
    where: {
      role: { in: ["OWNER", "MANAGER"] },
    },
    select: {
      organizationId: true,
      userId: true,
      role: true,
    },
  });

  return memberships.filter(
    (membership): membership is PreservedScheduleRole =>
      membership.role === "OWNER" || membership.role === "MANAGER"
  );
}

export async function restoreScheduleLeadershipRoles(
  organizationId: string,
  roles: PreservedScheduleRole[]
): Promise<void> {
  for (const role of roles) {
    if (role.organizationId !== organizationId) continue;

    await db.organizationMember.updateMany({
      where: {
        organizationId,
        userId: role.userId,
      },
      data: { role: role.role },
    });
  }
}
