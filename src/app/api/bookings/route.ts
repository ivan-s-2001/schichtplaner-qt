import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentMember, isManagerOrAbove } from "@/lib/auth-helpers";
import { getSelectedDivision } from "@/lib/selected-division";
import { emitToOrg, emitToSchedule } from "@/lib/emit";

const bookingSchema = z.object({
  shiftId: z.string().min(1),
  userId: z.string().min(1),
});

async function getContext(request: NextRequest, shiftId: string) {
  const member = await getCurrentMember();
  if (!member) return { error: "unauthorized" as const };

  const division = await getSelectedDivision(
    request,
    member.userId,
    member.organizationId
  );
  if (!division) return { error: "division" as const };

  const shift = await db.shift.findFirst({
    where: {
      id: shiftId,
      divisionId: division.id,
      deletedAt: null,
      schedule: {
        organizationId: member.organizationId,
        divisionId: division.id,
        deletedAt: null,
      },
    },
    include: { bookings: true },
  });
  if (!shift) return { error: "not_found" as const };

  return { member, division, shift };
}

export async function POST(request: NextRequest) {
  const parsed = bookingSchema.safeParse(
    await request.json().catch(() => null)
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Ошибка проверки данных", details: parsed.error.issues },
      { status: 400 }
    );
  }

  const { shiftId, userId } = parsed.data;
  const context = await getContext(request, shiftId);
  if ("error" in context) {
    const status = context.error === "unauthorized" ? 401 : context.error === "division" ? 403 : 404;
    return NextResponse.json({ error: "Смена недоступна" }, { status });
  }

  if (!isManagerOrAbove(context.member.role) && userId !== context.member.user.id) {
    return NextResponse.json(
      { error: "Сотрудник может назначить только себя" },
      { status: 403 }
    );
  }

  const divisionMember = await db.divisionMember.findUnique({
    where: {
      divisionId_userId: {
        divisionId: context.division.id,
        userId,
      },
    },
  });
  if (!divisionMember) {
    return NextResponse.json(
      { error: "Сотрудник не состоит в выбранном отделе" },
      { status: 404 }
    );
  }

  if (context.shift.bookings.length >= context.shift.maxEmployees) {
    return NextResponse.json({ error: "Смена заполнена" }, { status: 409 });
  }
  if (context.shift.bookings.some((booking) => booking.userId === userId)) {
    return NextResponse.json(
      { error: "Сотрудник уже назначен на смену" },
      { status: 409 }
    );
  }

  const booking = await db.booking.create({
    data: {
      shiftId,
      userId,
      bookedBy: context.member.user.id,
    },
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
  });

  const event = {
    scheduleId: context.shift.scheduleId,
    divisionId: context.division.id,
    shiftId,
    userId,
    action: "booked",
  };
  emitToOrg(context.member.organizationId, "booking:changed", event);
  emitToSchedule(context.shift.scheduleId, "booking:changed", event);

  return NextResponse.json({ booking }, { status: 201 });
}

export async function DELETE(request: NextRequest) {
  const parsed = bookingSchema.safeParse(
    await request.json().catch(() => null)
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Ошибка проверки данных", details: parsed.error.issues },
      { status: 400 }
    );
  }

  const { shiftId, userId } = parsed.data;
  const context = await getContext(request, shiftId);
  if ("error" in context) {
    const status = context.error === "unauthorized" ? 401 : context.error === "division" ? 403 : 404;
    return NextResponse.json({ error: "Смена недоступна" }, { status });
  }

  if (!isManagerOrAbove(context.member.role) && userId !== context.member.user.id) {
    return NextResponse.json(
      { error: "Сотрудник может снять только себя" },
      { status: 403 }
    );
  }

  const booking = await db.booking.findUnique({
    where: { shiftId_userId: { shiftId, userId } },
  });
  if (!booking) {
    return NextResponse.json({ error: "Назначение не найдено" }, { status: 404 });
  }

  await db.booking.delete({ where: { id: booking.id } });

  const event = {
    scheduleId: context.shift.scheduleId,
    divisionId: context.division.id,
    shiftId,
    userId,
    action: "unbooked",
  };
  emitToOrg(context.member.organizationId, "booking:changed", event);
  emitToSchedule(context.shift.scheduleId, "booking:changed", event);

  return NextResponse.json({ success: true });
}
