import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentMember, isManagerOrAbove } from "@/lib/auth-helpers";
import { getSelectedDivision } from "@/lib/selected-division";
import { emitToOrg, emitToSchedule } from "@/lib/emit";

const TIME_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;

const updateShiftSchema = z.object({
  dayOfWeek: z.number().int().min(1).max(7).optional(),
  shiftFrom: z.string().regex(TIME_REGEX).optional(),
  shiftTo: z.string().regex(TIME_REGEX).optional(),
  maxEmployees: z.number().int().min(1).optional(),
  pauseOption: z.enum(["PER_HOUR", "PER_SHIFT"]).optional(),
  pauseValue: z.number().int().min(0).optional(),
  title: z.string().max(100).optional().nullable(),
  description: z.string().max(500).optional().nullable(),
});

interface RouteContext {
  params: Promise<{ id: string }>;
}

async function getAuthorizedShift(request: NextRequest, id: string) {
  const member = await getCurrentMember();
  if (!member) return { error: "unauthorized" as const };
  if (!isManagerOrAbove(member.role)) return { error: "forbidden" as const };

  const selectedDivision = await getSelectedDivision(
    request,
    member.userId,
    member.organizationId
  );
  if (!selectedDivision) return { error: "division" as const };

  const shift = await db.shift.findFirst({
    where: {
      id,
      divisionId: selectedDivision.id,
      deletedAt: null,
      schedule: {
        organizationId: member.organizationId,
        divisionId: selectedDivision.id,
        deletedAt: null,
      },
    },
    include: {
      schedule: { select: { organizationId: true, divisionId: true } },
    },
  });

  if (!shift) return { error: "not_found" as const };
  return { member, selectedDivision, shift };
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const authorized = await getAuthorizedShift(request, id);
  if ("error" in authorized) {
    const status =
      authorized.error === "unauthorized"
        ? 401
        : authorized.error === "forbidden" || authorized.error === "division"
          ? 403
          : 404;
    return NextResponse.json({ error: "Смена недоступна" }, { status });
  }

  const parsed = updateShiftSchema.safeParse(
    await request.json().catch(() => null)
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Ошибка проверки данных", details: parsed.error.issues },
      { status: 400 }
    );
  }

  const effectiveFrom = parsed.data.shiftFrom ?? authorized.shift.shiftFrom;
  const effectiveTo = parsed.data.shiftTo ?? authorized.shift.shiftTo;
  if (effectiveFrom >= effectiveTo) {
    return NextResponse.json(
      { error: "Время начала должно быть раньше времени окончания" },
      { status: 400 }
    );
  }

  const shift = await db.shift.update({
    where: { id },
    data: parsed.data,
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
  });

  emitToOrg(authorized.member.organizationId, "schedule:updated", {
    scheduleId: authorized.shift.scheduleId,
    divisionId: authorized.selectedDivision.id,
    action: "shift_updated",
    shiftId: id,
  });
  emitToSchedule(authorized.shift.scheduleId, "schedule:updated", {
    scheduleId: authorized.shift.scheduleId,
    divisionId: authorized.selectedDivision.id,
    action: "shift_updated",
    shiftId: id,
  });

  return NextResponse.json({ shift });
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const authorized = await getAuthorizedShift(request, id);
  if ("error" in authorized) {
    const status =
      authorized.error === "unauthorized"
        ? 401
        : authorized.error === "forbidden" || authorized.error === "division"
          ? 403
          : 404;
    return NextResponse.json({ error: "Смена недоступна" }, { status });
  }

  await db.$transaction([
    db.booking.deleteMany({ where: { shiftId: id } }),
    db.shift.update({
      where: { id },
      data: { deletedAt: new Date() },
    }),
  ]);

  emitToOrg(authorized.member.organizationId, "schedule:updated", {
    scheduleId: authorized.shift.scheduleId,
    divisionId: authorized.selectedDivision.id,
    action: "shift_deleted",
    shiftId: id,
  });
  emitToSchedule(authorized.shift.scheduleId, "schedule:updated", {
    scheduleId: authorized.shift.scheduleId,
    divisionId: authorized.selectedDivision.id,
    action: "shift_deleted",
    shiftId: id,
  });

  return NextResponse.json({ success: true });
}
