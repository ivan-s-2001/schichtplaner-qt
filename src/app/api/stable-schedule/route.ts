import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentMember, isAdminOrAbove } from "@/lib/auth-helpers";
import { db } from "@/lib/db";

const intervalSchema = z.object({
  kind: z.enum(["WORK", "BREAK"]).default("WORK"),
  startMinute: z.number().int().min(0).max(1439),
  endMinute: z.number().int().min(1).max(1440),
});

const daySchema = z.object({
  dayOfWeek: z.number().int().min(1).max(7),
  isWorkingDay: z.boolean(),
  targetMinutes: z.number().int().min(0).max(1440).nullable().optional(),
  intervals: z.array(intervalSchema).max(8),
});

const updateSchema = z.object({
  divisionId: z.string().uuid(),
  userId: z.string().uuid(),
  dailyTargetMinutes: z.number().int().min(0).max(1440).optional(),
  weeklyTargetMinutes: z.number().int().min(0).max(10080).optional(),
  days: z.array(daySchema).length(7),
});

type DivisionRow = {
  id: string;
  title: string;
  scheduleMode: "SHIFT" | "STABLE";
  managerUserId: string | null;
};

type MemberRow = {
  userId: string;
  name: string;
  email: string | null;
  avatarUrl: string | null;
  dailyTargetMinutes: number;
  weeklyTargetMinutes: number;
  balanceMinutes: number;
};

type WorkDayRow = {
  id: string;
  userId: string;
  dayOfWeek: number;
  isWorkingDay: boolean;
  targetMinutes: number | null;
};

type IntervalRow = {
  id: string;
  workDayId: string;
  kind: "WORK" | "BREAK";
  startMinute: number;
  endMinute: number;
  sortOrder: number;
};

async function getDivision(
  organizationId: string,
  divisionId: string
): Promise<DivisionRow | null> {
  const rows = await db.$queryRaw<DivisionRow[]>`
    SELECT
      d."id"::text AS "id",
      d."title",
      d."scheduleMode"::text AS "scheduleMode",
      d."managerUserId"::text AS "managerUserId"
    FROM schedule.divisions d
    WHERE d."id"=CAST(${divisionId} AS uuid)
      AND d."organizationId"=CAST(${organizationId} AS uuid)
      AND d."deletedAt" IS NULL
    LIMIT 1
  `;
  return rows[0] ?? null;
}

function validateIntervals(
  days: z.infer<typeof daySchema>[],
  dailyTargetMinutes: number,
  weeklyTargetMinutes: number
): string | null {
  const seenDays = new Set<number>();
  let weeklyTotal = 0;

  for (const day of days) {
    if (seenDays.has(day.dayOfWeek)) return "День недели указан повторно";
    seenDays.add(day.dayOfWeek);

    const intervals = [...day.intervals].sort(
      (left, right) => left.startMinute - right.startMinute
    );
    for (let index = 0; index < intervals.length; index++) {
      const interval = intervals[index];
      if (interval.endMinute <= interval.startMinute) {
        return "Время окончания должно быть позже времени начала";
      }
      const previous = intervals[index - 1];
      if (previous && interval.startMinute < previous.endMinute) {
        return "Рабочие интервалы и перерывы не должны пересекаться";
      }
    }

    const workMinutes = intervals
      .filter((interval) => interval.kind === "WORK")
      .reduce(
        (sum, interval) => sum + interval.endMinute - interval.startMinute,
        0
      );
    const target = day.targetMinutes ?? dailyTargetMinutes;

    if (!day.isWorkingDay && workMinutes !== 0) {
      return "В выходной день нельзя добавлять рабочие интервалы";
    }
    if (day.isWorkingDay && workMinutes !== target) {
      return `Рабочее время за день должно составлять ${target} минут`;
    }
    weeklyTotal += workMinutes;
  }

  if (seenDays.size !== 7) return "Необходимо настроить все семь дней";
  if (weeklyTotal !== weeklyTargetMinutes) {
    return `Рабочее время за неделю должно составлять ${weeklyTargetMinutes} минут`;
  }
  return null;
}

