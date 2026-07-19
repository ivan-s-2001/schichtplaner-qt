import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentMember, isAdminOrAbove } from "@/lib/auth-helpers";
import { getSelectedDivision } from "@/lib/selected-division";

type PatronymicRow = {
  id: string;
  patronymic: string | null;
};

type DivisionUserRow = {
  userId: string;
};

// GET /api/employees - List members of the selected Outline group / division.
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
    return NextResponse.json({
      members: [],
      counts: {
        all: 0,
        admin: 0,
        manager: 0,
        not_activated: 0,
        inactive: 0,
      },
    });
  }

  const divisionUsers = await db.$queryRaw<DivisionUserRow[]>`
    SELECT "userId"
    FROM "division_members"
    WHERE "divisionId" = ${selectedDivision.id}
  `;
  const divisionUserIds = divisionUsers.map((item) => item.userId);

  const { searchParams } = request.nextUrl;
  const search = searchParams.get("search") || "";
  const role = searchParams.get("role") || "";
  const status = searchParams.get("status") || "";

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
        SELECT "id"
        FROM "users"
        WHERE "patronymic" ILIKE ${`%${search}%`}
          AND "id" IN (
            SELECT "userId"
            FROM "division_members"
            WHERE "divisionId" = ${selectedDivision.id}
          )
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
    INNER JOIN "organization_members" om ON om."userId" = u."id"
    INNER JOIN "division_members" dm ON dm."userId" = u."id"
    WHERE om."organizationId" = ${member.organizationId}
      AND dm."divisionId" = ${selectedDivision.id}
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
    members: membersWithPatronymic,
    counts,
    division: selectedDivision,
  });
}

// POST /api/employees - Create new employee(s)
const createEmployeeSchema = z.object({
  employees: z.array(
    z.object({
      lastName: z.string().trim().min(1),
      firstName: z.string().trim().min(1),
      patronymic: z.string().trim().min(1),
      email: z.string().email(),
      role: z.enum(["ADMIN", "MANAGER", "EMPLOYEE"]),
    })
  ),
});

export async function POST(request: NextRequest) {
  const member = await getCurrentMember();
  if (!member) {
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  }

  if (!isAdminOrAbove(member.role)) {
    return NextResponse.json({ error: "Недостаточно прав" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Некорректный JSON" }, { status: 400 });
  }

  const parsed = createEmployeeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Ошибка проверки данных", details: parsed.error.issues },
      { status: 400 }
    );
  }

  const selectedDivision = await getSelectedDivision(
    request,
    member.userId,
    member.organizationId
  );
  if (!selectedDivision) {
    return NextResponse.json(
      { error: "Сначала выберите отдел Outline" },
      { status: 400 }
    );
  }

  const { employees } = parsed.data;
  const normalizedEmployees = employees.map((employee) => ({
    ...employee,
    email: employee.email.toLowerCase(),
  }));
  const emails = normalizedEmployees.map((employee) => employee.email);

  if (new Set(emails).size !== emails.length) {
    return NextResponse.json(
      { error: "В списке повторяются адреса электронной почты" },
      { status: 400 }
    );
  }

  const existingUsers = await db.user.findMany({
    where: { email: { in: emails } },
    select: { id: true, email: true },
  });
  const existingUserByEmail = new Map(
    existingUsers.map((user) => [user.email.toLowerCase(), user])
  );

  if (existingUsers.length > 0) {
    const existingMemberships = await db.organizationMember.findMany({
      where: {
        organizationId: member.organizationId,
        userId: { in: existingUsers.map((user) => user.id) },
      },
      include: { user: { select: { email: true } } },
    });

    if (existingMemberships.length > 0) {
      return NextResponse.json(
        {
          error: "Некоторые сотрудники уже добавлены",
          emails: existingMemberships.map((membership) => membership.user.email),
        },
        { status: 409 }
      );
    }
  }

  const createdMembers = await db.$transaction(async (tx) => {
    const results = [];

    for (const employee of normalizedEmployees) {
      const existingUser = existingUserByEmail.get(employee.email);
      const user = existingUser
        ? await tx.user.update({
            where: { id: existingUser.id },
            data: {
              firstName: employee.firstName,
              lastName: employee.lastName,
            },
          })
        : await tx.user.create({
            data: {
              email: employee.email,
              firstName: employee.firstName,
              lastName: employee.lastName,
              emailVerified: new Date(),
            },
          });

      await tx.$executeRaw`
        UPDATE "users"
        SET "patronymic" = ${employee.patronymic}
        WHERE "id" = ${user.id}
      `;

      const membership = await tx.organizationMember.create({
        data: {
          organizationId: member.organizationId,
          userId: user.id,
          role: employee.role,
          isActive: true,
          isActivated: true,
          activationToken: null,
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
      });

      await tx.divisionMember.upsert({
        where: {
          divisionId_userId: {
            divisionId: selectedDivision.id,
            userId: user.id,
          },
        },
        update: {},
        create: {
          divisionId: selectedDivision.id,
          userId: user.id,
        },
      });

      results.push({
        ...membership,
        user: {
          ...membership.user,
          patronymic: employee.patronymic,
        },
      });
    }

    return results;
  });

  return NextResponse.json({ members: createdMembers }, { status: 201 });
}
