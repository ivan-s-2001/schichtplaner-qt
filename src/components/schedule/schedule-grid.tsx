"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useFormatter, useTranslations } from "next-intl";
import { isToday } from "date-fns";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useCurrentMember } from "@/lib/hooks/use-current-member";
import { cn } from "@/lib/utils";
import { ShiftCard } from "./shift-card";
import { ShiftForm } from "./shift-form";
import { EmployeeNav } from "./employee-nav";
import { ScheduleOptions } from "./schedule-options";
import { LiveMode, LiveBorder } from "./live-mode";
import { WishFilterToggle, type WishRequest } from "./wish-plan";
import type { ScheduleData, ShiftData } from "@/types/schedule";

interface ScheduleGridProps {
  weekNumber: number;
  year: number;
  weekDates: Date[];
}

export function ScheduleGrid({ weekNumber, year, weekDates }: ScheduleGridProps) {
  const { data: member } = useCurrentMember();
  const t = useTranslations("schedule.grid");
  const tCommon = useTranslations("common");
  const tErrors = useTranslations("errors");
  const format = useFormatter();
  const isManager =
    member?.role === "OWNER" ||
    member?.role === "ADMIN" ||
    member?.role === "MANAGER";

  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(null);
  const [divisionFilter, setDivisionFilter] = useState<string | null>(null);
  const [wishFilterEnabled, setWishFilterEnabled] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [formDay, setFormDay] = useState(1);
  const [editingShift, setEditingShift] = useState<ShiftData | null>(null);

  const { data, isLoading } = useQuery<{ schedule: ScheduleData }>({
    queryKey: ["schedule", weekNumber, year],
    queryFn: async () => {
      const response = await fetch(`/api/schedules?kw=${weekNumber}&year=${year}`);
      if (!response.ok) throw new Error(tErrors("loadSchedule"));
      return response.json();
    },
  });

  const schedule = data?.schedule ?? null;
  const scheduleId = schedule?.id ?? "";
  const shifts = schedule?.shifts ?? [];
  const layout = schedule?.settingsLayout ?? "LAYOUT_1";
  const showTitle = schedule?.showTitle ?? true;
  const showPauses = schedule?.showPauses ?? true;

  const { data: liveData } = useQuery<{
    session: { isActive: boolean } | null;
  }>({
    queryKey: ["live-session", scheduleId],
    queryFn: async () => {
      const response = await fetch(`/api/live?scheduleId=${scheduleId}`);
      if (!response.ok) return { session: null };
      return response.json();
    },
    enabled: Boolean(scheduleId),
  });

  const { data: wishData } = useQuery<{ requests: WishRequest[] }>({
    queryKey: ["mod-requests", scheduleId],
    queryFn: async () => {
      const response = await fetch(`/api/mod-requests?scheduleId=${scheduleId}`);
      if (!response.ok) return { requests: [] };
      return response.json();
    },
    enabled: Boolean(scheduleId),
  });

  const wishRequests = wishData?.requests ?? [];
  const openWishCount = wishRequests.filter((request) => request.state === "OPEN").length;

  const wishByShift = useMemo(() => {
    const result = new Map<string, WishRequest[]>();
    for (const request of wishRequests) {
      const list = result.get(request.shiftId) ?? [];
      list.push(request);
      result.set(request.shiftId, list);
    }
    return result;
  }, [wishRequests]);

  const userWishMap = useMemo(() => {
    const result = new Map<string, WishRequest>();
    const userId = member?.user?.id;
    if (!userId) return result;

    for (const request of wishRequests) {
      if (request.userId === userId) result.set(request.shiftId, request);
    }
    return result;
  }, [wishRequests, member?.user?.id]);

  const shiftsByDay = useMemo(() => {
    let filtered = divisionFilter
      ? shifts.filter((shift) => shift.divisionId === divisionFilter)
      : shifts;

    if (wishFilterEnabled) {
      filtered = filtered.filter((shift) =>
        wishByShift.get(shift.id)?.some((request) => request.state === "OPEN")
      );
    }

    const grouped: Record<number, ShiftData[]> = {};
    for (let day = 1; day <= 7; day++) grouped[day] = [];

    for (const shift of filtered) grouped[shift.dayOfWeek]?.push(shift);
    for (const day of Object.keys(grouped)) {
      grouped[Number(day)].sort((left, right) =>
        left.shiftFrom.localeCompare(right.shiftFrom)
      );
    }

    return grouped;
  }, [shifts, divisionFilter, wishFilterEnabled, wishByShift]);

  function openCreateForm(dayOfWeek: number) {
    setEditingShift(null);
    setFormDay(dayOfWeek);
    setFormOpen(true);
  }

  function openEditForm(shift: ShiftData) {
    setEditingShift(shift);
    setFormDay(shift.dayOfWeek);
    setFormOpen(true);
  }

  if (isLoading) return <ScheduleGridSkeleton />;

  const renderDay = (date: Date, index: number, mobile: boolean) => {
    const dayOfWeek = index + 1;
    const dayShifts = shiftsByDay[dayOfWeek] ?? [];
    const today = isToday(date);
    const weekday = format.dateTime(date, { weekday: "short" });
    const shortDate = format.dateTime(date, { day: "2-digit", month: "2-digit" });

    return (
      <div
        key={dayOfWeek}
        className={cn(
          "rounded-lg border bg-card",
          !mobile && "flex min-h-[200px] flex-col",
          today && "bg-primary/[0.02] ring-2 ring-primary/50"
        )}
      >
        <div
          className={cn(
            "rounded-t-lg border-b px-3 py-2",
            mobile && "flex items-center justify-between px-4 py-2.5",
            today ? "bg-primary/10" : "bg-muted/30"
          )}
        >
          <div>
            <div className="text-sm font-semibold capitalize">{weekday}</div>
            <div className="text-xs text-muted-foreground">{shortDate}</div>
          </div>
          <div className="flex items-center gap-2">
            {today && (
              <span className="rounded-md bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                {tCommon("today")}
              </span>
            )}
            {mobile && dayShifts.length > 0 && (
              <span className="text-xs text-muted-foreground">
                {t("shiftCount", { count: dayShifts.length })}
              </span>
            )}
          </div>
        </div>

        <div className={cn("space-y-2 p-2", mobile && "p-3", !mobile && "flex-1")}>
          {dayShifts.length === 0 && (
            <div className="py-4 text-center text-xs text-muted-foreground">
              {t("noShiftsDay")}
            </div>
          )}

          {dayShifts.map((shift) => (
            <ShiftCard
              key={shift.id}
              shift={shift}
              onEdit={openEditForm}
              isManager={isManager}
              currentUserId={member?.user?.id}
              highlightUserId={selectedEmployeeId}
              layout={layout}
              showTitle={showTitle}
              showPauses={showPauses}
              userWishRequest={userWishMap.get(shift.id) ?? null}
            />
          ))}

          {isManager && (
            <Button
              variant="ghost"
              size="sm"
              className="w-full border border-dashed text-muted-foreground hover:text-foreground"
              onClick={() => openCreateForm(dayOfWeek)}
            >
              <Plus className="size-3.5" />
              {t("addShift")}
            </Button>
          )}
        </div>
      </div>
    );
  };

  return (
    <>
      {schedule && (
        <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
          <ScheduleOptions
            schedule={schedule}
            isManager={isManager}
            divisionFilter={divisionFilter}
            onDivisionFilterChange={setDivisionFilter}
          />
          <div className="flex items-center gap-2">
            {isManager && (
              <WishFilterToggle
                enabled={wishFilterEnabled}
                onToggle={setWishFilterEnabled}
                wishCount={openWishCount}
              />
            )}
            <LiveMode scheduleId={scheduleId} isManager={isManager} />
          </div>
        </div>
      )}

      {shifts.length > 0 && (
        <div className="mb-4">
          <EmployeeNav
            shifts={shifts}
            selectedEmployeeId={selectedEmployeeId}
            onSelectEmployee={setSelectedEmployeeId}
          />
        </div>
      )}

      <LiveBorder isActive={liveData?.session?.isActive ?? false}>
        <div className="hidden gap-2 md:grid md:grid-cols-7">
          {weekDates.map((date, index) => renderDay(date, index, false))}
        </div>
      </LiveBorder>

      <LiveBorder isActive={liveData?.session?.isActive ?? false}>
        <div className="space-y-3 md:hidden">
          {weekDates.map((date, index) => renderDay(date, index, true))}
        </div>
      </LiveBorder>

      {scheduleId && (
        <ShiftForm
          open={formOpen}
          onOpenChange={setFormOpen}
          scheduleId={scheduleId}
          defaultDayOfWeek={formDay}
          shift={editingShift}
        />
      )}
    </>
  );
}

function ScheduleGridSkeleton() {
  return (
    <div className="hidden gap-2 md:grid md:grid-cols-7">
      {Array.from({ length: 7 }).map((_, index) => (
        <div key={index} className="min-h-[200px] rounded-lg border bg-card">
          <div className="rounded-t-lg border-b bg-muted/30 px-3 py-2">
            <Skeleton className="h-4 w-8" />
            <Skeleton className="mt-1 h-3 w-12" />
          </div>
          <div className="space-y-2 p-2">
            <Skeleton className="h-20 w-full rounded-lg" />
            <Skeleton className="h-8 w-full rounded-md" />
          </div>
        </div>
      ))}
    </div>
  );
}
