import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentMember, isManagerOrAbove } from "@/lib/auth-helpers";
import { getSelectedDivision } from "@/lib/selected-division";
import { emitToOrg, emitToSchedule } from "@/lib/emit";

const cellStatusSchema = z.object({
  scheduleId: z.string().min(1),
  userId: z.string().min(1),
  dayOfWeek: z.number().int().min(1).max(7),
  type: z.enum(["DAY_OFF", "VACATION", "SICK", "CLEAR"]),
  dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  absenceId: z.string().min(1).optional(),
});

type DateSlot = {
  date: Date;
  year: number;
  weekNumber: number;
  dayOfWeek: number;
};

function parseDate(value: string): Date {
  const result = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(result.getTime())) {
    throw new Error("Некорректная дата");
  }
  return result;
}

function getDateForSchedule(
  year: number,
  weekNumber: number,
  dayOfWeek: number
): Date {
  const januaryFourth = new Date(Date.UTC(year, 0, 4));
  const januaryFourthDay = januaryFourth.getUTCDay() || 7;
  const weekOneMonday = new Date(januaryFourth);
  weekOneMonday.setUTCDate(
    januaryFourth.getUTCDate() - januaryFourthDay + 1
  );

  const result = new Date(weekOneMonday);
  result.setUTCDate(
    weekOneMonday.getUTCDate() + (weekNumber - 1) * 7 + dayOfWeek - 1
  );
  return result;
}

function getDateSlot(date: Date): DateSlot {
  const dayOfWeek = date.getUTCDay() || 7;
  const thursday = new Date(date);
  thursday.setUTCDate(date.getUTCDate() + 4 - dayOfWeek);
  const year = thursday.getUTCFullYear();
  const yearStart = new Date(Date.UTC(year, 0, 1));
  const weekNumber = Math.ceil(
    ((thursday.getTime() - yearStart.getTime()) / 86400000 + 1) / 7
  );

  return { date, year, weekNumber, dayOfWeek };
}

