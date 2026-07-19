import { Suspense } from "react";
import { MonthPlanner } from "@/components/schedule/month-planner";

export default function SchedulePlanningPage() {
  return (
    <Suspense fallback={<div className="rounded-lg border p-8 text-sm text-muted-foreground">Загрузка планирования…</div>}>
      <MonthPlanner />
    </Suspense>
  );
}
