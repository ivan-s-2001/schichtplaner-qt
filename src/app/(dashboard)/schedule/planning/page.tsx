import { Suspense } from "react";
import { redirect } from "next/navigation";
import { MonthPlanner } from "@/components/schedule/month-planner";

type PlanningPageProps = {
  searchParams: Promise<{ year?: string; month?: string }>;
};

export default async function SchedulePlanningPage({
  searchParams,
}: PlanningPageProps) {
  const params = await searchParams;
  const year = Number(params.year);
  const month = Number(params.month);

  if (
    !Number.isInteger(year) ||
    year < 2000 ||
    year > 2100 ||
    !Number.isInteger(month) ||
    month < 1 ||
    month > 12
  ) {
    const now = new Date();
    const target = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    redirect(
      `/schedule/planning?year=${target.getFullYear()}&month=${target.getMonth() + 1}`
    );
  }

  return (
    <Suspense
      fallback={
        <div className="rounded-lg border p-8 text-sm text-muted-foreground">
          Загрузка планирования…
        </div>
      }
    >
      <MonthPlanner />
    </Suspense>
  );
}
