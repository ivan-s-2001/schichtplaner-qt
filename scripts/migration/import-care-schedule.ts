import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { db } from "../../src/lib/db";
import {
  DEFAULT_SHIFT_POOL,
  type ShiftTemplate,
} from "../../src/lib/schedule/shift-pool";
import { resolveOvertimeAgainstPool } from "../../src/lib/schedule/overtime";

type EmployeeSource = {
  fullName: string;
  lastName: string;
  firstName: string;
  nickname: string;
  email: string;
  scheduled: boolean;
};

type AssignmentSource = {
  date: string;
  employeeEmail: string;
  start: string;
  end: string;
  displayEnd: string;
  overtime: boolean;
  sourceSheet: string;
  sourceCell: string;
};

type MigrationSource = {
  metadata: {
    title: string;
    periodFrom: string;
    periodTo: string;
    counts: Record<string, number>;
  };
  employees: EmployeeSource[];
  assignments: AssignmentSource[];
};

type ResolvedAssignment = AssignmentSource & {
  template: ShiftTemplate;
  overtimeBeforeMinutes: number;
  overtimeAfterMinutes: number;
  overtimeMinutes: number;
};

const IMPORT_MARKER = "[CARE_SCHEDULE_2026_01_07]";
const DIVISION_TITLE = "Служба заботы";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const dataPath = path.join(scriptDir, "care-schedule-2026-01-07.json");
const source = JSON.parse(fs.readFileSync(dataPath, "utf8")) as MigrationSource;
const apply = process.argv.includes("--apply");

function fail(message: string): never {
  throw new Error(message);
}

function parseDate(value: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) fail(`Некорректная дата: ${value}`);
  return new Date(
    Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
  );
}

function isoWeek(value: string): {
  year: number;
  weekNumber: number;
  dayOfWeek: number;
} {
  const date = parseDate(value);
  const dayOfWeek = date.getUTCDay() || 7;
  const thursday = new Date(date);
  thursday.setUTCDate(date.getUTCDate() + 4 - dayOfWeek);
  const year = thursday.getUTCFullYear();
  const yearStart = new Date(Date.UTC(year, 0, 1));
  const weekNumber = Math.ceil(
    ((thursday.getTime() - yearStart.getTime()) / 86400000 + 1) / 7
  );
  return { year, weekNumber, dayOfWeek };
}

function validateSource(): void {
  const emails = new Set<string>();
  const names = new Set<string>();

  for (const employee of source.employees) {
    if (!employee.email || !employee.firstName || !employee.lastName) {
      fail(`Неполные данные сотрудника: ${JSON.stringify(employee)}`);
    }
    const email = employee.email.toLowerCase();
    if (emails.has(email)) fail(`Повторяется email: ${email}`);
    if (names.has(employee.fullName)) fail(`Повторяется ФИО: ${employee.fullName}`);
    emails.add(email);
    names.add(employee.fullName);
  }

  const employeeDays = new Set<string>();
  for (const assignment of source.assignments) {
    const email = assignment.employeeEmail.toLowerCase();
    if (!emails.has(email)) {
      fail(`Смена ссылается на неизвестного сотрудника: ${email}`);
    }
    if (
      !/^\d{2}:\d{2}$/.test(assignment.start) ||
      !/^\d{2}:\d{2}$/.test(assignment.end)
    ) {
      fail(`Некорректное время: ${assignment.start}-${assignment.end}`);
    }

    resolveOvertimeAgainstPool(
      assignment.start,
      assignment.end,
      DEFAULT_SHIFT_POOL
    );

    const date = parseDate(assignment.date);
    if (
      date < parseDate(source.metadata.periodFrom) ||
      date > parseDate(source.metadata.periodTo)
    ) {
      fail(`Смена вне периода импорта: ${assignment.date}`);
    }

    const key = `${email}|${assignment.date}`;
    if (employeeDays.has(key)) {
      fail(`У сотрудника более одной смены на дату: ${key}`);
    }
    employeeDays.add(key);
  }
}

function printPreview(): void {
  const scheduled = new Set(
    source.assignments.map((item) => item.employeeEmail)
  ).size;
  const resolved = source.assignments.map((assignment) =>
    resolveOvertimeAgainstPool(
      assignment.start,
      assignment.end,
      DEFAULT_SHIFT_POOL
    )
  );
  const overtimeAssignments = resolved.filter((item) => item.totalMinutes > 0);

  console.log("");
  console.log("Служба заботы: предварительная проверка");
  console.log(`Период: ${source.metadata.periodFrom} — ${source.metadata.periodTo}`);
  console.log(`Сотрудников в файле: ${source.employees.length}`);
  console.log(`Сотрудников со сменами: ${scheduled}`);
  console.log(`Назначений сотрудник/день: ${source.assignments.length}`);
  console.log(`Переработок: ${overtimeAssignments.length}`);
  console.log(
    "Сотрудники и группа не создаются: они должны существовать в Outline."
  );
}

