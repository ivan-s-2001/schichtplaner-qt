import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentMember, isManagerOrAbove } from "@/lib/auth-helpers";
import { getSelectedDivision } from "@/lib/selected-division";
import { emitToOrg, emitToSchedule } from "@/lib/emit";

const overtimeHoursSchema = z.number().min(0).max(24).multipleOf(0.5);

const assignmentBaseSchema = z.object({
  scheduleId: z.string().min(1),
  userId: z.string().min(1),
  dayOfWeek: z.number().int().min(1).max(7),
  templateId: z.string().min(1),
  overtimeBeforeHours: overtimeHoursSchema.default(0),
  overtimeAfterHours: overtimeHoursSchema.default(0),
  overtimeHours: overtimeHoursSchema.optional(),
});

const assignmentSchema = assignmentBaseSchema.superRefine((value, context) => {
  const legacyAfter =
    value.overtimeBeforeHours === 0 && value.overtimeAfterHours === 0
      ? value.overtimeHours ?? 0
      : 0;
  const total =
    value.overtimeBeforeHours + value.overtimeAfterHours + legacyAfter;

  if (total > 24) {
    context.addIssue({
      code: "custom",
      message: "Суммарная переработка не может превышать 24 часа",
      path: ["overtimeAfterHours"],
    });
  }
});

const removeSchema = z.object({
  scheduleId: z.string().min(1),
  userId: z.string().min(1),
  dayOfWeek: z.number().int().min(1).max(7),
});

type ShiftPoolRow = {
  code: string;
  name: string;
  shiftFrom: string;
  shiftTo: string;
  color: string;
  textColor: string;
  description: string | null;
};

async function requireManager(request: NextRequest) {
  const member = await getCurrentMember();

  if (!member) {
    return {
      error: NextResponse.json({ error: "Не авторизован" }, { status: 401 }),
    };
  }

  if (!isManagerOrAbove(member.role)) {
    return {
      error: NextResponse.json({ error: "Недостаточно прав" }, { status: 403 }),
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
        { error: "Сначала выберите отдел Outline" },
        { status: 400 }
      ),
    };
  }

  return { member, division };
}

async function removeExistingAssignment(
  tx: Prisma.TransactionClient,
  scheduleId: string,
  divisionId: string,
  userId: string,
  dayOfWeek: number
) {
  const bookings = await tx.booking.findMany({
    where: {
      userId,
      shift: {
        scheduleId,
        divisionId,
        dayOfWeek,
        deletedAt: null,
      },
    },
    select: {
      id: true,
      shiftId: true,
      shift: { select: { title: true } },
    },
  });

  if (bookings.length === 0) return;

  await tx.booking.deleteMany({
    where: { id: { in: bookings.map((booking) => booking.id) } },
  });

  for (const booking of bookings) {
    if (!booking.shift.title?.startsWith("pool:")) continue;

    const remaining = await tx.booking.count({
      where: { shiftId: booking.shiftId },
    });

    if (remaining === 0) {
      await tx.shift.update({
        where: { id: booking.shiftId },
        data: { deletedAt: new Date() },
      });
    }
  }
}

