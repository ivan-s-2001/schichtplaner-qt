import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentMember, isAdminOrAbove } from "@/lib/auth-helpers";
import { getSelectedDivision } from "@/lib/selected-division";

const entrySchema = z.object({
  divisionId: z.string().uuid(),
  userId: z.string().uuid().optional(),
  workDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  kind: z.enum([
    "OVERTIME",
    "SHORTENING",
    "BALANCE_USE",
    "ADMIN_LEAVE",
    "MANUAL_ADJUSTMENT",
  ]),
  minutes: z.number().int().min(-1440).max(1440),
  note: z.string().trim().max(1000).nullable().optional(),
});

type DivisionRow = {
  id: string;
  managerUserId: string | null;
};

type BalanceEntryRow = {
  id: string;
  userId: string;
  userName: string;
  workDate: string;
  kind:
    | "OVERTIME"
    | "SHORTENING"
    | "BALANCE_USE"
    | "ADMIN_LEAVE"
    | "MANUAL_ADJUSTMENT";
  minutes: number;
  note: string | null;
  state: "PENDING" | "APPROVED" | "DECLINED";
  createdAt: string;
  createdByName: string;
};

async function getDivision(
  organizationId: string,
  divisionId: string
): Promise<DivisionRow | null> {
  const rows = await db.$queryRaw<DivisionRow[]>`
    SELECT
      d."id"::text AS "id",
      d."managerUserId"::text AS "managerUserId"
    FROM schedule."divisions" d
    WHERE d."id"=CAST(${divisionId} AS uuid)
      AND d."organizationId"=CAST(${organizationId} AS uuid)
      AND d."deletedAt" IS NULL
    LIMIT 1
  `;
  return rows[0] ?? null;
}

async function isDivisionMember(divisionId: string, userId: string) {
  const rows = await db.$queryRaw<Array<{ exists: boolean }>>`
    SELECT EXISTS(
      SELECT 1
      FROM schedule."division_members"
      WHERE "divisionId"=CAST(${divisionId} AS uuid)
        AND "userId"=CAST(${userId} AS uuid)
    ) AS "exists"
  `;
  return rows[0]?.exists === true;
}

async function approvedBalance(divisionId: string, userId: string) {
  const rows = await db.$queryRaw<Array<{ minutes: number }>>`
    SELECT COALESCE(SUM("minutes"), 0)::int AS "minutes"
    FROM schedule."time_balance_entries"
    WHERE "divisionId"=CAST(${divisionId} AS uuid)
      AND "userId"=CAST(${userId} AS uuid)
      AND "state"='APPROVED'
  `;
  return rows[0]?.minutes ?? 0;
}

function normalizedMinutes(
  kind: z.infer<typeof entrySchema>["kind"],
  minutes: number,
  canManage: boolean
) {
  const absolute = Math.abs(minutes);
  switch (kind) {
    case "OVERTIME":
      return absolute;
    case "SHORTENING":
    case "BALANCE_USE":
      return -absolute;
    case "ADMIN_LEAVE":
      return 0;
    case "MANUAL_ADJUSTMENT":
      if (!canManage) return null;
      return minutes;
  }
}

