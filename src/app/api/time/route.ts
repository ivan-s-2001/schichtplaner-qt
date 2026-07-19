import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentMember, isManagerOrAbove } from "@/lib/auth-helpers";
import { getSelectedDivision } from "@/lib/selected-division";
import { startOfMonth, endOfMonth, parse } from "date-fns";

function computeHoursFromRange(from: string, to: string): number {
  const [fh, fm] = from.split(":").map(Number);
  const [th, tm] = to.split(":").map(Number);
  let totalMinutes = th * 60 + tm - (fh * 60 + fm);
  if (totalMinutes < 0) totalMinutes += 24 * 60;
  return totalMinutes / 60;
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
    return NextResponse.json({ error: "Нет доступного отдела" }, { status: 403 });
  }

  const { searchParams } = request.nextUrl;
  const monthParam = searchParams.get("month");
  const userIdParam = searchParams.get("userId");

  let monthStart: Date;
  let monthEnd: Date;
  if (monthParam) {
    const parsed = parse(monthParam, "yyyy-MM", new Date());
    if (Number.isNaN(parsed.getTime())) {
      return NextResponse.json(
        { error: "Некорректный месяц, используйте yyyy-MM" },
        { status: 400 }
      );
    }
    monthStart = startOfMonth(parsed);
    monthEnd = endOfMonth(parsed);
  } else {
    monthStart = startOfMonth(new Date());
    monthEnd = endOfMonth(new Date());
  }

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

  const allowedUserIds = orgMembers.map((item) => item.user.id);
  const isManager = isManagerOrAbove(member.role);
  const filterUserIds = isManager
    ? userIdParam && allowedUserIds.includes(userIdParam)
      ? [userIdParam]
      : allowedUserIds
    : [member.user.id];

  const records = await db.timeRecord.findMany({
    where: {
      userId: { in: filterUserIds },
      date: { gte: monthStart, lte: monthEnd },
    },
    include: {
      category: { select: { id: true, name: true } },
    },
    orderBy: [{ date: "asc" }, { timeFrom: "asc" }],
  });

  const groupedMap = new Map<
    string,
    {
      userId: string;
      firstName: string;
      lastName: string;
      profileImage: string | null;
      totalHours: number;
      records: typeof records;
    }
  >();

  for (const userId of filterUserIds) {
    const organizationMember = orgMembers.find(
      (item) => item.user.id === userId
    );
    if (organizationMember) {
      groupedMap.set(userId, {
        userId,
        firstName: organizationMember.user.firstName,
        lastName: organizationMember.user.lastName,
        profileImage: organizationMember.user.profileImage,
        totalHours: 0,
        records: [],
      });
    }
  }

  for (const record of records) {
    const group = groupedMap.get(record.userId);
    if (!group) continue;
    group.records.push(record);

    if (record.type === "MANUAL" && record.timeFrom && record.timeTo) {
      group.totalHours += computeHoursFromRange(record.timeFrom, record.timeTo);
    } else if (
      record.type === "MANUAL_DURATION" &&
      (record.durationHours != null || record.durationMinutes != null)
    ) {
      group.totalHours +=
        (record.durationHours ?? 0) + (record.durationMinutes ?? 0) / 60;
    } else if (record.type === "WATCH" && record.timeFrom && record.timeTo) {
      group.totalHours += computeHoursFromRange(record.timeFrom, record.timeTo);
    }
  }

  const employees = Array.from(groupedMap.values()).sort((a, b) =>
    a.lastName.localeCompare(b.lastName)
  );

  return NextResponse.json({ division: selectedDivision, employees });
}

const createManualSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("MANUAL"),
    userId: z.string().min(1),
    date: z.string().min(1),
    timeFrom: z.string().regex(/^\d{2}:\d{2}$/),
    timeTo: z.string().regex(/^\d{2}:\d{2}$/),
    categoryId: z.string().optional(),
    comment: z.string().optional(),
  }),
  z.object({
    type: z.literal("MANUAL_DURATION"),
    userId: z.string().min(1),
    date: z.string().min(1),
    durationHours: z.number().int().min(0),
    durationMinutes: z.number().int().min(0).max(59),
    categoryId: z.string().optional(),
    comment: z.string().optional(),
  }),
]);

export async function POST(request: NextRequest) {
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
    return NextResponse.json({ error: "Нет доступного отдела" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Некорректный JSON" }, { status: 400 });
  }

  const parsed = createManualSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Ошибка проверки данных", details: parsed.error.issues },
      { status: 400 }
    );
  }

  const data = parsed.data;
  if (!isManagerOrAbove(member.role) && data.userId !== member.user.id) {
    return NextResponse.json({ error: "Недостаточно прав" }, { status: 403 });
  }

  const targetMember = await db.divisionMember.findUnique({
    where: {
      divisionId_userId: {
        divisionId: selectedDivision.id,
        userId: data.userId,
      },
    },
  });
  if (!targetMember) {
    return NextResponse.json(
      { error: "Сотрудник не состоит в выбранном отделе" },
      { status: 404 }
    );
  }

  const record = await db.timeRecord.create({
    data: {
      userId: data.userId,
      date: new Date(`${data.date}T00:00:00.000Z`),
      type: data.type,
      timeFrom: data.type === "MANUAL" ? data.timeFrom : null,
      timeTo: data.type === "MANUAL" ? data.timeTo : null,
      durationHours:
        data.type === "MANUAL_DURATION" ? data.durationHours : null,
      durationMinutes:
        data.type === "MANUAL_DURATION" ? data.durationMinutes : null,
      categoryId: data.categoryId || null,
      comment: data.comment || null,
    },
    include: {
      category: { select: { id: true, name: true } },
    },
  });

  return NextResponse.json({ record }, { status: 201 });
}
