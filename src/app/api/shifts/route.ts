import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentMember, isManagerOrAbove } from "@/lib/auth-helpers";
import { getSelectedDivision } from "@/lib/selected-division";
import { emitToOrg, emitToSchedule } from "@/lib/emit";

const TIME_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;

const createShiftSchema = z.object({
  scheduleId: z.string().min(1, "scheduleId ist erforderlich"),
  divisionId: z.string().optional().nullable(),
  dayOfWeek: z.number().int().min(1).max(7),
  shiftFrom: z.string().regex(TIME_REGEX, "Некорректное время начала (ЧЧ:ММ)"),
  shiftTo: z.string().regex(TIME_REGEX, "Некорректное время окончания (ЧЧ:ММ)"),
  maxEmployees: z.number().int().min(1, "Mindestens 1 Mitarbeiter"),
  pauseOption: z.enum(["PER_HOUR", "PER_SHIFT"]).optional(),
  pauseValue: z.number().int().min(0).optional(),
  title: z.string().max(100).optional().nullable(),
  description: z.string().max(500).optional().nullable(),
  repeatDays: z.array(z.number().int().min(1).max(7)).optional(),
});

/**
 * POST /api/shifts
 *
 * Create one or more shifts in the currently selected Outline group.
 */
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
    return NextResponse.json(
      { error: "Сначала выберите отдел Outline" },
      { status: 400 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Некорректный JSON" }, { status: 400 });
  }

  const parsed = createShiftSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Ошибка проверки данных", details: parsed.error.issues },
      { status: 400 }
    );
  }

  const data = parsed.data;

  if (data.divisionId && data.divisionId !== selectedDivision.id) {
    return NextResponse.json(
      { error: "Нельзя создать смену в другом отделе" },
      { status: 403 }
    );
  }

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
      deletedAt: null,
    },
  });

  if (!schedule) {
    return NextResponse.json(
      { error: "Schichtplan nicht gefunden" },
      { status: 404 }
    );
  }

  const days =
    data.repeatDays && data.repeatDays.length > 0
      ? [...new Set(data.repeatDays)]
      : [data.dayOfWeek];

  const shiftData = days.map((day) => ({
    scheduleId: data.scheduleId,
    divisionId: selectedDivision.id,
    dayOfWeek: day,
    shiftFrom: data.shiftFrom,
    shiftTo: data.shiftTo,
    maxEmployees: data.maxEmployees,
    pauseOption: data.pauseOption ?? ("PER_HOUR" as const),
    pauseValue: data.pauseValue ?? 0,
    title: data.title ?? null,
    description: data.description ?? null,
  }));

  const shifts = await db.$transaction(
    shiftData.map((sd) =>
      db.shift.create({
        data: sd,
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
    scheduleId: data.scheduleId,
    divisionId: selectedDivision.id,
    action: "shift_created",
    shiftIds: shifts.map((s) => s.id),
  });
  emitToSchedule(data.scheduleId, "schedule:updated", {
    scheduleId: data.scheduleId,
    divisionId: selectedDivision.id,
    action: "shift_created",
    shiftIds: shifts.map((s) => s.id),
  });

  return NextResponse.json({ shifts }, { status: 201 });
}
