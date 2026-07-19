import "dotenv/config";
import { db } from "../src/lib/db";

async function main() {
  const timeCategories = [
    ["Normal", "Обычное время"],
    ["Überstunden", "Сверхурочные"],
    ["Nachtarbeit", "Ночная работа"],
  ] as const;
  for (const [oldName, name] of timeCategories) {
    await db.timeCategory.updateMany({ where: { name: oldName }, data: { name } });
  }

  const absenceCategories = [
    ["Urlaub", "Отпуск"],
    ["Krank", "Больничный"],
    ["Fortbildung", "Обучение"],
  ] as const;
  for (const [oldName, name] of absenceCategories) {
    await db.absenceCategory.updateMany({ where: { name: oldName }, data: { name } });
  }

  const shiftTitles = [
    ["Frühschicht", "Утренняя смена"],
    ["Spätschicht", "Вечерняя смена"],
    ["Tagschicht", "Дневная смена"],
    ["Samstagsschicht", "Субботняя смена"],
  ] as const;
  for (const [oldTitle, title] of shiftTitles) {
    await db.shift.updateMany({ where: { title: oldTitle }, data: { title } });
  }

  await db.absence.updateMany({
    where: { note: "Familienurlaub" },
    data: { note: "Семейный отпуск" },
  });

  console.log("Schedule-owned demo data localized to Russian.");
  console.log("Users, groups and workspace names remain authoritative in Outline.");
}

main()
  .then(() => db.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await db.$disconnect();
    process.exit(1);
  });
