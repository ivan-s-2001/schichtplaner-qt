import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentMember, isAdminOrAbove } from "@/lib/auth-helpers";
import { getSelectedDivision } from "@/lib/selected-division";
import { emitToOrg, emitToSchedule } from "@/lib/emit";

const overtimeHoursSchema = z.number().min(0).max(24).multipleOf(0.5);

const assignmentBaseSchema = z.object({
  scheduleId: z.string().min(1),
  userId: z.string().uuid(),
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
  if (
    value.overtimeBeforeHours + value.overtimeAfterHours + legacyAfter >
    24
  ) {
    context.addIssue({
      code: "custom",
      message: "Суммарная переработка не может превышать 24 часа",
      path: ["overtimeAfterHours"],
    });
  }
});

const removeSchema = z.object({
  scheduleId: z.string().min(1),
  userId: z.string().uuid(),
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

async function requireDivisionAccess(request: NextRequest) {
  const member = await getCurrentMember();
  if (!member) {
    return {
      error: NextResponse.json({ error: "Не авторизован" }, { status: 401 }),
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
        { error: "Нет доступного подразделения" },
        { status: 403 }
      ),
    };
  }
  if (division.scheduleMode !== "SHIFT") {
    return {
      error: NextResponse.json(
        { error: "Выбранное подразделение не использует сменный график" },
        { status: 409 }
      ),
    };
  }

  const canManage = isAdminOrAbove(member.role) || division.isManager;
  return { member, division, canManage };
}

function canEditUser(
  currentUserId: string,
  targetUserId: string,
  canManage: boolean
) {
  return canManage || currentUserId === targetUserId;
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

async function validateScheduleAndUser(
  scheduleId: string,
  userId: string,
  organizationId: string,
  divisionId: string
) {
  const [schedule, divisionMember] = await Promise.all([
    db.schedule.findFirst({
      where: {
        id: scheduleId,
        organizationId,
        divisionId,
        deletedAt: null,
      },
      select: { id: true },
    }),
    db.divisionMember.findUnique({
      where: {
        divisionId_userId: { divisionId, userId },
      },
    }),
  ]);
  return { schedule, divisionMember };
}

export async function POST(request: NextRequest) {
  const access = await requireDivisionAccess(request);
  if ("error" in access) return access.error;

  const parsed = assignmentSchema.safeParse(
    await request.json().catch(() => null)
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Ошибка проверки данных", details: parsed.error.issues },
      { status: 400 }
    );
  }

  const { member, division, canManage } = access;
  const {
    scheduleId,
    userId,
    dayOfWeek,
    templateId,
    overtimeBeforeHours,
    overtimeAfterHours,
    overtimeHours,
  } = parsed.data;

  if (!canEditUser(member.userId, userId, canManage)) {
    return NextResponse.json(
      { error: "Можно изменять только собственную строку" },
      { status: 403 }
    );
  }

  const { schedule, divisionMember } = await validateScheduleAndUser(
    scheduleId,
    userId,
    member.organizationId,
    division.id
  );
  if (!schedule) {
    return NextResponse.json(
      { error: "График подразделения не найден" },
      { status: 404 }
    );
  }
  if (!divisionMember) {
    return NextResponse.json(
      { error: "Сотрудник не состоит в выбранном подразделении" },
      { status: 404 }
    );
  }

  const templates = await db.$queryRaw<ShiftPoolRow[]>`
    SELECT
      "code", "name", "shiftFrom", "shiftTo", "color", "textColor", "description"
    FROM schedule."shift_pool_templates"
    WHERE "organizationId" = CAST(${member.organizationId} AS uuid)
      AND "code" = ${templateId}
      AND "isActive" = true
    LIMIT 1
  `;
  const template = templates[0];
  if (!template) {
    return NextResponse.json(
      { error: "Смена отсутствует в пуле" },
      { status: 400 }
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
      UPDATE schedule."shifts"
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
        bookedBy: member.userId,
      },
    });

    await tx.$executeRaw`
      UPDATE schedule."bookings"
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

  const event = {
    scheduleId,
    divisionId: division.id,
    action: "assignment_changed",
    userId,
    dayOfWeek,
  };
  emitToOrg(member.organizationId, "schedule:updated", event);
  emitToSchedule(scheduleId, "schedule:updated", event);

  return NextResponse.json({ assignment: result });
}

export async function DELETE(request: NextRequest) {
  const access = await requireDivisionAccess(request);
  if ("error" in access) return access.error;

  const parsed = removeSchema.safeParse(
    await request.json().catch(() => null)
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Ошибка проверки данных", details: parsed.error.issues },
      { status: 400 }
    );
  }

  const { member, division, canManage } = access;
  const { scheduleId, userId, dayOfWeek } = parsed.data;
  if (!canEditUser(member.userId, userId, canManage)) {
    return NextResponse.json(
      { error: "Можно изменять только собственную строку" },
      { status: 403 }
    );
  }

  const { schedule, divisionMember } = await validateScheduleAndUser(
    scheduleId,
    userId,
    member.organizationId,
    division.id
  );
  if (!schedule || !divisionMember) {
    return NextResponse.json({ error: "Ячейка недоступна" }, { status: 404 });
  }

  await db.$transaction((tx) =>
    removeExistingAssignment(tx, scheduleId, division.id, userId, dayOfWeek)
  );

  const event = {
    scheduleId,
    divisionId: division.id,
    action: "assignment_removed",
    userId,
    dayOfWeek,
  };
  emitToOrg(member.organizationId, "schedule:updated", event);
  emitToSchedule(scheduleId, "schedule:updated", event);

  return NextResponse.json({ success: true });
}
