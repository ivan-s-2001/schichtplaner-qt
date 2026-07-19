import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentMember, isManagerOrAbove } from "@/lib/auth-helpers";
import { getSelectedDivision } from "@/lib/selected-division";
import {
  startOfMonth,
  endOfMonth,
  getISOWeek,
  getISOWeekYear,
  eachDayOfInterval,
} from "date-fns";

function computeMinutesFromRange(from: string, to: string): number {
  const [fh, fm] = from.split(":").map(Number);
  const [th, tm] = to.split(":").map(Number);
  let totalMinutes = th * 60 + tm - (fh * 60 + fm);
  if (totalMinutes < 0) totalMinutes += 24 * 60;
  return totalMinutes;
}

function getKWsForMonth(
  month: number,
  year: number
): { weekNumber: number; kwYear: number }[] {
  const firstDay = new Date(year, month - 1, 1);
  const lastDay = new Date(year, month, 0);
  const days = eachDayOfInterval({ start: firstDay, end: lastDay });
  const seen = new Set<string>();
  const weeks: { weekNumber: number; kwYear: number }[] = [];

  for (const day of days) {
    const weekNumber = getISOWeek(day);
    const kwYear = getISOWeekYear(day);
    const key = `${weekNumber}-${kwYear}`;
    if (!seen.has(key)) {
      seen.add(key);
      weeks.push({ weekNumber, kwYear });
    }
  }

  return weeks;
}

export async function GET(request: NextRequest) {
  const member = await getCurrentMember();
  if (!member) {
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  }
  if (!isManagerOrAbove(member.role)) {
    return NextResponse.json({ error: "Недостаточно прав" }, { status: 403 });
  }

  const selectedDivision = await getSelectedDivision(
    request,
    member.userId,
    member.organizationId
  );
  if (!selectedDivision) {
    return NextResponse.json({ error: "Нет доступного отдела" }, { status: 403 });
  }

  const { searchParams } = request.nextUrl;
  const now = new Date();
  const month = searchParams.get("month")
    ? parseInt(searchParams.get("month")!, 10)
    : now.getMonth() + 1;
  const year = searchParams.get("year")
    ? parseInt(searchParams.get("year")!, 10)
    : now.getFullYear();

  if (month < 1 || month > 12 || Number.isNaN(month) || Number.isNaN(year)) {
    return NextResponse.json(
      { error: "Некорректный месяц или год" },
      { status: 400 }
    );
  }

  const monthStart = startOfMonth(new Date(year, month - 1, 1));
  const monthEnd = endOfMonth(new Date(year, month - 1, 1));
  const divisionMembers = await db.divisionMember.findMany({
    where: { divisionId: selectedDivision.id },
    select: { userId: true },
  });
  const divisionUserIds = divisionMembers.map((item) => item.userId);

  const orgMembers = await db.organizationMember.findMany({
    where: {
      organizationId: member.organizationId,
      isActive: true,
      userId: { in: divisionUserIds },
    },
    include: {
      user: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          profileImage: true,
        },
      },
    },
  });
  const userIds = orgMembers.map((item) => item.user.id);

  const timeRecords = await db.timeRecord.findMany({
    where: {
      userId: { in: userIds },
      date: { gte: monthStart, lte: monthEnd },
    },
    orderBy: { date: "asc" },
  });

  const weeks = getKWsForMonth(month, year);
  const schedules = await db.schedule.findMany({
    where: {
      organizationId: member.organizationId,
      divisionId: selectedDivision.id,
      deletedAt: null,
      OR: weeks.map((week) => ({
        weekNumber: week.weekNumber,
        year: week.kwYear,
      })),
    },
    select: { id: true, weekNumber: true, year: true },
  });
  const scheduleIds = schedules.map((item) => item.id);

  const bookings = await db.booking.findMany({
    where: {
      userId: { in: userIds },
      shift: {
        scheduleId: { in: scheduleIds },
        divisionId: selectedDivision.id,
        deletedAt: null,
      },
    },
    include: {
      shift: {
        select: {
          scheduleId: true,
          schedule: { select: { weekNumber: true, year: true } },
        },
      },
    },
  });

  const kwHeaders = weeks.map((week) => ({
    weekNumber: week.weekNumber,
    label: `KW${String(week.weekNumber).padStart(2, "0")}`,
  }));

  type KWData = {
    weekNumber: number;
    totalMinutes: number;
    shiftCount: number;
  };

  const employees = orgMembers.map((organizationMember) => {
    const userId = organizationMember.user.id;
    const kwMap = new Map<number, KWData>();
    for (const week of weeks) {
      kwMap.set(week.weekNumber, {
        weekNumber: week.weekNumber,
        totalMinutes: 0,
        shiftCount: 0,
      });
    }

    let totalMinutes = 0;
    for (const record of timeRecords.filter((item) => item.userId === userId)) {
      let minutes = 0;
      if (
        (record.type === "MANUAL" || record.type === "WATCH") &&
        record.timeFrom &&
        record.timeTo
      ) {
        minutes = computeMinutesFromRange(record.timeFrom, record.timeTo);
      } else if (record.type === "MANUAL_DURATION") {
        minutes =
          (record.durationHours ?? 0) * 60 + (record.durationMinutes ?? 0);
      }
      totalMinutes += minutes;
      const weekData = kwMap.get(getISOWeek(new Date(record.date)));
      if (weekData) weekData.totalMinutes += minutes;
    }

    const userBookings = bookings.filter((item) => item.userId === userId);
    for (const booking of userBookings) {
      const weekData = kwMap.get(booking.shift.schedule.weekNumber);
      if (weekData) weekData.shiftCount += 1;
    }

    return {
      userId,
      firstName: organizationMember.user.firstName,
      lastName: organizationMember.user.lastName,
      profileImage: organizationMember.user.profileImage,
      totalMinutes,
      shiftCount: userBookings.length,
      kwBreakdown: Array.from(kwMap.values()),
    };
  });

  employees.sort((a, b) => a.lastName.localeCompare(b.lastName));

  return NextResponse.json({
    division: selectedDivision,
    month,
    year,
    kwHeaders,
    employees,
    totals: {
      totalMinutes: employees.reduce((sum, item) => sum + item.totalMinutes, 0),
      totalShifts: employees.reduce((sum, item) => sum + item.shiftCount, 0),
    },
  });
}