async function findActor() {
  const admin = await db.organizationMember.findFirst({
    where: { isActive: true, role: "ADMIN" },
    include: { user: true, organization: true },
    orderBy: { joinedAt: "asc" },
  });
  if (admin) return admin;

  return db.organizationMember.findFirst({
    where: { isActive: true },
    include: { user: true, organization: true },
    orderBy: { joinedAt: "asc" },
  });
}

async function ensurePool(organizationId: string): Promise<ShiftTemplate[]> {
  for (const template of DEFAULT_SHIFT_POOL) {
    await db.$executeRaw`
      INSERT INTO "shift_pool_templates"
        (
          "id", "organizationId", "code", "name", "shiftFrom", "shiftTo",
          "color", "textColor", "description", "sortOrder", "isActive",
          "createdAt", "updatedAt"
        )
      VALUES
        (
          ${`${organizationId}:${template.id}`}, CAST(${organizationId} AS uuid),
          ${template.id}, ${template.name}, ${template.shiftFrom}, ${template.shiftTo},
          ${template.color}, ${template.textColor}, ${template.description},
          ${template.sortOrder}, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
        )
      ON CONFLICT ("organizationId", "code") DO NOTHING
    `;
  }

  const rows = await db.$queryRaw<
    Array<{
      code: string;
      name: string;
      shiftFrom: string;
      shiftTo: string;
      color: string;
      textColor: string;
      description: string | null;
      sortOrder: number;
      isActive: boolean;
    }>
  >`
    SELECT
      "code", "name", "shiftFrom", "shiftTo", "color", "textColor",
      "description", "sortOrder", "isActive"
    FROM "shift_pool_templates"
    WHERE "organizationId" = CAST(${organizationId} AS uuid)
      AND "isActive" = true
    ORDER BY "sortOrder" ASC, "createdAt" ASC
  `;

  return rows.map((row) => ({
    id: row.code,
    name: row.name,
    label: `${row.shiftFrom}–${row.shiftTo}`,
    shiftFrom: row.shiftFrom,
    shiftTo: row.shiftTo,
    color: row.color,
    textColor: row.textColor,
    description: row.description,
    sortOrder: row.sortOrder,
    isActive: row.isActive,
  }));
}

