import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentMember, isAdminOrAbove } from "@/lib/auth-helpers";
import { getSelectedDivision } from "@/lib/selected-division";
import { emitToOrg, emitToSchedule } from "@/lib/emit";
import {
  DEFAULT_VACATION_DAYS,
  assertPeriodInsideYear,
  clearScheduleCellsForPeriod,
  countWorkingDays,
  ensureVacationAllowanceTable,
  getOrCreateVacationCategory,
  getVacationCategoryIds,
  parseDateOnly,
  yearEnd,
  yearStart,
} from "@/lib/vacation";

type AllowanceRow = {
  userId: string;
  days: number;
};

function parseYear(value: string | null): number {
  const fallback = new Date().getUTCFullYear();
  if (!value) return fallback;
  const year = Number.parseInt(value, 10);
  return Number.isInteger(year) && year >= 2000 && year <= 2100
    ? year
    : fallback;
}

async function getAllowance(
  organizationId: string,
  userId: string,
  year: number
): Promise<number> {
  await ensureVacationAllowanceTable();
  const rows = await db.$queryRaw<AllowanceRow[]>`
    SELECT "userId"::text AS "userId", "days"
    FROM schedule."vacation_allowances"
    WHERE "organizationId" = CAST(${organizationId} AS uuid)
      AND "userId" = CAST(${userId} AS uuid)
      AND "year" = ${year}
    LIMIT 1
  `;
  return rows[0]?.days ?? DEFAULT_VACATION_DAYS;
}

export async function GET(request: NextRequest) {
  const member = await getCurrentMember();
  if (!member) {
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  }

  const division = await getSelectedDivision(
    request,
    member.userId,
    member.organizationId
  );
  if (!division) {
    return NextResponse.json(
      { error: "Нет доступного подразделения" },
      { status: 403 }
    );
  }

  const year = parseYear(request.nextUrl.searchParams.get("year"));
  const canManage = isAdminOrAbove(member.role) || division.isManager;

  const divisionMembers = await db.divisionMember.findMany({
    where: { divisionId: division.id },
    select: { userId: true },
  });
  const divisionUserIds = divisionMembers.map((item) => item.userId);
  const visibleUserIds = canManage
    ? divisionUserIds
    : divisionUserIds.includes(member.userId)
      ? [member.userId]
      : [];

  await ensureVacationAllowanceTable();
  const allowanceRows = await db.$queryRaw<AllowanceRow[]>`
    SELECT "userId"::text AS "userId", "days"
    FROM schedule."vacation_allowances"
    WHERE "organizationId" = CAST(${member.organizationId} AS uuid)
      AND "year" = ${year}
  `;
  const allowanceByUser = new Map(
    allowanceRows.map((row) => [row.userId, row.days])
  );

  const organizationMembers = visibleUserIds.length
    ? await db.organizationMember.findMany({
        where: {
          organizationId: member.organizationId,
          userId: { in: visibleUserIds },
          isActive: true,
        },
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              patronymic: true,
              profileImage: true,
            },
          },
        },
      })
    : [];

  const vacationCategoryIds = await getVacationCategoryIds(
    member.organizationId
  );
  const absences =
    visibleUserIds.length && vacationCategoryIds.length
      ? await db.absence.findMany({
          where: {
            userId: { in: visibleUserIds },
            categoryId: { in: vacationCategoryIds },
            status: { not: "DECLINED" },
            dateFrom: { lte: yearEnd(year) },
            dateTo: { gte: yearStart(year) },
          },
          orderBy: [{ userId: "asc" }, { dateFrom: "asc" }],
        })
      : [];

  const periodsByUser = new Map<string, typeof absences>();
  for (const absence of absences) {
    const periods = periodsByUser.get(absence.userId) ?? [];
    periods.push(absence);
    periodsByUser.set(absence.userId, periods);
  }

  const employees = organizationMembers
    .map((organizationMember) => {
      const periods = periodsByUser.get(organizationMember.userId) ?? [];
      const usedDays = periods
        .filter((period) => period.status === "APPROVED")
        .reduce(
          (total, period) =>
            total +
            countWorkingDays(
              period.dateFrom,
              period.dateTo,
              yearStart(year),
              yearEnd(year)
            ),
          0
        );
      const allowanceDays =
        allowanceByUser.get(organizationMember.userId) ??
        DEFAULT_VACATION_DAYS;

      return {
        userId: organizationMember.userId,
        firstName: organizationMember.user.firstName,
        lastName: organizationMember.user.lastName,
        patronymic: organizationMember.user.patronymic,
        profileImage: organizationMember.user.profileImage,
        allowanceDays,
        usedDays,
        remainingDays: allowanceDays - usedDays,
        periods: periods.map((period) => ({
          id: period.id,
          dateFrom: period.dateFrom,
          dateTo: period.dateTo,
          note: period.note,
          status: period.status,
          workingDays: countWorkingDays(
            period.dateFrom,
            period.dateTo,
            yearStart(year),
            yearEnd(year)
          ),
        })),
      };
    })
    .sort((left, right) =>
      `${left.lastName} ${left.firstName}`.localeCompare(
        `${right.lastName} ${right.firstName}`,
        "ru"
      )
    );

  return NextResponse.json({
    division,
    year,
    canManage,
    employees,
    totals: {
      allowanceDays: employees.reduce(
        (total, employee) => total + employee.allowanceDays,
        0
      ),
      usedDays: employees.reduce(
        (total, employee) => total + employee.usedDays,
        0
      ),
      remainingDays: employees.reduce(
        (total, employee) => total + employee.remainingDays,
        0
      ),
    },
  });
}

