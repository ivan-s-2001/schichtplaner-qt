import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";

export const DEFAULT_VACATION_DAYS = 20;
export const VACATION_CATEGORY_NAME = "Отпуск";

export type DateSlot = {
  date: Date;
  year: number;
  weekNumber: number;
  dayOfWeek: number;
};

export function parseDateOnly(value: string): Date {
  const result = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(result.getTime())) {
    throw new Error("Некорректная дата");
  }
  return result;
}

export function dateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function isVacationCategoryName(name: string): boolean {
  return /отпуск|vacation|annual\s+leave/i.test(name);
}

export function getDateSlot(date: Date): DateSlot {
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

export function eachDate(from: Date, to: Date): DateSlot[] {
  const result: DateSlot[] = [];
  const current = new Date(from);

  while (current <= to) {
    result.push(getDateSlot(new Date(current)));
    current.setUTCDate(current.getUTCDate() + 1);
  }

  return result;
}

export function countWorkingDays(
  from: Date,
  to: Date,
  clipFrom?: Date,
  clipTo?: Date
): number {
  const start = clipFrom && from < clipFrom ? clipFrom : from;
  const end = clipTo && to > clipTo ? clipTo : to;
  if (start > end) return 0;

  let count = 0;
  const current = new Date(start);
  while (current <= end) {
    const day = current.getUTCDay();
    if (day !== 0 && day !== 6) count += 1;
    current.setUTCDate(current.getUTCDate() + 1);
  }
  return count;
}

export function yearStart(year: number): Date {
  return new Date(Date.UTC(year, 0, 1));
}

export function yearEnd(year: number): Date {
  return new Date(Date.UTC(year, 11, 31));
}

export function assertPeriodInsideYear(from: Date, to: Date, year: number) {
  if (from > to) {
    throw new Error("Дата начала не может быть позже даты окончания");
  }
  if (from < yearStart(year) || to > yearEnd(year)) {
    throw new Error(`Период отпуска должен находиться внутри ${year} года`);
  }
}

export async function ensureVacationAllowanceTable() {
  await db.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS schedule."vacation_allowances" (
      "organizationId" UUID NOT NULL REFERENCES public.teams("id") ON DELETE CASCADE,
      "userId" UUID NOT NULL REFERENCES public.users("id") ON DELETE CASCADE,
      "year" INTEGER NOT NULL,
      "days" INTEGER NOT NULL DEFAULT 20 CHECK ("days" BETWEEN 0 AND 366),
      "updatedById" UUID REFERENCES public.users("id") ON DELETE SET NULL,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY ("organizationId", "userId", "year")
    )
  `);
}

export async function getVacationCategoryIds(organizationId: string) {
  const categories = await db.absenceCategory.findMany({
    where: { organizationId },
    select: { id: true, name: true },
  });
  return categories
    .filter((category) => isVacationCategoryName(category.name))
    .map((category) => category.id);
}

export async function getOrCreateVacationCategory(
  tx: Prisma.TransactionClient,
  organizationId: string
) {
  const categories = await tx.absenceCategory.findMany({
    where: { organizationId },
    orderBy: { name: "asc" },
  });
  const existing = categories.find((category) =>
    isVacationCategoryName(category.name)
  );
  if (existing) return existing;

  return tx.absenceCategory.create({
    data: {
      organizationId,
      name: VACATION_CATEGORY_NAME,
      color: "#FFFFFF",
      isPaid: true,
    },
  });
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
    if ((await tx.booking.count({ where: { shiftId: booking.shiftId } })) === 0) {
      await tx.shift.update({
        where: { id: booking.shiftId },
        data: { deletedAt: new Date() },
      });
    }
  }
}

export async function clearScheduleCellsForPeriod(
  tx: Prisma.TransactionClient,
  organizationId: string,
  divisionId: string,
  userId: string,
  from: Date,
  to: Date
): Promise<string[]> {
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
      organizationId,
      divisionId,
      branchId: null,
      deletedAt: null,
      OR: weekKeys,
    },
    select: { id: true, year: true, weekNumber: true },
  });
  const scheduleByWeek = new Map(
    schedules.map((schedule) => [
      `${schedule.year}-${schedule.weekNumber}`,
      schedule.id,
    ])
  );

  for (const slot of slots) {
    const scheduleId = scheduleByWeek.get(`${slot.year}-${slot.weekNumber}`);
    if (!scheduleId) continue;

    await removeExistingAssignment(
      tx,
      scheduleId,
      divisionId,
      userId,
      slot.dayOfWeek
    );
    await tx.$executeRaw`
      DELETE FROM "schedule_day_offs"
      WHERE "scheduleId" = ${scheduleId}
        AND "userId" = ${userId}
        AND "dayOfWeek" = ${slot.dayOfWeek}
    `;
  }

  return [...new Set(schedules.map((schedule) => schedule.id))];
}