export async function GET(request: NextRequest) {
  const member = await getCurrentMember();
  if (!member) {
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  }

  const divisionId = request.nextUrl.searchParams.get("divisionId");
  if (!divisionId) {
    return NextResponse.json({ error: "Не указано подразделение" }, { status: 400 });
  }

  const division = await getDivision(member.organizationId, divisionId);
  if (!division) {
    return NextResponse.json({ error: "Подразделение не найдено" }, { status: 404 });
  }
  if (division.scheduleMode !== "STABLE") {
    return NextResponse.json({ error: "Подразделение работает по сменам" }, { status: 409 });
  }

  const [members, workDays, intervals] = await Promise.all([
    db.$queryRaw<MemberRow[]>`
      SELECT
        dm."userId"::text AS "userId",
        u."name",
        u."email",
        u."avatarUrl",
        dm."dailyTargetMinutes",
        dm."weeklyTargetMinutes",
        COALESCE(SUM(
          CASE WHEN balance."state"='APPROVED' THEN balance."minutes" ELSE 0 END
        ), 0)::int AS "balanceMinutes"
      FROM schedule.division_members dm
      INNER JOIN public.users u ON u."id"=dm."userId"
      LEFT JOIN schedule.time_balance_entries balance
        ON balance."userId"=dm."userId"
        AND balance."divisionId"=dm."divisionId"
      WHERE dm."divisionId"=CAST(${divisionId} AS uuid)
        AND u."deletedAt" IS NULL
        AND u."suspendedAt" IS NULL
      GROUP BY dm."userId", u."name", u."email", u."avatarUrl",
        dm."dailyTargetMinutes", dm."weeklyTargetMinutes"
      ORDER BY
        CASE WHEN dm."userId"=CAST(${member.userId} AS uuid) THEN 0 ELSE 1 END,
        u."name" ASC
    `,
    db.$queryRaw<WorkDayRow[]>`
      SELECT
        wd."id",
        wd."userId"::text AS "userId",
        wd."dayOfWeek",
        wd."isWorkingDay",
        wd."targetMinutes"
      FROM schedule.stable_work_days wd
      INNER JOIN schedule.division_members dm ON dm."userId"=wd."userId"
      WHERE dm."divisionId"=CAST(${divisionId} AS uuid)
      ORDER BY wd."userId", wd."dayOfWeek"
    `,
    db.$queryRaw<IntervalRow[]>`
      SELECT
        interval."id",
        interval."workDayId",
        interval."kind"::text AS "kind",
        interval."startMinute",
        interval."endMinute",
        interval."sortOrder"
      FROM schedule.stable_work_intervals interval
      INNER JOIN schedule.stable_work_days wd ON wd."id"=interval."workDayId"
      INNER JOIN schedule.division_members dm ON dm."userId"=wd."userId"
      WHERE dm."divisionId"=CAST(${divisionId} AS uuid)
      ORDER BY interval."workDayId", interval."sortOrder", interval."startMinute"
    `,
  ]);

  const intervalsByDay = new Map<string, IntervalRow[]>();
  for (const interval of intervals) {
    const list = intervalsByDay.get(interval.workDayId) ?? [];
    list.push(interval);
    intervalsByDay.set(interval.workDayId, list);
  }

  const daysByUser = new Map<string, Array<WorkDayRow & { intervals: IntervalRow[] }>>();
  for (const day of workDays) {
    const list = daysByUser.get(day.userId) ?? [];
    list.push({ ...day, intervals: intervalsByDay.get(day.id) ?? [] });
    daysByUser.set(day.userId, list);
  }

  const canManage =
    isAdminOrAbove(member.role) || division.managerUserId === member.userId;

  return NextResponse.json({
    division,
    currentUserId: member.userId,
    canManage,
    members: members.map((row) => ({
      ...row,
      canEdit: canManage || row.userId === member.userId,
      days: daysByUser.get(row.userId) ?? [],
    })),
  });
}

