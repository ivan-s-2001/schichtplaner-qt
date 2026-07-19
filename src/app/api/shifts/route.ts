import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentMember, isManagerOrAbove } from "@/lib/auth-helpers";
import { getSelectedDivision } from "@/lib/selected-division";
import { emitToOrg, emitToSchedule } from "@/lib/emit";

const TIME_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;

const createShiftSchema = z.object({
  scheduleId: z.string().min(1),
  divisionId: z.string().optional().nullable(),
  dayOfWeek: z.number().int().min(1).max(7),
  shiftFrom: z.string().regex(TIME_REGEX),
  shiftTo: z.string().regex(TIME_REGEX),
  maxEmployees: z.number().int().min(1),
  pauseOption: z.enum(["PER_HOUR", "PER_SHIFT"]).optional(),
  pauseValue: z.number().int().min(0).optional(),
  title: z.string().max(100).optional().nullable(),
  description: z.string().max(500).optional().nullable(),
  repeatDays: z.array(z.number().int().min(1).max(7)).optional(),
});

export async function POST(request: NextRequest) {
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

  const parsed = createShiftSchema.safeParse(
    await request.json().catch(() => null)
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Ошибка проверки данных", details: parsed.error.issues },
      { status: 400 }
    );
  }

  const data = parsed.data;
  if (data.shiftFrom >= data.shiftTo) {
    return NextResponse.json(
      { error: "Время начала должно быть раньше времени окончания" },
      { status: 400 }
    );
  }

  const schedule = await db.schedule.findFirst({
    where: {
      id: data.scheduleId,
      organizationId: member.organizationId,
      divisionId: selectedDivision.id,
      deletedAt: null,
    },
  });
  if (!schedule) {
    return NextResponse.json(
      { error: "График выбранного отдела не найден" },
      { status: 404 }
    );
  }

  const days =
    data.repeatDays && data.repeatDays.length > 0
      ? [...new Set(data.repeatDays)]
      : [data.dayOfWeek];

  const shifts = await db.$transaction(
    days.map((dayOfWeek) =>
      db.shift.create({
        data: {
          scheduleId: schedule.id,
          divisionId: selectedDivision.id,
          dayOfWeek,
          shiftFrom: data.shiftFrom,
          shiftTo: data.shiftTo,
          maxEmployees: data.maxEmployees,
          pauseOption: data.pauseOption ?? "PER_HOUR",
          pauseValue: data.pauseValue ?? 0,
          title: data.title ?? null,
          description: data.description ?? null,
        },
        include: {
          division: {
            select: { id: true, title: true, color: true },
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
      })
    )
  );

  emitToOrg(member.organizationId, "schedule:updated", {
    scheduleId: schedule.id,
    divisionId: selectedDivision.id,
    action: "shift_created",
    shiftIds: shifts.map((shift) => shift.id),
  });
  emitToSchedule(schedule.id, "schedule:updated", {
    scheduleId: schedule.id,
    divisionId: selectedDivision.id,
    action: "shift_created",
    shiftIds: shifts.map((shift) => shift.id),
  });

  return NextResponse.json({ shifts }, { status: 201 });
}