const createVacationSchema = z.object({
  userId: z.string().uuid(),
  year: z.number().int().min(2000).max(2100),
  dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  note: z.string().trim().max(500).nullable().optional(),
});

export async function POST(request: NextRequest) {
  const member = await getCurrentMember();
  if (!member) {
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  }

  const division = await getSelectedDivision(
    request,
    member.userId,
    member.organizationId
  );
  if (!division) {
    return NextResponse.json(
      { error: "Нет доступного подразделения" },
      { status: 403 }
    );
  }
  if (!isAdminOrAbove(member.role) && !division.isManager) {
    return NextResponse.json(
      {
        error:
          "Отпуск назначает руководитель подразделения или администратор",
      },
      { status: 403 }
    );
  }

  const parsed = createVacationSchema.safeParse(
    await request.json().catch(() => null)
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Ошибка проверки данных", details: parsed.error.issues },
      { status: 400 }
    );
  }

  const { userId, year, dateFrom, dateTo, note } = parsed.data;
  const targetMember = await db.divisionMember.findUnique({
    where: { divisionId_userId: { divisionId: division.id, userId } },
  });
  if (!targetMember) {
    return NextResponse.json(
      { error: "Сотрудник не состоит в выбранном подразделении" },
      { status: 404 }
    );
  }

  try {
    const from = parseDateOnly(dateFrom);
    const to = parseDateOnly(dateTo);
    assertPeriodInsideYear(from, to, year);
    const requestedDays = countWorkingDays(from, to);
    if (requestedDays === 0) {
      throw new Error("Выбранный период не содержит рабочих дней");
    }

    const overlapping = await db.absence.findFirst({
      where: {
        userId,
        status: { not: "DECLINED" },
        dateFrom: { lte: to },
        dateTo: { gte: from },
      },
      select: { id: true },
    });
    if (overlapping) {
      throw new Error(
        "В выбранном периоде уже есть отпуск или другое отсутствие"
      );
    }

    const vacationCategoryIds = await getVacationCategoryIds(
      member.organizationId
    );
    const existingVacations = vacationCategoryIds.length
      ? await db.absence.findMany({
          where: {
            userId,
            categoryId: { in: vacationCategoryIds },
            status: "APPROVED",
            dateFrom: { lte: yearEnd(year) },
            dateTo: { gte: yearStart(year) },
          },
          select: { dateFrom: true, dateTo: true },
        })
      : [];
    const usedDays = existingVacations.reduce(
      (total, vacation) =>
        total +
        countWorkingDays(
          vacation.dateFrom,
          vacation.dateTo,
          yearStart(year),
          yearEnd(year)
        ),
      0
    );
    const allowanceDays = await getAllowance(
      member.organizationId,
      userId,
      year
    );
    if (usedDays + requestedDays > allowanceDays) {
      throw new Error(
        `Недостаточно дней отпуска: доступно ${Math.max(
          allowanceDays - usedDays,
          0
        )}, требуется ${requestedDays}`
      );
    }

    const result = await db.$transaction(async (tx) => {
      const category = await getOrCreateVacationCategory(
        tx,
        member.organizationId
      );
      const scheduleIds = await clearScheduleCellsForPeriod(
        tx,
        member.organizationId,
        division.id,
        userId,
        from,
        to
      );
      const vacation = await tx.absence.create({
        data: {
          userId,
          categoryId: category.id,
          dateFrom: from,
          dateTo: to,
          note: note || null,
          status: "APPROVED",
        },
      });
      return { vacation, scheduleIds };
    });

    const event = {
      divisionId: division.id,
      action: "vacation_created",
      userId,
      absenceId: result.vacation.id,
    };
    emitToOrg(member.organizationId, "schedule:updated", event);
    for (const scheduleId of result.scheduleIds) {
      emitToSchedule(scheduleId, "schedule:updated", {
        ...event,
        scheduleId,
      });
    }

    return NextResponse.json(
      {
        vacation: {
          ...result.vacation,
          workingDays: requestedDays,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Не удалось добавить отпуск",
      },
      { status: 409 }
    );
  }
}

