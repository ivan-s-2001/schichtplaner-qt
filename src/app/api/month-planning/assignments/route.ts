import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { isDateInPlanningMonth, requireMonthPlanningAccess } from "@/lib/month-planning";

const assignmentSchema = z.object({
  periodId: z.string().min(1),
  userId: z.string().uuid(),
  workDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  shiftTemplateCode: z.string().min(1),
});

const deleteSchema = assignmentSchema.omit({ shiftTemplateCode: true });

type PeriodRow = {
  id: string;
  year: number;
  month: number;
  status: "COLLECTING_PREFERENCES" | "PLANNING" | "PUBLISHED" | "CLOSED";
};

async function loadPeriod(
  periodId: string,
  organizationId: string,
  divisionId: string
) {
  const rows = await db.$queryRaw<PeriodRow[]>`
    SELECT "id", "year", "month", "status"
    FROM schedule.month_planning_periods
    WHERE "id" = ${periodId}
      AND "organizationId" = CAST(${organizationId} AS uuid)
      AND "divisionId" = CAST(${divisionId} AS uuid)
    LIMIT 1
  `;
  return rows[0] ?? null;
}

export async function PUT(request: NextRequest) {
  const access = await requireMonthPlanningAccess(request, true);
  if ("error" in access) return access.error;

  const parsed = assignmentSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Ошибка проверки данных", details: parsed.error.issues },
      { status: 400 }
    );
  }

  const values = parsed.data;
  const period = await loadPeriod(
    values.periodId,
    access.member.organizationId,
    access.division.id
  );
  if (!period) {
    return NextResponse.json({ error: "Период не найден" }, { status: 404 });
  }
  if (period.status === "PUBLISHED" || period.status === "CLOSED") {
    return NextResponse.json(
      { error: "Период уже закрыт для изменений" },
      { status: 409 }
    );
  }
  if (!isDateInPlanningMonth(values.workDate, period.year, period.month)) {
    return NextResponse.json(
      { error: "Дата находится вне периода планирования" },
      { status: 400 }
    );
  }

  const [memberRows, templateRows] = await Promise.all([
    db.$queryRaw<{ userId: string }[]>`
      SELECT "userId"::text AS "userId"
      FROM schedule."division_members"
      WHERE "divisionId" = CAST(${access.division.id} AS uuid)
        AND "userId" = CAST(${values.userId} AS uuid)
      LIMIT 1
    `,
    db.$queryRaw<{ code: string }[]>`
      SELECT "code"
      FROM schedule."shift_pool_templates"
      WHERE "organizationId" = CAST(${access.member.organizationId} AS uuid)
        AND "code" = ${values.shiftTemplateCode}
        AND "isActive" = true
      LIMIT 1
    `,
  ]);
  if (!memberRows[0]) {
    return NextResponse.json(
      { error: "Сотрудник не состоит в выбранном подразделении" },
      { status: 409 }
    );
  }
  if (!templateRows[0]) {
    return NextResponse.json({ error: "Смена не найдена" }, { status: 404 });
  }

  const rows = await db.$queryRaw<{
    id: string;
    userId: string;
    workDate: Date | string;
    shiftTemplateCode: string;
    updatedAt: Date;
  }[]>`
    INSERT INTO schedule.month_planning_assignments (
      "id", "periodId", "userId", "workDate", "shiftTemplateCode",
      "createdById", "createdAt", "updatedAt"
    ) VALUES (
      ${randomUUID()}, ${period.id}, CAST(${values.userId} AS uuid),
      CAST(${values.workDate} AS date), ${values.shiftTemplateCode},
      CAST(${access.member.userId} AS uuid), CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
    )
    ON CONFLICT ("periodId", "userId", "workDate") DO UPDATE SET
      "shiftTemplateCode" = EXCLUDED."shiftTemplateCode",
      "createdById" = EXCLUDED."createdById",
      "updatedAt" = CURRENT_TIMESTAMP
    RETURNING "id", "userId", "workDate", "shiftTemplateCode", "updatedAt"
  `;

  const assignment = rows[0];
  return NextResponse.json({
    assignment: {
      ...assignment,
      workDate:
        typeof assignment.workDate === "string"
          ? assignment.workDate.slice(0, 10)
          : assignment.workDate.toISOString().slice(0, 10),
      updatedAt: assignment.updatedAt.toISOString(),
    },
  });
}

export async function DELETE(request: NextRequest) {
  const access = await requireMonthPlanningAccess(request, true);
  if ("error" in access) return access.error;

  const parsed = deleteSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Ошибка проверки данных", details: parsed.error.issues },
      { status: 400 }
    );
  }

  const values = parsed.data;
  const period = await loadPeriod(
    values.periodId,
    access.member.organizationId,
    access.division.id
  );
  if (!period) {
    return NextResponse.json({ error: "Период не найден" }, { status: 404 });
  }
  if (period.status === "PUBLISHED" || period.status === "CLOSED") {
    return NextResponse.json(
      { error: "Период уже закрыт для изменений" },
      { status: 409 }
    );
  }

  await db.$executeRaw`
    DELETE FROM schedule.month_planning_assignments
    WHERE "periodId" = ${period.id}
      AND "userId" = CAST(${values.userId} AS uuid)
      AND "workDate" = CAST(${values.workDate} AS date)
  `;

  return NextResponse.json({ success: true });
}
