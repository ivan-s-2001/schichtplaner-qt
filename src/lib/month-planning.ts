import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentMember, isAdminOrAbove } from "@/lib/auth-helpers";
import { getSelectedDivision } from "@/lib/selected-division";
import {
  DEFAULT_SHIFT_POOL,
  type ShiftTemplate,
} from "@/lib/schedule/shift-pool";
import type {
  MonthPlanningPeriod,
  MonthPlanningStatus,
} from "@/types/month-planning";

export type MonthPlanningPeriodRow = {
  id: string;
  organizationId: string;
  divisionId: string;
  year: number;
  month: number;
  status: MonthPlanningStatus;
  preferenceDeadline: Date | null;
  publishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

type ShiftPoolRow = {
  code: string;
  name: string;
  shiftFrom: string;
  shiftTo: string;
  color: string;
  textColor: string;
  description: string | null;
  sortOrder: number;
  isActive: boolean;
};

export function getDefaultPlanningMonth() {
  const now = new Date();
  const target = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return { year: target.getUTCFullYear(), month: target.getUTCMonth() + 1 };
}

export function parsePlanningMonth(searchParams: URLSearchParams) {
  const fallback = getDefaultPlanningMonth();
  const year = Number(searchParams.get("year") ?? fallback.year);
  const month = Number(searchParams.get("month") ?? fallback.month);

  if (!Number.isInteger(year) || year < 2000 || year > 2100) return null;
  if (!Number.isInteger(month) || month < 1 || month > 12) return null;

  return { year, month };
}

export function getMonthBounds(year: number, month: number) {
  return {
    start: `${year}-${String(month).padStart(2, "0")}-01`,
    end: `${year}-${String(month).padStart(2, "0")}-${String(
      new Date(Date.UTC(year, month, 0)).getUTCDate()
    ).padStart(2, "0")}`,
  };
}

export function isDateInPlanningMonth(value: string, year: number, month: number) {
  const bounds = getMonthBounds(year, month);
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && value >= bounds.start && value <= bounds.end;
}

export function getDefaultPreferenceDeadline(year: number, month: number) {
  return new Date(Date.UTC(year, month - 2, 20, 20, 59, 59, 999));
}

export function toPlanningPeriod(row: MonthPlanningPeriodRow): MonthPlanningPeriod {
  return {
    ...row,
    preferenceDeadline: row.preferenceDeadline?.toISOString() ?? null,
    publishedAt: row.publishedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function requireMonthPlanningAccess(
  request: NextRequest,
  managerOnly = false
) {
  const member = await getCurrentMember();
  if (!member) {
    return {
      error: NextResponse.json({ error: "Не авторизован" }, { status: 401 }),
    };
  }

  const division = await getSelectedDivision(
    request,
    member.userId,
    member.organizationId
  );
  if (!division) {
    return {
      error: NextResponse.json(
        { error: "Нет доступного подразделения" },
        { status: 403 }
      ),
    };
  }
  if (division.scheduleMode !== "SHIFT") {
    return {
      error: NextResponse.json(
        { error: "Планирование месяца доступно только сменному подразделению" },
        { status: 409 }
      ),
    };
  }

  const canManage = isAdminOrAbove(member.role) || division.isManager;
  if (managerOnly && !canManage) {
    return {
      error: NextResponse.json(
        { error: "Планирование месяца доступно только руководителю" },
        { status: 403 }
      ),
    };
  }

  return { member, division, canManage };
}

export async function ensureShiftPoolTemplates(organizationId: string) {
  const existing = await db.$queryRaw<{ count: bigint }[]>`
    SELECT COUNT(*) AS "count"
    FROM schedule."shift_pool_templates"
    WHERE "organizationId" = CAST(${organizationId} AS uuid)
  `;
  if (Number(existing[0]?.count ?? 0) > 0) return;

  await db.$transaction(async (tx) => {
    for (const item of DEFAULT_SHIFT_POOL) {
      await tx.$executeRaw`
        INSERT INTO schedule."shift_pool_templates" (
          "id", "organizationId", "code", "name", "shiftFrom", "shiftTo",
          "color", "textColor", "description", "sortOrder", "isActive",
          "createdAt", "updatedAt"
        ) VALUES (
          ${`${organizationId}:${item.id}`}, CAST(${organizationId} AS uuid),
          ${item.id}, ${item.name}, ${item.shiftFrom}, ${item.shiftTo},
          ${item.color}, ${item.textColor}, ${item.description}, ${item.sortOrder},
          true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
        )
        ON CONFLICT ("organizationId", "code") DO NOTHING
      `;
    }
  });
}

export async function loadShiftPoolTemplates(
  organizationId: string,
  includeInactive = false
): Promise<ShiftTemplate[]> {
  await ensureShiftPoolTemplates(organizationId);

  const rows = includeInactive
    ? await db.$queryRaw<ShiftPoolRow[]>`
        SELECT
          "code", "name", "shiftFrom", "shiftTo", "color", "textColor",
          "description", "sortOrder", "isActive"
        FROM schedule."shift_pool_templates"
        WHERE "organizationId" = CAST(${organizationId} AS uuid)
        ORDER BY "sortOrder" ASC, "createdAt" ASC
      `
    : await db.$queryRaw<ShiftPoolRow[]>`
        SELECT
          "code", "name", "shiftFrom", "shiftTo", "color", "textColor",
          "description", "sortOrder", "isActive"
        FROM schedule."shift_pool_templates"
        WHERE "organizationId" = CAST(${organizationId} AS uuid)
          AND "isActive" = true
        ORDER BY "sortOrder" ASC, "createdAt" ASC
      `;

  return rows.map((row) => ({
    id: row.code,
    name: row.name,
    label: `${row.shiftFrom}–${row.shiftTo}`,
    shiftFrom: row.shiftFrom,
    shiftTo: row.shiftTo,
    color: row.color,
    textColor: row.textColor,
    description: row.description,
    sortOrder: row.sortOrder,
    isActive: row.isActive,
  }));
}

export async function findPlanningPeriod(
  divisionId: string,
  year: number,
  month: number
) {
  const rows = await db.$queryRaw<MonthPlanningPeriodRow[]>`
    SELECT
      "id", "organizationId", "divisionId", "year", "month", "status",
      "preferenceDeadline", "publishedAt", "createdAt", "updatedAt"
    FROM schedule.month_planning_periods
    WHERE "divisionId" = CAST(${divisionId} AS uuid)
      AND "year" = ${year}
      AND "month" = ${month}
    LIMIT 1
  `;
  return rows[0] ?? null;
}

export async function ensurePlanningPeriod(input: {
  organizationId: string;
  divisionId: string;
  userId: string;
  year: number;
  month: number;
}) {
  const existing = await findPlanningPeriod(input.divisionId, input.year, input.month);
  if (existing) return existing;

  const id = randomUUID();
  const deadline = getDefaultPreferenceDeadline(input.year, input.month);
  await db.$executeRaw`
    INSERT INTO schedule.month_planning_periods (
      "id", "organizationId", "divisionId", "year", "month", "status",
      "preferenceDeadline", "createdById", "createdAt", "updatedAt"
    ) VALUES (
      ${id}, CAST(${input.organizationId} AS uuid), CAST(${input.divisionId} AS uuid),
      ${input.year}, ${input.month}, 'COLLECTING_PREFERENCES', ${deadline},
      CAST(${input.userId} AS uuid), CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
    )
    ON CONFLICT ("divisionId", "year", "month") DO NOTHING
  `;

  const created = await findPlanningPeriod(input.divisionId, input.year, input.month);
  if (!created) throw new Error("Не удалось создать период планирования");
  return created;
}
