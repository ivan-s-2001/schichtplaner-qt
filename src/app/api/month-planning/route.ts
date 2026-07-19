import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  findPlanningPeriod,
  isDateInPlanningMonth,
  loadShiftPoolTemplates,
  parsePlanningMonth,
  requireMonthPlanningAccess,
  toPlanningPeriod,
} from "@/lib/month-planning";
import type {
  MonthPreference,
  MonthPreferenceItem,
} from "@/types/month-planning";

const preferenceItemSchema = z.object({
  workDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  kind: z.enum(["PREFERRED", "UNAVAILABLE"]),
  shiftTemplateCode: z.string().min(1).nullable(),
});

const saveSchema = z
  .object({
    year: z.number().int().min(2000).max(2100),
    month: z.number().int().min(1).max(12),
    comment: z.string().trim().max(2000).nullable().default(null),
    submit: z.boolean().default(false),
    items: z.array(preferenceItemSchema).max(500),
  })
  .superRefine((value, context) => {
    const kindsByDate = new Map<string, Set<string>>();
    for (const [index, item] of value.items.entries()) {
      if (item.kind === "PREFERRED" && !item.shiftTemplateCode) {
        context.addIssue({
          code: "custom",
          path: ["items", index, "shiftTemplateCode"],
          message: "Для желательной смены нужен шаблон",
        });
      }
      if (item.kind === "UNAVAILABLE" && item.shiftTemplateCode) {
        context.addIssue({
          code: "custom",
          path: ["items", index, "shiftTemplateCode"],
          message: "Недоступный день не должен содержать смену",
        });
      }
      const kinds = kindsByDate.get(item.workDate) ?? new Set<string>();
      kinds.add(item.kind);
      kindsByDate.set(item.workDate, kinds);
    }

    for (const [workDate, kinds] of kindsByDate) {
      if (kinds.size > 1) {
        context.addIssue({
          code: "custom",
          path: ["items"],
          message: `Дата ${workDate} не может быть одновременно желательной и недоступной`,
        });
      }
    }
  });

type PreferenceRow = {
  id: string;
  userId: string;
  comment: string | null;
  submittedAt: Date | null;
};

type PreferenceItemRow = {
  id: string;
  workDate: Date | string;
  kind: "PREFERRED" | "UNAVAILABLE";
  shiftTemplateCode: string | null;
};

function dateValue(value: Date | string) {
  return typeof value === "string" ? value.slice(0, 10) : value.toISOString().slice(0, 10);
}

async function loadPreference(periodId: string, userId: string): Promise<MonthPreference | null> {
  const preferences = await db.$queryRaw<PreferenceRow[]>`
    SELECT "id", "userId", "comment", "submittedAt"
    FROM schedule.month_planning_preferences
    WHERE "periodId" = ${periodId}
      AND "userId" = CAST(${userId} AS uuid)
    LIMIT 1
  `;
  const preference = preferences[0];
  if (!preference) return null;

  const items = await db.$queryRaw<PreferenceItemRow[]>`
    SELECT "id", "workDate", "kind", "shiftTemplateCode"
    FROM schedule.month_planning_preference_items
    WHERE "preferenceId" = ${preference.id}
    ORDER BY "workDate" ASC, "createdAt" ASC
  `;

  return {
    id: preference.id,
    userId: preference.userId,
    comment: preference.comment,
    submittedAt: preference.submittedAt?.toISOString() ?? null,
    items: items.map(
      (item): MonthPreferenceItem => ({
        id: item.id,
        workDate: dateValue(item.workDate),
        kind: item.kind,
        shiftTemplateCode: item.shiftTemplateCode,
      })
    ),
  };
}

export async function GET(request: NextRequest) {
  const access = await requireMonthPlanningAccess(request);
  if ("error" in access) return access.error;

  const target = parsePlanningMonth(request.nextUrl.searchParams);
  if (!target) {
    return NextResponse.json({ error: "Некорректный месяц" }, { status: 400 });
  }

  const templates = await loadShiftPoolTemplates(access.member.organizationId);
  const period = await findPlanningPeriod(
    access.division.id,
    target.year,
    target.month
  );

  if (!period) {
    return NextResponse.json({
      period: null,
      preference: null,
      templates,
      canManage: access.canManage,
      editable: false,
    });
  }

  const preference = await loadPreference(period.id, access.member.userId);
  const editable =
    period.status === "COLLECTING_PREFERENCES" &&
    (!period.preferenceDeadline || period.preferenceDeadline.getTime() >= Date.now());

  return NextResponse.json({
    period: toPlanningPeriod(period),
    preference,
    templates,
    canManage: access.canManage,
    editable,
  });
}

