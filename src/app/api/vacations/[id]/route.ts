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
  getVacationCategoryIds,
  isVacationCategoryName,
  parseDateOnly,
  yearEnd,
  yearStart,
} from "@/lib/vacation";

type AllowanceRow = { days: number };

const updateVacationSchema = z.object({
  year: z.number().int().min(2000).max(2100),
  dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  note: z.string().trim().max(500).nullable().optional(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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
    return NextResponse.json({ error: "Нет доступного подразделения" }, { status: 403 });
  }
  if (!isAdminOrAbove(member.role) && !division.isManager) {
    return NextResponse.json(
      { error: "Отпуск изменяет руководитель подразделения или администратор" },
      { status: 403 }
    );
  }

  const parsed = updateVacationSchema.safeParse(
    await request.json().catch(() => null)
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Ошибка проверки данных", details: parsed.error.issues },
      { status: 400 }
    );
  }

  const { id } = await params;
  const absence = await db.absence.findUnique({
    where: { id },
    include: { category: true },
  });
  if (!absence || !isVacationCategoryName(absence.category.name)) {
    return NextResponse.json({ error: "Отпуск не найден" }, { status: 404 });
  }

  const targetMember = await db.divisionMember.findUnique({
    where: {
      divisionId_userId: {
        divisionId: division.id,
        userId: absence.userId,
      },
    },
  });
  if (!targetMember) {
    return NextResponse.json({ error: "Отпуск недоступен" }, { status: 404 });
  }

  try {
    const from = parseDateOnly(parsed.data.dateFrom);
    const to = parseDateOnly(parsed.data.dateTo);
    const year = parsed.data.year;
    assertPeriodInsideYear(from, to, year);
    const requestedDays = countWorkingDays(from, to);
    if (requestedDays === 0) {
      throw new Error("Выбранный период не содержит рабочих дней");
    }

    const overlapping = await db.absence.findFirst({
      where: {
        id: { not: id },
        userId: absence.userId,
        status: { not: "DECLINED" },
        dateFrom: { lte: to },
        dateTo: { gte: from },
      },
      select: { id: true },
    });
    if (overlapping) {
      throw new Error("В выбранном периоде уже есть отпуск или другое отсутствие");
    }

    const vacationCategoryIds = await getVacationCategoryIds(member.organizationId);
    const otherVacations = vacationCategoryIds.length
      ? await db.absence.findMany({
          where: {
            id: { not: id },
            userId: absence.userId,
            categoryId: { in: vacationCategoryIds },
            status: "APPROVED",
            dateFrom: { lte: yearEnd(year) },
            dateTo: { gte: yearStart(year) },
          },
          select: { dateFrom: true, dateTo: true },
        })
      : [];
    const usedDays = otherVacations.reduce(
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

    await ensureVacationAllowanceTable();
    const allowanceRows = await db.$queryRaw<AllowanceRow[]>`
      SELECT "days"
      FROM schedule."vacation_allowances"
      WHERE "organizationId" = CAST(${member.organizationId} AS uuid)
        AND "userId" = CAST(${absence.userId} AS uuid)
        AND "year" = ${year}
      LIMIT 1
    `;
    const allowanceDays = allowanceRows[0]?.days ?? DEFAULT_VACATION_DAYS;
    if (usedDays + requestedDays > allowanceDays) {
      throw new Error(
        `Недостаточно дней отпуска: доступно ${Math.max(
          allowanceDays - usedDays,
          0
        )}, требуется ${requestedDays}`
      );
    }

    const result = await db.$transaction(async (tx) => {
      const scheduleIds = await clearScheduleCellsForPeriod(
        tx,
        member.organizationId,
        division.id,
        absence.userId,
        from,
        to
      );
      const vacation = await tx.absence.update({
        where: { id },
        data: {
          dateFrom: from,
          dateTo: to,
          note: parsed.data.note?.trim() || null,
          status: "APPROVED",
        },
      });
      return { vacation, scheduleIds };
    });

    const event = {
      divisionId: division.id,
      action: "vacation_updated",
      userId: absence.userId,
      absenceId: id,
    };
    emitToOrg(member.organizationId, "schedule:updated", event);
    for (const scheduleId of result.scheduleIds) {
      emitToSchedule(scheduleId, "schedule:updated", {
        ...event,
        scheduleId,
      });
    }

    return NextResponse.json({
      vacation: { ...result.vacation, workingDays: requestedDays },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Не удалось изменить отпуск",
      },
      { status: 409 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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
    return NextResponse.json({ error: "Нет доступного подразделения" }, { status: 403 });
  }
  if (!isAdminOrAbove(member.role) && !division.isManager) {
    return NextResponse.json(
      { error: "Отпуск удаляет руководитель подразделения или администратор" },
      { status: 403 }
    );
  }

  const { id } = await params;
  const absence = await db.absence.findUnique({
    where: { id },
    include: { category: true },
  });
  if (!absence || !isVacationCategoryName(absence.category.name)) {
    return NextResponse.json({ error: "Отпуск не найден" }, { status: 404 });
  }

  const targetMember = await db.divisionMember.findUnique({
    where: {
      divisionId_userId: {
        divisionId: division.id,
        userId: absence.userId,
      },
    },
  });
  if (!targetMember) {
    return NextResponse.json({ error: "Отпуск недоступен" }, { status: 404 });
  }

  await db.absence.delete({ where: { id } });
  emitToOrg(member.organizationId, "schedule:updated", {
    divisionId: division.id,
    action: "vacation_deleted",
    userId: absence.userId,
    absenceId: id,
  });

  return NextResponse.json({ success: true });
}
