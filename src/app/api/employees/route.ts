import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentMember } from "@/lib/auth-helpers";
import { getSelectedDivision } from "@/lib/selected-division";

type PatronymicRow = {
  id: string;
  patronymic: string | null;
};

export async function GET(request: NextRequest) {
  const member = await getCurrentMember();
  if (!member) {
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  }

  const selectedDivision = await getSelectedDivision(
    request,
    member.userId,
    member.organizationId
  );
  if (!selectedDivision) {
    return NextResponse.json(
      { error: "Нет доступного отдела Outline" },
      { status: 403 }
    );
  }

  const { searchParams } = request.nextUrl;
  const search = searchParams.get("search") || "";
  const role = searchParams.get("role") || "";
  const status = searchParams.get("status") || "";

  const divisionMembers = await db.divisionMember.findMany({
    where: { divisionId: selectedDivision.id },
    select: { userId: true },
  });
  const divisionUserIds = divisionMembers.map((item) => item.userId);

  const where: Record<string, unknown> = {
    organizationId: member.organizationId,
    userId: { in: divisionUserIds },
  };

  if (status === "inactive") {
    where.isActive = false;
  } else if (status === "not_activated") {
    where.isActive = true;
    where.isActivated = false;
  } else if (status !== "all") {
    where.isActive = true;
  }

  if (role && role !== "all") {
    where.role = role.toUpperCase();
  }

  const patronymicMatches = search
    ? await db.$queryRaw<{ id: string }[]>`
        SELECT u."id"
        FROM "users" u
        INNER JOIN "division_members" dm ON dm."userId" = u."id"
        WHERE dm."divisionId" = ${selectedDivision.id}
          AND u."patronymic" ILIKE ${`%${search}%`}
      `
    : [];
  const patronymicMatchIds = patronymicMatches.map((item) => item.id);

  const members = await db.organizationMember.findMany({
    where: {
      ...where,
      ...(search
        ? {
            user: {
              OR: [
                { firstName: { contains: search, mode: "insensitive" as const } },
                { lastName: { contains: search, mode: "insensitive" as const } },
                { email: { contains: search, mode: "insensitive" as const } },
                ...(patronymicMatchIds.length > 0
                  ? [{ id: { in: patronymicMatchIds } }]
                  : []),
              ],
            },
          }
        : {}),
    },
    include: {
      user: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          phone: true,
          nickname: true,
          profileImage: true,
        },
      },
    },
    orderBy: { joinedAt: "asc" },
  });

  const patronymics = await db.$queryRaw<PatronymicRow[]>`
    SELECT u."id", u."patronymic"
    FROM "users" u
    INNER JOIN "division_members" dm ON dm."userId" = u."id"
    WHERE dm."divisionId" = ${selectedDivision.id}
  `;
  const patronymicByUser = new Map(
    patronymics.map((item) => [item.id, item.patronymic])
  );

  const membersWithPatronymic = members.map((organizationMember) => ({
    ...organizationMember,
    user: {
      ...organizationMember.user,
      patronymic: patronymicByUser.get(organizationMember.user.id) ?? null,
    },
  }));

  const allMembers = await db.organizationMember.findMany({
    where: {
      organizationId: member.organizationId,
      userId: { in: divisionUserIds },
    },
    select: { role: true, isActive: true, isActivated: true },
  });

  const counts = {
    all: allMembers.filter((item) => item.isActive).length,
    admin: allMembers.filter(
      (item) => item.isActive && (item.role === "OWNER" || item.role === "ADMIN")
    ).length,
    manager: allMembers.filter(
      (item) => item.isActive && item.role === "MANAGER"
    ).length,
    not_activated: allMembers.filter(
      (item) => item.isActive && !item.isActivated
    ).length,
    inactive: allMembers.filter((item) => !item.isActive).length,
  };

  return NextResponse.json({
    division: selectedDivision,
    members: membersWithPatronymic,
    counts,
  });
}

export async function POST() {
  return NextResponse.json(
    {
      error:
        "Сотрудники и членство в отделах управляются группами Outline. Добавьте пользователя в Outline и нужную группу.",
    },
    { status: 409 }
  );
}