export async function PUT(request: NextRequest) {
  const access = await requireMonthPlanningAccess(request);
  if ("error" in access) return access.error;

  const parsed = saveSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Ошибка проверки данных", details: parsed.error.issues },
      { status: 400 }
    );
  }

  const values = parsed.data;
  const period = await findPlanningPeriod(
    access.division.id,
    values.year,
    values.month
  );
  if (!period) {
    return NextResponse.json(
      { error: "Руководитель ещё не открыл сбор пожеланий" },
      { status: 409 }
    );
  }

  if (
    period.status !== "COLLECTING_PREFERENCES" ||
    (period.preferenceDeadline && period.preferenceDeadline.getTime() < Date.now())
  ) {
    return NextResponse.json(
      { error: "Приём пожеланий уже завершён" },
      { status: 409 }
    );
  }

  const uniqueItems = new Map<string, (typeof values.items)[number]>();
  for (const item of values.items) {
    if (!isDateInPlanningMonth(item.workDate, values.year, values.month)) {
      return NextResponse.json(
        { error: `Дата ${item.workDate} находится вне выбранного месяца` },
        { status: 400 }
      );
    }
    uniqueItems.set(
      `${item.workDate}:${item.kind}:${item.shiftTemplateCode ?? ""}`,
      item
    );
  }

  const preferredCodes = [
    ...new Set(
      [...uniqueItems.values()]
        .filter((item) => item.kind === "PREFERRED")
        .map((item) => item.shiftTemplateCode)
        .filter((value): value is string => Boolean(value))
    ),
  ];
  if (preferredCodes.length > 0) {
    const validRows = await db.$queryRaw<{ code: string }[]>`
      SELECT "code"
      FROM schedule."shift_pool_templates"
      WHERE "organizationId" = CAST(${access.member.organizationId} AS uuid)
        AND "isActive" = true
        AND "code" = ANY(${preferredCodes}::text[])
    `;
    if (validRows.length !== preferredCodes.length) {
      return NextResponse.json(
        { error: "Одна из выбранных смен больше недоступна" },
        { status: 409 }
      );
    }
  }

  const preferenceId = randomUUID();
  const savedId = await db.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<{ id: string }[]>`
      INSERT INTO schedule.month_planning_preferences (
        "id", "periodId", "userId", "comment", "submittedAt",
        "createdAt", "updatedAt"
      ) VALUES (
        ${preferenceId}, ${period.id}, CAST(${access.member.userId} AS uuid),
        ${values.comment || null},
        ${values.submit ? new Date() : null},
        CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      )
      ON CONFLICT ("periodId", "userId") DO UPDATE SET
        "comment" = EXCLUDED."comment",
        "submittedAt" = EXCLUDED."submittedAt",
        "updatedAt" = CURRENT_TIMESTAMP
      RETURNING "id"
    `;
    const id = rows[0].id;

    await tx.$executeRaw`
      DELETE FROM schedule.month_planning_preference_items
      WHERE "preferenceId" = ${id}
    `;

    for (const item of uniqueItems.values()) {
      await tx.$executeRaw`
        INSERT INTO schedule.month_planning_preference_items (
          "id", "preferenceId", "workDate", "kind", "shiftTemplateCode", "createdAt"
        ) VALUES (
          ${randomUUID()}, ${id}, CAST(${item.workDate} AS date),
          CAST(${item.kind} AS schedule."MonthPreferenceKind"),
          ${item.shiftTemplateCode}, CURRENT_TIMESTAMP
        )
      `;
    }

    return id;
  });

  const preference = await loadPreference(period.id, access.member.userId);
  return NextResponse.json({ preferenceId: savedId, preference });
}