export async function POST(request: NextRequest) {
  const access = await requireManager(request);
  if ("error" in access) return access.error;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Некорректный JSON" }, { status: 400 });
  }

  const parsed = assignmentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Ошибка проверки данных", details: parsed.error.issues },
      { status: 400 }
    );
  }

  const { member, division } = access;
  const {
    scheduleId,
    userId,
    dayOfWeek,
    templateId,
    overtimeBeforeHours,
    overtimeAfterHours,
    overtimeHours,
  } = parsed.data;

  const templates = await db.$queryRaw<ShiftPoolRow[]>`
    SELECT
      "code",
      "name",
      "shiftFrom",
      "shiftTo",
      "color",
      "textColor",
      "description"
    FROM "shift_pool_templates"
    WHERE "organizationId" = ${member.organizationId}
      AND "code" = ${templateId}
      AND "isActive" = true
    LIMIT 1
  `;
  const template = templates[0];

  if (!template) {
    return NextResponse.json({ error: "Смена отсутствует в пуле" }, { status: 400 });
  }

  const [schedule, targetMember, divisionMembership] = await Promise.all([
    db.schedule.findFirst({
      where: {
        id: scheduleId,
        organizationId: member.organizationId,
        deletedAt: null,
      },
      select: { id: true },
    }),
    db.organizationMember.findFirst({
      where: {
        organizationId: member.organizationId,
        userId,
        isActive: true,
        role: { not: "OWNER" },
      },
      select: { id: true },
    }),
    db.divisionMember.findUnique({
      where: {
        divisionId_userId: {
          divisionId: division.id,
          userId,
        },
      },
      select: { userId: true },
    }),
  ]);

  if (!schedule) {
    return NextResponse.json({ error: "График не найден" }, { status: 404 });
  }

  if (!targetMember || !divisionMembership) {
    return NextResponse.json(
      { error: "Сотрудник не состоит в выбранном отделе" },
      { status: 404 }
    );
  }

  const legacyAfterHours =
    overtimeBeforeHours === 0 && overtimeAfterHours === 0
      ? overtimeHours ?? 0
      : 0;
  const overtimeBeforeMinutes = Math.round(overtimeBeforeHours * 60);
  const overtimeAfterMinutes = Math.round(
    (overtimeAfterHours + legacyAfterHours) * 60
  );
  const overtimeMinutes = overtimeBeforeMinutes + overtimeAfterMinutes;

  const result = await db.$transaction(async (tx) => {
    await removeExistingAssignment(
      tx,
      scheduleId,
      division.id,
      userId,
      dayOfWeek
    );

    const title = `pool:${template.code}`;
    let shift = await tx.shift.findFirst({
      where: {
        scheduleId,
        divisionId: division.id,
        dayOfWeek,
        shiftFrom: template.shiftFrom,
        shiftTo: template.shiftTo,
        title,
        deletedAt: null,
      },
    });

    if (!shift) {
      shift = await tx.shift.create({
        data: {
          scheduleId,
          divisionId: division.id,
          dayOfWeek,
          shiftFrom: template.shiftFrom,
          shiftTo: template.shiftTo,
          maxEmployees: 999,
          pauseOption: "PER_SHIFT",
          pauseValue: 0,
          title,
          description: template.description,
        },
      });
    }

    await tx.$executeRaw`
      UPDATE "shifts"
      SET
        "poolTemplateCode" = ${template.code},
        "poolLabel" = ${template.name},
        "poolColor" = ${template.color},
        "poolTextColor" = ${template.textColor},
        "poolDescription" = ${template.description}
      WHERE "id" = ${shift.id}
    `;

    const booking = await tx.booking.create({
      data: {
        shiftId: shift.id,
        userId,
        bookedBy: member.user.id,
      },
    });

    await tx.$executeRaw`
      UPDATE "bookings"
      SET
        "overtimeMinutes" = ${overtimeMinutes},
        "overtimeBeforeMinutes" = ${overtimeBeforeMinutes},
        "overtimeAfterMinutes" = ${overtimeAfterMinutes}
      WHERE "id" = ${booking.id}
    `;

    return {
      shiftId: shift.id,
      bookingId: booking.id,
      overtimeMinutes,
      overtimeBeforeMinutes,
      overtimeAfterMinutes,
    };
  });

  emitToOrg(member.organizationId, "schedule:updated", {
    scheduleId,
    divisionId: division.id,
    action: "assignment_changed",
    userId,
    dayOfWeek,
  });
  emitToSchedule(scheduleId, "schedule:updated", {
    scheduleId,
    divisionId: division.id,
    action: "assignment_changed",
    userId,
    dayOfWeek,
  });

  return NextResponse.json({ assignment: result });
}

export async function DELETE(request: NextRequest) {
  const access = await requireManager(request);
  if ("error" in access) return access.error;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Некорректный JSON" }, { status: 400 });
  }

  const parsed = removeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Ошибка проверки данных", details: parsed.error.issues },
      { status: 400 }
    );
  }

  const { member, division } = access;
  const { scheduleId, userId, dayOfWeek } = parsed.data;

  const [schedule, divisionMembership] = await Promise.all([
    db.schedule.findFirst({
      where: {
        id: scheduleId,
        organizationId: member.organizationId,
        deletedAt: null,
      },
      select: { id: true },
    }),
    db.divisionMember.findUnique({
      where: {
        divisionId_userId: {
          divisionId: division.id,
          userId,
        },
      },
      select: { userId: true },
    }),
  ]);

  if (!schedule) {
    return NextResponse.json({ error: "График не найден" }, { status: 404 });
  }

  if (!divisionMembership) {
    return NextResponse.json(
      { error: "Сотрудник не состоит в выбранном отделе" },
      { status: 403 }
    );
  }

  await db.$transaction((tx) =>
    removeExistingAssignment(
      tx,
      scheduleId,
      division.id,
      userId,
      dayOfWeek
    )
  );

  emitToOrg(member.organizationId, "schedule:updated", {
    scheduleId,
    divisionId: division.id,
    action: "assignment_removed",
    userId,
    dayOfWeek,
  });
  emitToSchedule(scheduleId, "schedule:updated", {
    scheduleId,
    divisionId: division.id,
    action: "assignment_removed",
    userId,
    dayOfWeek,
  });

  return NextResponse.json({ success: true });
}
