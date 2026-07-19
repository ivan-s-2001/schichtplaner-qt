import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentMember } from "@/lib/auth-helpers";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const member = await getCurrentMember();
  if (!member) {
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  }

  const { id } = await params;
  const division = await db.division.findFirst({
    where: {
      id,
      organizationId: member.organizationId,
      deletedAt: null,
    },
  });
  if (!division) {
    return NextResponse.json({ error: "Группа Outline не найдена" }, { status: 404 });
  }

  const members = await db.user.findMany({
    where: {
      memberships: {
        some: {
          organizationId: member.organizationId,
          isActive: true,
        },
      },
      dayOffs: undefined,
      AND: {
        id: {
          in: (
            await db.divisionMember.findMany({
              where: { divisionId: id },
              select: { userId: true },
            })
          ).map((item) => item.userId),
        },
      },
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      profileImage: true,
      memberships: {
        where: { organizationId: member.organizationId },
        select: { role: true },
      },
    },
  });

  return NextResponse.json({
    members: members.map((user) => ({
      id: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      profileImage: user.profileImage,
      role: user.memberships[0]?.role ?? "EMPLOYEE",
    })),
  });
}

const readOnlyResponse = () =>
  NextResponse.json(
    {
      error:
        "Состав отдела определяется участниками группы Outline. Измените группу в Outline.",
    },
    { status: 409 }
  );

export async function POST() {
  return readOnlyResponse();
}

export async function DELETE() {
  return readOnlyResponse();
}