export async function PUT(request: NextRequest) {
  const member = await getCurrentMember();
  if (!member) {
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  }

  const parsed = updateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Некорректные данные графика" }, { status: 400 });
  }

  const input = parsed.data;
  const division = await getDivision(member.organizationId, input.divisionId);
  if (!division) {
    return NextResponse.json({ error: "Подразделение не найдено" }, { status: 404 });
  }
  if (division.scheduleMode !== "STABLE") {
    return NextResponse.json({ error: "Подразделение работает по сменам" }, { status: 409 });
  }

  const assignments = await db.$queryRaw<
    Array<{
      dailyTargetMinutes: number;
      weeklyTargetMinutes: number;
    }>
  >`
    SELECT dm."dailyTargetMinutes", dm."weeklyTargetMinutes"
    FROM schedule.division_members dm
    WHERE dm."divisionId"=CAST(${input.divisionId} AS uuid)
      AND dm."userId"=CAST(${input.userId} AS uuid)
    LIMIT 1
  `;
  const assignment = assignments[0];
  if (!assignment) {
    return NextResponse.json({ error: "Сотрудник не состоит в подразделении" }, { status: 404 });
  }

  const canManage =
    isAdminOrAbove(member.role) || division.managerUserId === member.userId;
  if (!canManage && input.userId !== member.userId) {
    return NextResponse.json({ error: "Нет права менять чужой график" }, { status: 403 });
  }

  const dailyTargetMinutes = canManage
    ? input.dailyTargetMinutes ?? assignment.dailyTargetMinutes
    : assignment.dailyTargetMinutes;
  const weeklyTargetMinutes = canManage
    ? input.weeklyTargetMinutes ?? assignment.weeklyTargetMinutes
    : assignment.weeklyTargetMinutes;
  const validationError = validateIntervals(
    input.days,
    dailyTargetMinutes,
    weeklyTargetMinutes
  );
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 422 });
  }

  await db.$transaction(async (transaction) => {
    if (canManage) {
      await transaction.$executeRaw`
        UPDATE schedule.division_members
        SET
          "dailyTargetMinutes"=${dailyTargetMinutes},
          "weeklyTargetMinutes"=${weeklyTargetMinutes},
          "updatedAt"=CURRENT_TIMESTAMP
        WHERE "divisionId"=CAST(${input.divisionId} AS uuid)
          AND "userId"=CAST(${input.userId} AS uuid)
      `;
    }

    await transaction.$executeRaw`
      DELETE FROM schedule.stable_work_intervals
      WHERE "workDayId" IN (
        SELECT "id" FROM schedule.stable_work_days
        WHERE "userId"=CAST(${input.userId} AS uuid)
      )
    `;
    await transaction.$executeRaw`
      DELETE FROM schedule.stable_work_days
      WHERE "userId"=CAST(${input.userId} AS uuid)
    `;

    for (const day of input.days) {
      const workDayId = randomUUID();
      await transaction.$executeRaw`
        INSERT INTO schedule.stable_work_days(
          "id", "userId", "dayOfWeek", "isWorkingDay", "targetMinutes",
          "createdAt", "updatedAt"
        ) VALUES (
          ${workDayId}, CAST(${input.userId} AS uuid), ${day.dayOfWeek},
          ${day.isWorkingDay}, ${day.targetMinutes ?? null},
          CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
        )
      `;

      const ordered = [...day.intervals].sort(
        (left, right) => left.startMinute - right.startMinute
      );
      for (let index = 0; index < ordered.length; index++) {
        const interval = ordered[index];
        await transaction.$executeRaw`
          INSERT INTO schedule.stable_work_intervals(
            "id", "workDayId", "kind", "startMinute", "endMinute", "sortOrder"
          ) VALUES (
            ${randomUUID()}, ${workDayId},
            CAST(${interval.kind} AS schedule."WorkIntervalKind"),
            ${interval.startMinute}, ${interval.endMinute}, ${index}
          )
        `;
      }
    }
  });

  return NextResponse.json({ success: true });
}
