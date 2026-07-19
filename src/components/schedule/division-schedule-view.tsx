"use client";

import { useQuery } from "@tanstack/react-query";
import { EmployeeGridWrapper } from "./employee-grid-wrapper";
import { ShiftLegend } from "./shift-legend";
import { StableScheduleGrid } from "./stable-schedule-grid";
import { ViewSwitcher } from "./view-switcher";
import { WeekNav } from "./week-nav";

type Division = {
  id: string;
  title: string;
  description: string | null;
  color: string;
  scheduleMode: "SHIFT" | "STABLE";
  managerUserId: string | null;
  isManager: boolean;
  isPrimary: boolean;
};

type DivisionsResponse = {
  divisions: Division[];
  selected: Division | null;
};

export function DivisionScheduleView({
  kw,
  weekNumber,
  year,
  weekDateStrings,
}: {
  kw: string;
  weekNumber: number;
  year: number;
  weekDateStrings: string[];
}) {
  const { data, isLoading, error } = useQuery<DivisionsResponse>({
    queryKey: ["outline-divisions"],
    queryFn: async () => {
      const response = await fetch("/api/outline/divisions");
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "Не удалось загрузить подразделения");
      }
      return payload;
    },
  });

  if (isLoading) {
    return (
      <div className="rounded-lg border p-8 text-center text-sm text-muted-foreground">
        Определение основного подразделения…
      </div>
    );
  }

  if (error || !data?.selected) {
    return (
      <div className="rounded-lg border p-8 text-center">
        <h1 className="text-xl font-semibold">Расписание не настроено</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {error instanceof Error
            ? error.message
            : "Администратор должен создать подразделения в настройках Outline и назначить сотрудников."}
        </p>
      </div>
    );
  }

  const division = data.selected;
  const isStable = division.scheduleMode === "STABLE";

  return (
    <div className="schedule-equal-day-columns space-y-5">
      <header className="space-y-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-[26px] font-medium leading-tight text-foreground">
              График: {division.title}
            </h1>
            <span className="rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground">
              {isStable ? "Стабильный личный" : "Сменный"}
            </span>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {isStable
              ? "Личные повторяющиеся графики, нормы и баланс рабочего времени"
              : "Недельная таблица смен; сотрудники самостоятельно меняют своё участие"}
          </p>
        </div>
        {!isStable && <ViewSwitcher kw={kw} />}
      </header>

      {isStable ? (
        <StableScheduleGrid divisionId={division.id} />
      ) : (
        <>
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
        </>
      )}
    </div>
  );
}