function eachDate(from: Date, to: Date): DateSlot[] {
  const result: DateSlot[] = [];
  const current = new Date(from);

  while (current <= to) {
    result.push(getDateSlot(new Date(current)));
    current.setUTCDate(current.getUTCDate() + 1);
  }

  return result;
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

export async function POST(request: NextRequest) {
  const access = await requireManager(request);
  if ("error" in access) return access.error;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Некорректный JSON" }, { status: 400 });
  }

  const parsed = cellStatusSchema.safeParse(body);
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
    type,
    dateFrom,
    dateTo,
    absenceId,
  } = parsed.data;

  const [schedule, targetMember, divisionMembership] = await Promise.all([
    db.schedule.findFirst({
      where: {
        id: scheduleId,
        organizationId: member.organizationId,
        deletedAt: null,
      },
      select: { id: true, year: true, weekNumber: true },
    }),
    db.organizationMember.findFirst({
      where: {
        organizationId: member.organizationId,
        userId,
        isActive: true,
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

  if (!schedule || !targetMember || !divisionMembership) {
    return NextResponse.json(
      { error: "Ячейка выбранного отдела не найдена" },
      { status: 404 }
    );
  }

  const selectedDate = getDateForSchedule(
    schedule.year,
    schedule.weekNumber,
    dayOfWeek
  );

  try {
    const result = await db.$transaction(async (tx) => {
      if (type === "CLEAR") {
        await removeExistingAssignment(
          tx,
          scheduleId,
          division.id,
          userId,
          dayOfWeek
        );
        await tx.$executeRaw`
          DELETE FROM "schedule_day_offs"
          WHERE "scheduleId" = ${scheduleId}
            AND "userId" = ${userId}
            AND "dayOfWeek" = ${dayOfWeek}
        `;

        if (absenceId) {
          const absence = await tx.absence.findFirst({
            where: {
              id: absenceId,
              userId,
              user: {
                memberships: {
                  some: {
                    organizationId: member.organizationId,
                    isActive: true,
                  },
                },
              },
            },
            select: { id: true },
          });

          if (absence) {
            await tx.absence.delete({ where: { id: absence.id } });
          }
        }

        return { type };
      }

      if (type === "DAY_OFF") {
        const overlappingAbsence = await tx.absence.findFirst({
          where: {
            userId,
            status: "APPROVED",
            dateFrom: { lte: selectedDate },
            dateTo: { gte: selectedDate },
          },
          select: { id: true },
        });

        if (overlappingAbsence) {
          throw new Error(
            "На этот день уже задан отпуск или больничный. Сначала измените период отсутствия."
          );
        }

        await removeExistingAssignment(
          tx,
          scheduleId,
          division.id,
          userId,
          dayOfWeek
        );
        await tx.$executeRaw`
          INSERT INTO "schedule_day_offs"
            ("id", "scheduleId", "userId", "dayOfWeek", "createdAt", "updatedAt")
          VALUES
            (${randomUUID()}, ${scheduleId}, ${userId}, ${dayOfWeek}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
          ON CONFLICT ("scheduleId", "userId", "dayOfWeek")
          DO UPDATE SET "updatedAt" = CURRENT_TIMESTAMP
        `;

        return { type };
      }

      if (!dateFrom || !dateTo) {
        throw new Error("Для отсутствия укажите период с и по");
      }

      const from = parseDate(dateFrom);
      const to = parseDate(dateTo);
      if (from > to) {
        throw new Error("Дата начала не может быть позже даты окончания");
      }

      const slots = eachDate(from, to);
      const weekKeys = [
        ...new Map(
          slots.map((slot) => [
            `${slot.year}-${slot.weekNumber}`,
            { year: slot.year, weekNumber: slot.weekNumber },
          ])
        ).values(),
      ];

      const schedules = await tx.schedule.findMany({
        where: {
          organizationId: member.organizationId,
          branchId: null,
          deletedAt: null,
          OR: weekKeys,
        },
        select: { id: true, year: true, weekNumber: true },
      });
      const scheduleByWeek = new Map(
        schedules.map((item) => [
          `${item.year}-${item.weekNumber}`,
          item.id,
        ])
      );

      for (const slot of slots) {
        const targetScheduleId = scheduleByWeek.get(
          `${slot.year}-${slot.weekNumber}`
        );
        if (!targetScheduleId) continue;

        await removeExistingAssignment(
          tx,
          targetScheduleId,
          division.id,
          userId,
          slot.dayOfWeek
        );
        await tx.$executeRaw`
          DELETE FROM "schedule_day_offs"
          WHERE "scheduleId" = ${targetScheduleId}
            AND "userId" = ${userId}
            AND "dayOfWeek" = ${slot.dayOfWeek}
        `;
      }

      const categoryName = type === "VACATION" ? "Отпуск" : "Больничный";
      const categoryColor = type === "VACATION" ? "#FFFFFF" : "#FEE2E2";
      let category = await tx.absenceCategory.findFirst({
        where: {
          organizationId: member.organizationId,
          name: { equals: categoryName, mode: "insensitive" },
        },
      });

      if (!category) {
        category = await tx.absenceCategory.create({
          data: {
            organizationId: member.organizationId,
            name: categoryName,
            color: categoryColor,
            isPaid: true,
          },
        });
      }

      if (absenceId) {
        const existing = await tx.absence.findFirst({
          where: {
            id: absenceId,
            userId,
            user: {
              memberships: {
                some: {
                  organizationId: member.organizationId,
                  isActive: true,
                },
              },
            },
          },
          select: { id: true },
        });

        if (!existing) {
          throw new Error("Период отсутствия не найден");
        }

        const absence = await tx.absence.update({
          where: { id: existing.id },
          data: {
            categoryId: category.id,
            dateFrom: from,
            dateTo: to,
            status: "APPROVED",
          },
        });

        return { type, absenceId: absence.id };
      }

      const absence = await tx.absence.create({
        data: {
          userId,
          categoryId: category.id,
          dateFrom: from,
          dateTo: to,
          status: "APPROVED",
          note: "Добавлено из графика",
        },
      });

      return { type, absenceId: absence.id };
    });

    emitToOrg(member.organizationId, "schedule:updated", {
      scheduleId,
      divisionId: division.id,
      action: "cell_status_changed",
      userId,
      dayOfWeek,
    });
    emitToSchedule(scheduleId, "schedule:updated", {
      scheduleId,
      divisionId: division.id,
      action: "cell_status_changed",
      userId,
      dayOfWeek,
    });

    return NextResponse.json({ cell: result });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Не удалось изменить состояние ячейки",
      },
      { status: 409 }
    );
  }
}
