import { redirect } from "next/navigation";
import { DivisionScheduleView } from "@/components/schedule/division-schedule-view";
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
    <DivisionScheduleView
      kw={kw}
      weekNumber={weekNumber}
      year={year}
      weekDateStrings={weekDateStrings}
    />
  );
}