export async function GET(request: NextRequest) {
  const member = await getCurrentMember();
  if (!member) {
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  }

  const divisionId = request.nextUrl.searchParams.get("divisionId");
  if (!divisionId) {
    return NextResponse.json(
      { error: "Не указано подразделение" },
      { status: 400 }
    );
  }

  const division = await getDivision(member.organizationId, divisionId);
  if (!division) {
    return NextResponse.json(
      { error: "Подразделение не найдено" },
      { status: 404 }
    );
  }

  const canManage =
    isAdminOrAbove(member.role) || division.managerUserId === member.userId;
  const requestedUserId = request.nextUrl.searchParams.get("userId");
  const targetUserId = canManage && requestedUserId
    ? requestedUserId
    : member.userId;

  if (!(await isDivisionMember(divisionId, targetUserId))) {
    return NextResponse.json(
      { error: "Сотрудник не состоит в подразделении" },
      { status: 404 }
    );
  }

  const [balanceMinutes, entries] = await Promise.all([
    approvedBalance(divisionId, targetUserId),
    db.$queryRaw<BalanceEntryRow[]>`
      SELECT
        entry."id",
        entry."userId"::text AS "userId",
        employee."name" AS "userName",
        entry."workDate"::text AS "workDate",
        entry."kind"::text AS "kind",
        entry."minutes",
        entry."note",
        entry."state"::text AS "state",
        entry."createdAt"::text AS "createdAt",
        creator."name" AS "createdByName"
      FROM schedule."time_balance_entries" entry
      INNER JOIN public."users" employee ON employee."id"=entry."userId"
      INNER JOIN public."users" creator ON creator."id"=entry."createdById"
      WHERE entry."divisionId"=CAST(${divisionId} AS uuid)
        AND entry."userId"=CAST(${targetUserId} AS uuid)
      ORDER BY entry."workDate" DESC, entry."createdAt" DESC
      LIMIT 100
    `,
  ]);

  return NextResponse.json({
    userId: targetUserId,
    balanceMinutes,
    entries,
    canManage,
  });
}

export async function POST(request: NextRequest) {
  const member = await getCurrentMember();
  if (!member) {
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  }

  const parsed = entrySchema.safeParse(
    await request.json().catch(() => null)
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Некорректная операция рабочего времени" },
      { status: 400 }
    );
  }

  const input = parsed.data;
  const division = await getDivision(member.organizationId, input.divisionId);
  if (!division) {
    return NextResponse.json(
      { error: "Подразделение не найдено" },
      { status: 404 }
    );
  }

  const canManage =
    isAdminOrAbove(member.role) || division.managerUserId === member.userId;
  const targetUserId = input.userId ?? member.userId;
  if (!canManage && targetUserId !== member.userId) {
    return NextResponse.json(
      { error: "Можно изменять только собственный баланс" },
      { status: 403 }
    );
  }
  if (!(await isDivisionMember(input.divisionId, targetUserId))) {
    return NextResponse.json(
      { error: "Сотрудник не состоит в подразделении" },
      { status: 404 }
    );
  }

  const minutes = normalizedMinutes(input.kind, input.minutes, canManage);
  if (minutes === null) {
    return NextResponse.json(
      { error: "Ручную корректировку может делать только руководитель" },
      { status: 403 }
    );
  }
  if (input.kind !== "ADMIN_LEAVE" && minutes === 0) {
    return NextResponse.json(
      { error: "Количество минут должно быть больше нуля" },
      { status: 400 }
    );
  }

  if (input.kind === "BALANCE_USE") {
    const balance = await approvedBalance(input.divisionId, targetUserId);
    if (balance < Math.abs(minutes)) {
      return NextResponse.json(
        { error: "Недостаточно накопленных часов" },
        { status: 422 }
      );
    }
  }

  const id = randomUUID();
  await db.$executeRaw`
    INSERT INTO schedule."time_balance_entries"(
      "id", "userId", "divisionId", "workDate", "kind", "minutes",
      "note", "state", "createdById", "approvedById", "createdAt", "updatedAt"
    ) VALUES (
      ${id}, CAST(${targetUserId} AS uuid), CAST(${input.divisionId} AS uuid),
      CAST(${input.workDate} AS date),
      CAST(${input.kind} AS schedule."TimeBalanceEntryKind"), ${minutes},
      ${input.note ?? null}, 'APPROVED', CAST(${member.userId} AS uuid),
      CAST(${member.userId} AS uuid), CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
    )
  `;

  return NextResponse.json(
    {
      entry: { id, userId: targetUserId, minutes, kind: input.kind },
      balanceMinutes: await approvedBalance(input.divisionId, targetUserId),
    },
    { status: 201 }
  );
}
