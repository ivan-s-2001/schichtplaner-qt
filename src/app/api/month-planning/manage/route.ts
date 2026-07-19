import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  ensurePlanningPeriod,
  findPlanningPeriod,
  loadShiftPoolTemplates,
  parsePlanningMonth,
  requireMonthPlanningAccess,
  toPlanningPeriod,
} from "@/lib/month-planning";
import type {
  MonthPlanningAssignment,
  MonthPlanningMember,
  MonthPreference,
  MonthPreferenceItem,
} from "@/types/month-planning";

const updateSchema = z.object({
  periodId: z.string().min(1),
  status: z
    .enum(["COLLECTING_PREFERENCES", "PLANNING", "CLOSED"])
    .optional(),
  preferenceDeadline: z.string().datetime().nullable().optional(),
});

type MemberRow = MonthPlanningMember;
type PreferenceRow = {
  id: string;
  userId: string;
  comment: string | null;
  submittedAt: Date | null;
};
type PreferenceItemRow = {
  id: string;
  preferenceId: string;
  workDate: Date | string;
  kind: "PREFERRED" | "UNAVAILABLE";
  shiftTemplateCode: string | null;
};
type AssignmentRow = {
  id: string;
  userId: string;
  workDate: Date | string;
  shiftTemplateCode: string;
  updatedAt: Date;
};

function dateValue(value: Date | string) {
  return typeof value === "string" ? value.slice(0, 10) : value.toISOString().slice(0, 10);
}

export async function GET(request: NextRequest) {
  const access = await requireMonthPlanningAccess(request, true);
  if ("error" in access) return access.error;

  const target = parsePlanningMonth(request.nextUrl.searchParams);
  if (!target) {
    return NextResponse.json({ error: "Некорректный месяц" }, { status: 400 });
  }

  const period = await ensurePlanningPeriod({
    organizationId: access.member.organizationId,
    divisionId: access.division.id,
    userId: access.member.userId,
    year: target.year,
    month: target.month,
  });
  const templates = await loadShiftPoolTemplates(access.member.organizationId);

  const [members, preferenceRows, itemRows, assignmentRows] = await Promise.all([
    db.$queryRaw<MemberRow[]>`
      SELECT
        u."id"::text AS "id",
        u."firstName" AS "firstName",
        u."lastName" AS "lastName",
        u."patronymic" AS "patronymic",
        u."profileImage" AS "profileImage",
        om."role"::text AS "role"
      FROM schedule."division_members" dm
      INNER JOIN schedule."users" u ON u."id" = dm."userId"
      INNER JOIN schedule."organization_members" om
        ON om."userId" = dm."userId"
        AND om."organizationId" = CAST(${access.member.organizationId} AS uuid)
      WHERE dm."divisionId" = CAST(${access.division.id} AS uuid)
        AND om."isActive" = true
        AND om."role"::text <> 'OWNER'
      ORDER BY u."lastName" ASC, u."firstName" ASC, u."patronymic" ASC NULLS LAST
    `,
    db.$queryRaw<PreferenceRow[]>`
      SELECT "id", "userId", "comment", "submittedAt"
      FROM schedule.month_planning_preferences
      WHERE "periodId" = ${period.id}
      ORDER BY "updatedAt" DESC
    `,
    db.$queryRaw<PreferenceItemRow[]>`
      SELECT item."id", item."preferenceId", item."workDate", item."kind",
             item."shiftTemplateCode"
      FROM schedule.month_planning_preference_items item
      INNER JOIN schedule.month_planning_preferences preference
        ON preference."id" = item."preferenceId"
      WHERE preference."periodId" = ${period.id}
      ORDER BY item."workDate" ASC, item."createdAt" ASC
    `,
    db.$queryRaw<AssignmentRow[]>`
      SELECT "id", "userId", "workDate", "shiftTemplateCode", "updatedAt"
      FROM schedule.month_planning_assignments
      WHERE "periodId" = ${period.id}
      ORDER BY "workDate" ASC, "createdAt" ASC
    `,
  ]);

  const itemsByPreference = new Map<string, MonthPreferenceItem[]>();
  for (const item of itemRows) {
    const list = itemsByPreference.get(item.preferenceId) ?? [];
    list.push({
      id: item.id,
      workDate: dateValue(item.workDate),
      kind: item.kind,
      shiftTemplateCode: item.shiftTemplateCode,
    });
    itemsByPreference.set(item.preferenceId, list);
  }

  const preferences: MonthPreference[] = preferenceRows.map((preference) => ({
    id: preference.id,
    userId: preference.userId,
    comment: preference.comment,
    submittedAt: preference.submittedAt?.toISOString() ?? null,
    items: itemsByPreference.get(preference.id) ?? [],
  }));

  const assignments: MonthPlanningAssignment[] = assignmentRows.map((assignment) => ({
    id: assignment.id,
    userId: assignment.userId,
    workDate: dateValue(assignment.workDate),
    shiftTemplateCode: assignment.shiftTemplateCode,
    updatedAt: assignment.updatedAt.toISOString(),
  }));

  return NextResponse.json({
    period: toPlanningPeriod(period),
    templates,
    members,
    preferences,
    assignments,
  });
}

export async function PATCH(request: NextRequest) {
  const access = await requireMonthPlanningAccess(request, true);
  if ("error" in access) return access.error;

  const parsed = updateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Ошибка проверки данных", details: parsed.error.issues },
      { status: 400 }
    );
  }

  const currentRows = await db.$queryRaw<{ id: string; status: string }[]>`
    SELECT "id", "status"::text AS "status"
    FROM schedule.month_planning_periods
    WHERE "id" = ${parsed.data.periodId}
      AND "organizationId" = CAST(${access.member.organizationId} AS uuid)
      AND "divisionId" = CAST(${access.division.id} AS uuid)
    LIMIT 1
  `;
  if (!currentRows[0]) {
    return NextResponse.json({ error: "Период не найден" }, { status: 404 });
  }
  if (currentRows[0].status === "PUBLISHED") {
    return NextResponse.json(
      { error: "Опубликованный период нельзя вернуть в черновик" },
      { status: 409 }
    );
  }

  const status = parsed.data.status ?? null;
  const deadline =
    parsed.data.preferenceDeadline === undefined
      ? undefined
      : parsed.data.preferenceDeadline
        ? new Date(parsed.data.preferenceDeadline)
        : null;

  await db.$executeRaw`
    UPDATE schedule.month_planning_periods
    SET
      "status" = COALESCE(
        CAST(${status} AS schedule."MonthPlanningStatus"),
        "status"
      ),
      "preferenceDeadline" = CASE
        WHEN ${deadline === undefined} THEN "preferenceDeadline"
        ELSE ${deadline ?? null}
      END,
      "updatedAt" = CURRENT_TIMESTAMP
    WHERE "id" = ${parsed.data.periodId}
  `;

  const period = await findPlanningPeriod(
    access.division.id,
    Number(request.nextUrl.searchParams.get("year") ?? 0),
    Number(request.nextUrl.searchParams.get("month") ?? 0)
  );

  const updatedRows = await db.$queryRaw<Parameters<typeof toPlanningPeriod>[0][]>`
    SELECT
      "id", "organizationId", "divisionId", "year", "month", "status",
      "preferenceDeadline", "publishedAt", "createdAt", "updatedAt"
    FROM schedule.month_planning_periods
    WHERE "id" = ${parsed.data.periodId}
    LIMIT 1
  `;

  return NextResponse.json({
    period: updatedRows[0] ? toPlanningPeriod(updatedRows[0]) : period,
  });
}
