import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is not configured");

const adapter = new PrismaPg(
  { connectionString },
  { schema: process.env.DATABASE_SCHEMA || "schedule" }
);
const db = new PrismaClient({ adapter });

async function main() {
  const workspace = await db.organization.findFirst({
    where: { deletedAt: null },
    orderBy: { createdAt: "asc" },
  });

  if (!workspace) {
    console.log("Outline workspace отсутствует; seed пропущен.");
    return;
  }

  const existingTimeCategories = await db.timeCategory.count({
    where: { organizationId: workspace.id },
  });
  if (existingTimeCategories === 0) {
    await db.timeCategory.createMany({
      data: [
        { organizationId: workspace.id, name: "Обычное время", enabled: true },
        { organizationId: workspace.id, name: "Сверхурочные", enabled: true },
        { organizationId: workspace.id, name: "Ночная работа", enabled: true },
      ],
    });
  }

  const existingAbsenceCategories = await db.absenceCategory.count({
    where: { organizationId: workspace.id },
  });
  if (existingAbsenceCategories === 0) {
    await db.absenceCategory.createMany({
      data: [
        {
          organizationId: workspace.id,
          name: "Отпуск",
          color: "#FFFFFF",
          isPaid: true,
        },
        {
          organizationId: workspace.id,
          name: "Больничный",
          color: "#FEE2E2",
          isPaid: true,
        },
      ],
    });
  }

  await db.timeSettings.upsert({
    where: { organizationId: workspace.id },
    create: {
      organizationId: workspace.id,
      trackingOptions: "MANUAL,WATCH",
      watchAutoStop: false,
      warningsEnabled: true,
      warningsMaxHours: 10,
      whoCanUse: "ALL",
      useCategories: true,
    },
    update: {},
  });

  console.log("Рабочие справочники расписания заполнены.");
}

main()
  .then(async () => db.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await db.$disconnect();
    process.exit(1);
  });
