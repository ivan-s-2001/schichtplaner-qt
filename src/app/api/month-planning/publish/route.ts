import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getISODay, getISOWeek, getISOWeekYear } from "date-fns";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireMonthPlanningAccess } from "@/lib/month-planning";

const publishSchema = z.object({ periodId: z.string().min(1) });

type PublishRow = {
  userId: string;
  workDate: Date | string;
  shiftTemplateCode: string;
  shiftFrom: string;
  shiftTo: string;
  name: string;
  color: string;
  textColor: string;
  description: string | null;
};

type PeriodRow = {
  id: string;
  organizationId: string;
  divisionId: string;
  year: number;
  month: number;
  status: "COLLECTING_PREFERENCES" | "PLANNING" | "PUBLISHED" | "CLOSED";
};

function dateValue(value: Date | string) {
  return typeof value === "string" ? value.slice(0, 10) : value.toISOString().slice(0, 10);
}

export async function POST(request: NextRequest) {
  const access = await requireMonthPlanningAccess(request, true);
  if ("error" in access) return access.error;

  const parsed = publishSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Ошибка проверки данных", details: parsed.error.issues },
      { status: 400 }
    );
  }

  const periodRows = await db.$queryRaw<PeriodRow[]>`
    SELECT "id", "organizationId", "divisionId", "year", "month", "status"
    FROM schedule.month_planning_periods
    WHERE "id" = ${parsed.data.periodId}
      AND "organizationId" = CAST(${access.member.organizationId} AS uuid)
      AND "divisionId" = CAST(${access.division.id} AS uuid)
    LIMIT 1
  `;
  const period = periodRows[0];
  if (!period) {
    return NextResponse.json({ error: "Период не найден" }, { status: 404 });
  }
  if (period.status === "PUBLISHED" || period.status === "CLOSED") {
    return NextResponse.json(
      { error: "Период уже опубликован или закрыт" },
      { status: 409 }
    );
  }

  const assignments = await db.$queryRaw<PublishRow[]>`
    SELECT
      assignment."userId"::text AS "userId",
      assignment."workDate" AS "workDate",
      assignment."shiftTemplateCode" AS "shiftTemplateCode",
      template."shiftFrom" AS "shiftFrom",
      template."shiftTo" AS "shiftTo",
      template."name" AS "name",
      template."color" AS "color",
      template."textColor" AS "textColor",
      template."description" AS "description"
    FROM schedule.month_planning_assignments assignment
    INNER JOIN schedule."shift_pool_templates" template
      ON template."organizationId" = CAST(${access.member.organizationId} AS uuid)
      AND template."code" = assignment."shiftTemplateCode"
    WHERE assignment."periodId" = ${period.id}
      AND template."isActive" = true
    ORDER BY assignment."workDate" ASC, template."sortOrder" ASC
  `;

  if (assignments.length === 0) {
    return NextResponse.json(
      { error: "В месячном плане пока нет назначений" },
      { status: 409 }
    );
  }

  const groups = new Map<string, { template: PublishRow; users: string[]; workDate: string }>();
  for (const assignment of assignments) {
    const workDate = dateValue(assignment.workDate);
    const key = `${workDate}:${assignment.shiftTemplateCode}`;
    const group = groups.get(key) ?? {
      template: assignment,
      users: [],
      workDate,
    };
    group.users.push(assignment.userId);
    groups.set(key, group);
  }

  const result = await db.$transaction(async (tx) => {
    const scheduleIds = new Set<string>();
    let bookingCount = 0;
    let shiftCount = 0;

    for (const group of groups.values()) {
      const date = new Date(`${group.workDate}T12:00:00.000Z`);
      const weekNumber = getISOWeek(date);
      const year = getISOWeekYear(date);
      const dayOfWeek = getISODay(date);

      let schedule = await tx.schedule.findFirst({
        where: {
          organizationId: access.member.organizationId,
          divisionId: access.division.id,
          weekNumber,
          year,
          branchId: null,
          deletedAt: null,
        },
      });
      if (!schedule) {
        schedule = await tx.schedule.create({
          data: {
            organizationId: access.member.organizationId,
            divisionId: access.division.id,
            weekNumber,
            year,
            isPublic: false,
          },
        });
      }
      scheduleIds.add(schedule.id);

      let shift = await tx.shift.findFirst({
        where: {
          scheduleId: schedule.id,
          divisionId: access.division.id,
          dayOfWeek,
          poolTemplateCode: group.template.shiftTemplateCode,
          deletedAt: null,
        },
      });
      if (!shift) {
        shift = await tx.shift.create({
          data: {
            scheduleId: schedule.id,
            divisionId: access.division.id,
            dayOfWeek,
            shiftFrom: group.template.shiftFrom,
            shiftTo: group.template.shiftTo,
            maxEmployees: group.users.length,
            poolTemplateCode: group.template.shiftTemplateCode,
            poolLabel: group.template.name,
            poolColor: group.template.color,
            poolTextColor: group.template.textColor,
            poolDescription: group.template.description,
            title: `pool:${group.template.shiftTemplateCode}`,
            description: group.template.description,
          },
        });
        shiftCount += 1;
      } else {
        shift = await tx.shift.update({
          where: { id: shift.id },
          data: {
            shiftFrom: group.template.shiftFrom,
            shiftTo: group.template.shiftTo,
            maxEmployees: Math.max(shift.maxEmployees, group.users.length),
            poolLabel: group.template.name,
            poolColor: group.template.color,
            poolTextColor: group.template.textColor,
            poolDescription: group.template.description,
          },
        });
      }

      const dayShifts = await tx.shift.findMany({
        where: {
          scheduleId: schedule.id,
          divisionId: access.division.id,
          dayOfWeek,
          deletedAt: null,
        },
        select: { id: true },
      });
      const dayShiftIds = dayShifts.map((item) => item.id);

      for (const userId of group.users) {
        if (dayShiftIds.length > 0) {
          await tx.booking.deleteMany({
            where: { userId, shiftId: { in: dayShiftIds } },
          });
        }
        await tx.booking.create({
          data: {
            id: randomUUID(),
            shiftId: shift.id,
            userId,
            bookedBy: access.member.userId,
          },
        });
        bookingCount += 1;
      }
    }

    if (scheduleIds.size > 0) {
      await tx.schedule.updateMany({
        where: { id: { in: [...scheduleIds] } },
        data: { isPublic: true },
      });
    }

    await tx.$executeRaw`
      UPDATE schedule.month_planning_periods
      SET
        "status" = 'PUBLISHED',
        "publishedAt" = CURRENT_TIMESTAMP,
        "updatedAt" = CURRENT_TIMESTAMP
      WHERE "id" = ${period.id}
    `;

    return {
      schedules: scheduleIds.size,
      shiftsCreated: shiftCount,
      bookingsCreated: bookingCount,
    };
  });

  return NextResponse.json({ success: true, result });
}
