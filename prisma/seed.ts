import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is not configured");
}

const adapter = new PrismaPg(
  { connectionString },
  { schema: process.env.DATABASE_SCHEMA || "schedule" }
);
const db = new PrismaClient({ adapter });

async function main() {
  console.log("Первоначальное заполнение базы...");

  const organization = await db.organization.create({
    data: {
      name: "QuickTickets",
      nameFormat: "LASTNAME_FIRSTNAME",
      scheduleVisibility: "ALL",
    },
  });
  console.log(`  Создана организация: ${organization.name}`);

  const admin = await db.user.create({
    data: {
      email: "admin@qksr.ru",
      firstName: "Иван",
      lastName: "Юрин",
      locale: "ru",
      emailVerified: new Date(),
    },
  });

  await db.organizationMember.create({
    data: {
      organizationId: organization.id,
      userId: admin.id,
      role: "OWNER",
      isActive: true,
      isActivated: true,
    },
  });

  await db.timeCategory.createMany({
    data: [
      {
        organizationId: organization.id,
        name: "Обычное время",
        enabled: true,
      },
      {
        organizationId: organization.id,
        name: "Сверхурочные",
        enabled: true,
      },
      {
        organizationId: organization.id,
        name: "Ночная работа",
        enabled: true,
      },
    ],
  });

  await db.absenceCategory.createMany({
    data: [
      {
        organizationId: organization.id,
        name: "Отпуск",
        color: "#FFFFFF",
        isPaid: true,
      },
      {
        organizationId: organization.id,
        name: "Больничный",
        color: "#FEE2E2",
        isPaid: true,
      },
    ],
  });

  await db.timeSettings.create({
    data: {
      organizationId: organization.id,
      trackingOptions: "MANUAL,WATCH",
      watchAutoStop: false,
      warningsEnabled: true,
      warningsMaxHours: 10,
      whoCanUse: "ALL",
      useCategories: true,
    },
  });

  console.log("Первоначальное заполнение завершено.");
  console.log("Локальный владелец: Юрин Иван <admin@qksr.ru>");
  console.log("В рабочей связке пользователи синхронизируются из Outline.");
}

main()
  .then(async () => {
    await db.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await db.$disconnect();
    process.exit(1);
  });
