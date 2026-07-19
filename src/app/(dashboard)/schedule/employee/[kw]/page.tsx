import { redirect } from "next/navigation";
import { EmployeeGridWrapper } from "@/components/schedule/employee-grid-wrapper";
import { ShiftLegend } from "@/components/schedule/shift-legend";
import { ViewSwitcher } from "@/components/schedule/view-switcher";
import { WeekNav } from "@/components/schedule/week-nav";
import {
  formatKW,
  getCurrentKW,
  getWeekDates,
  parseKW,
} from "@/lib/utils/calendar";

interface EmployeeKWPageProps {
  params: Promise<{ kw: string }>;
}

export default async function EmployeeKWPage({ params }: EmployeeKWPageProps) {
  const { kw } = await params;
  const parsed = parseKW(kw);

  if (!parsed) {
    const current = getCurrentKW();
    redirect(`/schedule/employee/${formatKW(current.weekNumber, current.year)}`);
  }

  const { weekNumber, year } = parsed;
  const weekDates = getWeekDates(weekNumber, year);
  const weekDateStrings = weekDates.map((date) => date.toISOString());

  return (
    <div className="schedule-equal-day-columns space-y-5">
      <header className="space-y-3">
        <div>
          <h1 className="text-[26px] font-medium leading-tight text-[#111319]">
            График отдела
          </h1>
          <p className="mt-1 text-sm text-[#66778f]">
            Отдел выбирается из групп Outline в верхней панели
          </p>
        </div>
        <ViewSwitcher kw={kw} />
      </header>

      <WeekNav
        weekNumber={weekNumber}
        year={year}
        baseUrl="/schedule/employee"
      />

      <ShiftLegend />

      <EmployeeGridWrapper
        weekNumber={weekNumber}
        year={year}
        weekDateStrings={weekDateStrings}
      />
    </div>
  );
}