const updateAllowanceSchema = z.object({
  userId: z.string().uuid(),
  year: z.number().int().min(2000).max(2100),
  days: z.number().int().min(0).max(366),
});

export async function PUT(request: NextRequest) {
  const member = await getCurrentMember();
  if (!member) {
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  }

  const division = await getSelectedDivision(
    request,
    member.userId,
    member.organizationId
  );
  if (!division) {
    return NextResponse.json(
      { error: "Нет доступного подразделения" },
      { status: 403 }
    );
  }
  if (!isAdminOrAbove(member.role) && !division.isManager) {
    return NextResponse.json(
      {
        error:
          "Изменять лимит может руководитель подразделения или администратор",
      },
      { status: 403 }
    );
  }

  const parsed = updateAllowanceSchema.safeParse(
    await request.json().catch(() => null)
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Ошибка проверки данных", details: parsed.error.issues },
      { status: 400 }
    );
  }

  const { userId, year, days } = parsed.data;
  const targetMember = await db.divisionMember.findUnique({
    where: { divisionId_userId: { divisionId: division.id, userId } },
  });
  if (!targetMember) {
    return NextResponse.json(
      { error: "Сотрудник не состоит в выбранном подразделении" },
      { status: 404 }
    );
  }

  await ensureVacationAllowanceTable();
  await db.$executeRaw`
    INSERT INTO schedule."vacation_allowances"
      ("organizationId", "userId", "year", "days", "updatedById", "createdAt", "updatedAt")
    VALUES
      (CAST(${member.organizationId} AS uuid), CAST(${userId} AS uuid), ${year}, ${days}, CAST(${member.userId} AS uuid), CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ON CONFLICT ("organizationId", "userId", "year")
    DO UPDATE SET
      "days" = EXCLUDED."days",
      "updatedById" = EXCLUDED."updatedById",
      "updatedAt" = CURRENT_TIMESTAMP
  `;

  return NextResponse.json({ userId, year, days });
}
