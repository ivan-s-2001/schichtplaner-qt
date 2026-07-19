import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentMember } from "@/lib/auth-helpers";
import { getSelectedDivision } from "@/lib/selected-division";
import { serializeShiftTemplate } from "@/lib/schedule/shift-pool";

type DayNoteRow = {
  id: string;
  scheduleId: string;
  dayOfWeek: number;
  note: string;
  status: "PLANNED" | "DONE" | "PARTIAL" | "POSTPONED" | "SENT" | "ATTENTION";
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
};

type DayOffRow = {
  id: string;
  scheduleId: string;
  userId: string;
  dayOfWeek: number;
  createdAt: Date;
  updatedAt: Date;
};

type OvertimeRow = {
  bookingId: string;
  overtimeMinutes: number;
  overtimeBeforeMinutes: number;
  overtimeAfterMinutes: number;
};

type ShiftSnapshotRow = {
  shiftId: string;
  poolTemplateCode: string | null;
  poolLabel: string | null;
  poolColor: string | null;
  poolTextColor: string | null;
  poolDescription: string | null;
};

type DivisionUserRow = {
  userId: string;
};

function getWeekRange(year: number, weekNumber: number) {
  const januaryFourth = new Date(Date.UTC(year, 0, 4));
  const januaryFourthDay = januaryFourth.getUTCDay() || 7;
  const weekOneMonday = new Date(januaryFourth);
  weekOneMonday.setUTCDate(
    januaryFourth.getUTCDate() - januaryFourthDay + 1
  );

  const start = new Date(weekOneMonday);
  start.setUTCDate(weekOneMonday.getUTCDate() + (weekNumber - 1) * 7);

  const end = new Date(start);
  end.setUTCDate(start.getUTCDate() + 6);

  return { start, end };
}

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
    return NextResponse.json(
      { error: "Пользователь не состоит ни в одной группе Outline" },
      { status: 403 }
    );
  }

  const divisionUsers = await db.$queryRaw<DivisionUserRow[]>`
    SELECT "userId"
    FROM "division_members"
    WHERE "divisionId" = ${selectedDivision.id}
  `;
  const divisionUserIds = divisionUsers.map((item) => item.userId);

  const { searchParams } = request.nextUrl;
  const kwParam = searchParams.get("kw");
  const yearParam = searchParams.get("year");

  if (!kwParam || !yearParam) {
    return NextResponse.json(
      { error: "Обязательны параметры kw и year" },
      { status: 400 }
    );
  }

  const weekNumber = parseInt(kwParam, 10);
  const year = parseInt(yearParam, 10);

  if (
    Number.isNaN(weekNumber) ||
    Number.isNaN(year) ||
    weekNumber < 1 ||
    weekNumber > 53 ||
    year < 2000 ||
    year > 2100
  ) {
    return NextResponse.json(
      { error: "Некорректная неделя или год" },
      { status: 400 }
    );
  }

  const orgId = member.organizationId;
  const include = {
    shifts: {
      where: {
        deletedAt: null,
        divisionId: selectedDivision.id,
      },
      include: {
        division: {
          select: {
            id: true,
            title: true,
            color: true,
          },
        },
        bookings: {
          include: {
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                nickname: true,
                profileImage: true,
              },
            },
          },
        },
      },
      orderBy: [{ dayOfWeek: "asc" as const }, { shiftFrom: "asc" as const }],
    },
  };

  let schedule = await db.schedule.findFirst({
    where: {
      organizationId: orgId,
      weekNumber,
      year,
      branchId: null,
      deletedAt: null,
    },
    include,
  });

  if (!schedule) {
    schedule = await db.schedule.create({
      data: {
        organizationId: orgId,
        weekNumber,
        year,
      },
      include,
    });
  }

  const { start: weekStart, end: weekEnd } = getWeekRange(year, weekNumber);

  const [dayNotes, dayOffs, absences, overtimeRows, snapshotRows] =
    await Promise.all([
      db.$queryRaw<DayNoteRow[]>`
        SELECT
          "id", "scheduleId", "dayOfWeek", "note", "status", "sortOrder",
          "createdAt", "updatedAt"
        FROM "schedule_day_notes"
        WHERE "scheduleId" = ${schedule.id}
        ORDER BY "dayOfWeek" ASC, "sortOrder" ASC, "createdAt" ASC
      `,
      db.$queryRaw<DayOffRow[]>`
        SELECT
          "id", "scheduleId", "userId", "dayOfWeek", "createdAt", "updatedAt"
        FROM "schedule_day_offs"
        WHERE "scheduleId" = ${schedule.id}
          AND "userId" IN (
            SELECT "userId"
            FROM "division_members"
            WHERE "divisionId" = ${selectedDivision.id}
          )
        ORDER BY "dayOfWeek" ASC, "createdAt" ASC
      `,
      db.absence.findMany({
        where: {
          status: "APPROVED",
          dateFrom: { lte: weekEnd },
          dateTo: { gte: weekStart },
          userId: { in: divisionUserIds },
          user: {
            memberships: {
              some: {
                organizationId: orgId,
                isActive: true,
              },
            },
          },
        },
        include: {
          category: {
            select: {
              id: true,
              name: true,
              color: true,
              isPaid: true,
            },
          },
        },
        orderBy: [{ dateFrom: "asc" }, { createdAt: "asc" }],
      }),
      db.$queryRaw<OvertimeRow[]>`
        SELECT
          b."id" AS "bookingId",
          b."overtimeMinutes" AS "overtimeMinutes",
          b."overtimeBeforeMinutes" AS "overtimeBeforeMinutes",
          b."overtimeAfterMinutes" AS "overtimeAfterMinutes"
        FROM "bookings" b
        INNER JOIN "shifts" s ON s."id" = b."shiftId"
        WHERE s."scheduleId" = ${schedule.id}
          AND s."divisionId" = ${selectedDivision.id}
          AND s."deletedAt" IS NULL
      `,
      db.$queryRaw<ShiftSnapshotRow[]>`
        SELECT
          "id" AS "shiftId",
          "poolTemplateCode",
          "poolLabel",
          "poolColor",
          "poolTextColor",
          "poolDescription"
        FROM "shifts"
        WHERE "scheduleId" = ${schedule.id}
          AND "divisionId" = ${selectedDivision.id}
          AND "deletedAt" IS NULL
      `,
    ]);

  const overtimeByBooking = new Map(
    overtimeRows.map((row) => [row.bookingId, row])
  );
  const snapshotByShift = new Map(
    snapshotRows.map((row) => [row.shiftId, row])
  );

  const shifts = schedule.shifts.map((shift) => {
    const snapshot = snapshotByShift.get(shift.id);
    const hasSnapshot = Boolean(
      snapshot?.poolTemplateCode &&
        snapshot.poolLabel &&
        snapshot.poolColor &&
        snapshot.poolTextColor
    );
    const serializedTitle = hasSnapshot
      ? serializeShiftTemplate({
          id: snapshot!.poolTemplateCode!,
          name: snapshot!.poolLabel!,
          label: `${shift.shiftFrom}–${shift.shiftTo}`,
          shiftFrom: shift.shiftFrom,
          shiftTo: shift.shiftTo,
          color: snapshot!.poolColor!,
          textColor: snapshot!.poolTextColor!,
          description: snapshot!.poolDescription,
          sortOrder: 999,
          isActive: true,
        })
      : shift.title;

    return {
      ...shift,
      title: serializedTitle,
      poolTemplateCode: snapshot?.poolTemplateCode ?? null,
      poolLabel: snapshot?.poolLabel ?? null,
      poolColor: snapshot?.poolColor ?? null,
      poolTextColor: snapshot?.poolTextColor ?? null,
      poolDescription: snapshot?.poolDescription ?? null,
      bookings: shift.bookings.map((booking) => {
        const overtime = overtimeByBooking.get(booking.id);
        return {
          ...booking,
          overtimeMinutes: overtime?.overtimeMinutes ?? 0,
          overtimeBeforeMinutes: overtime?.overtimeBeforeMinutes ?? 0,
          overtimeAfterMinutes: overtime?.overtimeAfterMinutes ?? 0,
        };
      }),
    };
  });

  return NextResponse.json({
    division: selectedDivision,
    schedule: {
      id: schedule.id,
      organizationId: schedule.organizationId,
      weekNumber: schedule.weekNumber,
      year: schedule.year,
      isPublic: schedule.isPublic,
      settingsLayout: schedule.settingsLayout,
      showTitle: schedule.showTitle,
      showPauses: schedule.showPauses,
      shifts,
      dayNotes,
      dayOffs,
      absences,
    },
  });
}