async function applyMigration(): Promise<void> {
  const actor = await findActor();
  if (!actor) {
    fail("В Outline не найден активный пользователь.");
  }

  const organizationId = actor.organizationId;
  const actorUserId = actor.userId;
  const division = await db.division.findFirst({
    where: {
      organizationId,
      title: { equals: DIVISION_TITLE, mode: "insensitive" },
      deletedAt: null,
    },
  });
  if (!division) {
    fail(`Создайте группу «${DIVISION_TITLE}» в Outline перед импортом.`);
  }

  const pool = await ensurePool(organizationId);
  const userIds = new Map<string, string>();
  const missingUsers: string[] = [];
  const usersOutsideGroup: string[] = [];

  console.log("Сопоставление сотрудников с Outline...");
  for (const employee of source.employees) {
    const email = employee.email.toLowerCase();
    const user = await db.user.findFirst({
      where: {
        email: { equals: email, mode: "insensitive" },
        memberships: {
          some: { organizationId, isActive: true },
        },
      },
    });

    if (!user) {
      missingUsers.push(email);
      continue;
    }

    const membership = await db.divisionMember.findUnique({
      where: {
        divisionId_userId: {
          divisionId: division.id,
          userId: user.id,
        },
      },
    });
    if (!membership) {
      usersOutsideGroup.push(email);
      continue;
    }

    userIds.set(email, user.id);
  }

  if (missingUsers.length > 0) {
    fail(`В Outline не найдены пользователи: ${missingUsers.join(", ")}`);
  }
  if (usersOutsideGroup.length > 0) {
    fail(
      `Пользователи не состоят в группе «${DIVISION_TITLE}»: ${usersOutsideGroup.join(", ")}`
    );
  }

  const resolvedAssignments: ResolvedAssignment[] = source.assignments.map(
    (assignment) => {
      const resolved = resolveOvertimeAgainstPool(
        assignment.start,
        assignment.end,
        pool
      );
      return {
        ...assignment,
        template: resolved.template,
        overtimeBeforeMinutes: resolved.beforeMinutes,
        overtimeAfterMinutes: resolved.afterMinutes,
        overtimeMinutes: resolved.totalMinutes,
      };
    }
  );

  const weeks = new Map<string, { year: number; weekNumber: number }>();
  for (const assignment of resolvedAssignments) {
    const week = isoWeek(assignment.date);
    weeks.set(`${week.year}-${week.weekNumber}`, {
      year: week.year,
      weekNumber: week.weekNumber,
    });
  }

  const weekValues = [...weeks.values()];
  const scheduleIds = (
    await db.schedule.findMany({
      where: {
        organizationId,
        divisionId: division.id,
        OR: weekValues.map((week) => ({
          year: week.year,
          weekNumber: week.weekNumber,
        })),
      },
      select: { id: true },
    })
  ).map((item) => item.id);

  if (scheduleIds.length > 0) {
    await db.shift.deleteMany({
      where: {
        scheduleId: { in: scheduleIds },
        description: { startsWith: IMPORT_MARKER },
      },
    });
  }

  const grouped = new Map<string, ResolvedAssignment[]>();
  for (const assignment of resolvedAssignments) {
    const key = `${assignment.date}|${assignment.template.id}`;
    const list = grouped.get(key) ?? [];
    list.push(assignment);
    grouped.set(key, list);
  }

  const scheduleCache = new Map<string, string>();
  let createdShifts = 0;
  let createdBookings = 0;
  let overtimeBookings = 0;

  console.log("Импорт графика...");
  for (const [groupKey, group] of [...grouped.entries()].sort(([a], [b]) =>
    a.localeCompare(b)
  )) {
    const first = group[0];
    const week = isoWeek(first.date);
    const scheduleKey = `${week.year}-${week.weekNumber}`;

    let scheduleId = scheduleCache.get(scheduleKey);
    if (!scheduleId) {
      const schedule = await db.schedule.upsert({
        where: {
          organizationId_divisionId_weekNumber_year_branchId: {
            organizationId,
            divisionId: division.id,
            weekNumber: week.weekNumber,
            year: week.year,
            branchId: null,
          },
        },
        update: {
          isPublic: true,
          showTitle: true,
          showPauses: false,
          deletedAt: null,
        },
        create: {
          organizationId,
          divisionId: division.id,
          year: week.year,
          weekNumber: week.weekNumber,
          isPublic: true,
          showTitle: true,
          showPauses: false,
        },
      });
      scheduleId = schedule.id;
      scheduleCache.set(scheduleKey, scheduleId);
    }

    const sourceSheets = [
      ...new Set(group.map((assignment) => assignment.sourceSheet)),
    ].join(",");
    const template = first.template;
    const shift = await db.shift.create({
      data: {
        scheduleId,
        divisionId: division.id,
        dayOfWeek: week.dayOfWeek,
        shiftFrom: template.shiftFrom,
        shiftTo: template.shiftTo,
        maxEmployees: group.length,
        pauseOption: "PER_SHIFT",
        pauseValue: 0,
        title: `pool:${template.id}`,
        description: `${IMPORT_MARKER}; ${first.date}; ${sourceSheets}; ${groupKey}`,
        poolTemplateCode: template.id,
        poolLabel: template.name,
        poolColor: template.color,
        poolTextColor: template.textColor,
        poolDescription: template.description,
      },
    });

    for (const assignment of group) {
      const userId = userIds.get(assignment.employeeEmail.toLowerCase());
      if (!userId) fail(`Пользователь не сопоставлен: ${assignment.employeeEmail}`);

      await db.booking.create({
        data: {
          shiftId: shift.id,
          userId,
          bookedBy: actorUserId,
          overtimeMinutes: assignment.overtimeMinutes,
          overtimeBeforeMinutes: assignment.overtimeBeforeMinutes,
          overtimeAfterMinutes: assignment.overtimeAfterMinutes,
        },
      });

      if (assignment.overtimeMinutes > 0) overtimeBookings += 1;
      createdBookings += 1;
    }

    createdShifts += 1;
  }

  console.log("");
  console.log("Импорт завершён.");
  console.log(`Группа Outline: ${DIVISION_TITLE}`);
  console.log(`Сотрудников сопоставлено: ${userIds.size}`);
  console.log(`Недель графика: ${scheduleCache.size}`);
  console.log(`Смен создано: ${createdShifts}`);
  console.log(`Назначений создано: ${createdBookings}`);
  console.log(`Назначений с переработкой: ${overtimeBookings}`);
  console.log("Личные данные пользователей не изменялись.");
}

async function main(): Promise<void> {
  validateSource();
  printPreview();

  if (!apply) {
    console.log("");
    console.log("Проверка завершена без изменений базы.");
    return;
  }

  await applyMigration();
}

main()
  .catch((error) => {
    console.error("");
    console.error("Ошибка миграции:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
