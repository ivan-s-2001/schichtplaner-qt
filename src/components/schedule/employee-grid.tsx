"use client";

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format, isToday } from "date-fns";
import { ru } from "date-fns/locale";
import { Plus } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { DayNotesEditor } from "@/components/schedule/day-notes-editor";
import {
  ShiftAssignmentEditor,
  type ShiftAssignment,
  type ShiftAssignmentTarget,
} from "@/components/schedule/shift-assignment-editor";
import { useCurrentMember } from "@/lib/hooks/use-current-member";
import { resolveShiftTemplate } from "@/lib/schedule/shift-pool";
import { cn } from "@/lib/utils";
import type {
  BookingUser,
  ScheduleAbsence,
  ScheduleData,
  ScheduleDayNote,
  ScheduleDayOff,
} from "@/types/schedule";

interface EmployeeGridProps {
  weekNumber: number;
  year: number;
  weekDates: Date[];
}

type EmployeeMember = {
  id: string;
  role: "OWNER" | "ADMIN" | "MANAGER" | "EMPLOYEE";
  isActive: boolean;
  user: BookingUser & { email: string };
};

type EmployeesResponse = {
  members: EmployeeMember[];
};

type DivisionResponse = {
  selected: {
    id: string;
    title: string;
    scheduleMode: "SHIFT" | "STABLE";
    isManager: boolean;
  } | null;
};

type HolidayCalendarResponse = {
  nonWorkingDates: string[];
};

type EmployeeRow = {
  user: EmployeeMember["user"];
  assignments: Record<number, ShiftAssignment | null>;
};

const DAY_NAMES = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

function getInitials(firstName: string, lastName: string): string {
  return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
}

function getFullName(user: BookingUser): string {
  return [user.lastName, user.firstName, user.patronymic]
    .filter(Boolean)
    .join(" ");
}

function formatHours(value: number): string {
  return value.toLocaleString("ru-RU", {
    minimumFractionDigits: value % 1 === 0 ? 0 : 1,
    maximumFractionDigits: 1,
  });
}

function isDateInsideAbsence(date: Date, absence: ScheduleAbsence): boolean {
  const key = format(date, "yyyy-MM-dd");
  return key >= absence.dateFrom.slice(0, 10) && key <= absence.dateTo.slice(0, 10);
}

function absenceLabel(absence: ScheduleAbsence): string {
  return absence.category.name.toLowerCase().includes("больнич")
    ? "Больничный"
    : "Отпуск";
}

export function EmployeeGrid({ weekNumber, year, weekDates }: EmployeeGridProps) {
  const queryClient = useQueryClient();
  const { data: currentMember } = useCurrentMember();
  const currentUserId = currentMember?.user?.id;
  const [editorTarget, setEditorTarget] =
    useState<ShiftAssignmentTarget | null>(null);

  const calendarYears = useMemo(
    () => [...new Set(weekDates.map((date) => date.getFullYear()))],
    [weekDates]
  );

  const scheduleQuery = useQuery<{ schedule: ScheduleData }>({
    queryKey: ["schedule", weekNumber, year],
    queryFn: async () => {
      const response = await fetch(
        `/api/schedules?kw=${weekNumber}&year=${year}`
      );
      if (!response.ok) throw new Error("Не удалось загрузить график");
      return response.json();
    },
  });

  const employeesQuery = useQuery<EmployeesResponse>({
    queryKey: ["employees", "schedule-grid"],
    queryFn: async () => {
      const response = await fetch("/api/employees?status=all");
      if (!response.ok) throw new Error("Не удалось загрузить сотрудников");
      return response.json();
    },
  });

  const divisionQuery = useQuery<DivisionResponse>({
    queryKey: ["outline-divisions"],
    queryFn: async () => {
      const response = await fetch("/api/outline/divisions");
      if (!response.ok) throw new Error("Не удалось определить подразделение");
      return response.json();
    },
  });

  const holidayQuery = useQuery<HolidayCalendarResponse[]>({
    queryKey: ["holiday-calendar", ...calendarYears],
    queryFn: async () =>
      Promise.all(
        calendarYears.map(async (calendarYear) => {
          const response = await fetch(`/api/holidays?year=${calendarYear}`);
          if (!response.ok) {
            throw new Error("Не удалось загрузить производственный календарь");
          }
          return response.json() as Promise<HolidayCalendarResponse>;
        })
      ),
  });

  const canManage =
    currentMember?.role === "OWNER" ||
    currentMember?.role === "ADMIN" ||
    divisionQuery.data?.selected?.isManager === true;
  const canEditTarget =
    canManage || editorTarget?.user.id === currentUserId;

  const nonWorkingDates = useMemo(
    () =>
      new Set(
        (holidayQuery.data ?? []).flatMap(
          (calendar) => calendar.nonWorkingDates ?? []
        )
      ),
    [holidayQuery.data]
  );

  const schedule = scheduleQuery.data?.schedule;
  const shifts = schedule?.shifts ?? [];

  const rows = useMemo<EmployeeRow[]>(() => {
    const assignments = new Map<string, ShiftAssignment>();
    for (const shift of shifts) {
      for (const booking of shift.bookings) {
        const key = `${booking.userId}:${shift.dayOfWeek}`;
        if (!assignments.has(key)) assignments.set(key, { shift, booking });
      }
    }

    return (employeesQuery.data?.members ?? [])
      .filter((member) => member.isActive !== false && member.role !== "OWNER")
      .map((member) => {
        const dayAssignments = {} as Record<number, ShiftAssignment | null>;
        for (let day = 1; day <= 7; day += 1) {
          dayAssignments[day] =
            assignments.get(`${member.user.id}:${day}`) ?? null;
        }
        return { user: member.user, assignments: dayAssignments };
      })
      .sort((left, right) => {
        if (left.user.id === currentUserId) return -1;
        if (right.user.id === currentUserId) return 1;
        return getFullName(left.user).localeCompare(getFullName(right.user), "ru");
      });
  }, [employeesQuery.data?.members, shifts, currentUserId]);

  const dayNotesByDay = useMemo(() => {
    const result = new Map<number, ScheduleDayNote[]>();
    for (const note of schedule?.dayNotes ?? []) {
      const list = result.get(note.dayOfWeek) ?? [];
      list.push(note);
      result.set(note.dayOfWeek, list);
    }
    return result;
  }, [schedule?.dayNotes]);

  const dayOffByCell = useMemo(() => {
    const result = new Map<string, ScheduleDayOff>();
    for (const dayOff of schedule?.dayOffs ?? []) {
      result.set(`${dayOff.userId}:${dayOff.dayOfWeek}`, dayOff);
    }
    return result;
  }, [schedule?.dayOffs]);

  const absencesByUser = useMemo(() => {
    const result = new Map<string, ScheduleAbsence[]>();
    for (const absence of schedule?.absences ?? []) {
      const list = result.get(absence.userId) ?? [];
      list.push(absence);
      result.set(absence.userId, list);
    }
    return result;
  }, [schedule?.absences]);

  async function invalidateSchedule() {
    await queryClient.invalidateQueries({
      queryKey: ["schedule", weekNumber, year],
    });
  }

  function openCell(
    user: EmployeeMember["user"],
    dayOfWeek: number,
    assignment: ShiftAssignment | null,
    dayOff: ScheduleDayOff | null,
    absence: ScheduleAbsence | null
  ) {
    if (!schedule) return;
    const mayEdit = canManage || user.id === currentUserId;
    if (!mayEdit && !assignment && !dayOff && !absence) return;

    setEditorTarget({
      scheduleId: schedule.id,
      user,
      date: weekDates[dayOfWeek - 1],
      dayOfWeek,
      assignment,
      dayOff,
      absence,
    });
  }

  const loading =
    scheduleQuery.isLoading ||
    employeesQuery.isLoading ||
    divisionQuery.isLoading;
  const error =
    scheduleQuery.error || employeesQuery.error || divisionQuery.error;

  if (loading) return <EmployeeGridSkeleton />;
  if (error || !schedule) {
    return (
      <div className="rounded-lg border p-8 text-center text-destructive">
        Не удалось загрузить недельный график.
      </div>
    );
  }
  if (rows.length === 0) {
    return (
      <div className="rounded-lg border p-12 text-center text-muted-foreground">
        В подразделение пока не назначены сотрудники.
      </div>
    );
  }

  return (
    <>
      <div className="overflow-x-auto rounded-md border border-slate-400 bg-white shadow-sm">
        <table className="w-full min-w-[1080px] border-collapse text-xs">
          <thead>
            <tr>
              <th className="sticky left-0 z-20 w-52 min-w-52 border-b border-r border-slate-400 bg-[#0000FF] px-3 py-3 text-left font-semibold text-white">
                Сотрудник
              </th>
              {weekDates.map((date, index) => {
                const dayOfWeek = index + 1;
                const today = isToday(date);
                const nonWorking = nonWorkingDates.has(
                  format(date, "yyyy-MM-dd")
                );
                return (
                  <th
                    key={date.toISOString()}
                    className={cn(
                      "min-w-36 border-b border-r border-slate-400 px-2 py-2 text-center align-top text-white",
                      nonWorking ? "bg-emerald-700" : "bg-[#0000FF]",
                      today && "ring-2 ring-inset ring-yellow-300"
                    )}
                  >
                    <div className="text-sm font-bold">{DAY_NAMES[index]}</div>
                    <div className="mt-0.5 text-[11px] font-normal">
                      {format(date, "d MMMM", { locale: ru })}
                    </div>
                    <DayNotesEditor
                      scheduleId={schedule.id}
                      dayOfWeek={dayOfWeek}
                      date={date}
                      dayName={DAY_NAMES[index]}
                      notes={dayNotesByDay.get(dayOfWeek) ?? []}
                      canEdit={canManage}
                      onChanged={invalidateSchedule}
                    />
                  </th>
                );
              })}
            </tr>
          </thead>

          <tbody>
            {rows.map((row) => {
              const isCurrent = row.user.id === currentUserId;
              const userAbsences = absencesByUser.get(row.user.id) ?? [];

              return (
                <tr
                  key={row.user.id}
                  className={cn(
                    "group",
                    isCurrent && "bg-indigo-50 ring-2 ring-inset ring-indigo-300"
                  )}
                >
                  <td
                    className={cn(
                      "sticky left-0 z-10 border-b border-r border-slate-300 px-3 py-2",
                      isCurrent ? "bg-indigo-100" : "bg-white"
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <Avatar size="sm">
                        <AvatarFallback className="text-[9px]">
                          {getInitials(row.user.firstName, row.user.lastName)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <div className="truncate font-semibold text-slate-900">
                          {row.user.firstName}
                          {isCurrent && (
                            <span className="ml-1.5 rounded bg-indigo-600 px-1 py-0.5 text-[9px] text-white">
                              Вы
                            </span>
                          )}
                        </div>
                        <div className="truncate text-[10px] text-slate-500">
                          {getFullName(row.user)}
                        </div>
                      </div>
                    </div>
                  </td>

                  {weekDates.map((date, index) => {
                    const dayOfWeek = index + 1;
                    const assignment = row.assignments[dayOfWeek];
                    const dayOff =
                      dayOffByCell.get(`${row.user.id}:${dayOfWeek}`) ?? null;
                    const absence =
                      userAbsences.find((item) => isDateInsideAbsence(date, item)) ??
                      null;
                    const template = assignment
                      ? resolveShiftTemplate(assignment.shift)
                      : null;
                    const overtimeMinutes =
                      assignment?.booking.overtimeMinutes ?? 0;
                    const mayEdit = canManage || isCurrent;
                    const clickable = Boolean(
                      mayEdit || assignment || dayOff || absence
                    );
                    const nonWorking = nonWorkingDates.has(
                      format(date, "yyyy-MM-dd")
                    );

                    return (
                      <td
                        key={dayOfWeek}
                        className={cn(
                          "h-14 border-b border-r border-slate-300 p-1 text-center align-middle",
                          nonWorking && "bg-emerald-50",
                          isToday(date) && "ring-1 ring-inset ring-yellow-300"
                        )}
                      >
                        <button
                          type="button"
                          disabled={!clickable}
                          onClick={() =>
                            openCell(
                              row.user,
                              dayOfWeek,
                              assignment,
                              dayOff,
                              absence
                            )
                          }
                          className={cn(
                            "relative flex min-h-11 w-full items-center justify-center rounded-sm border px-1.5 py-1 text-[11px] font-semibold leading-tight transition",
                            clickable && "hover:ring-2 hover:ring-indigo-400",
                            absence
                              ? "border-red-300 bg-red-50 text-red-900"
                              : assignment
                                ? "shadow-sm"
                                : dayOff
                                  ? "border-slate-300 bg-white text-xl text-slate-700"
                                  : "border-transparent bg-transparent text-slate-400"
                          )}
                          style={
                            assignment && template && !absence
                              ? {
                                  backgroundColor: template.color,
                                  color: template.textColor,
                                  borderColor:
                                    template.color === "#FFFFFF"
                                      ? "#94A3B8"
                                      : template.color,
                                }
                              : undefined
                          }
                        >
                          {absence ? (
                            absenceLabel(absence)
                          ) : assignment && template ? (
                            <span className="whitespace-nowrap">
                              {template.label}
                            </span>
                          ) : dayOff ? (
                            "−"
                          ) : mayEdit ? (
                            <Plus className="size-3.5 opacity-50" />
                          ) : null}

                          {assignment && overtimeMinutes > 0 && !absence && (
                            <span className="absolute right-0.5 top-0.5 rounded-full bg-slate-900 px-1.5 py-0.5 text-[9px] font-extrabold leading-none text-white">
                              П +{formatHours(overtimeMinutes / 60)} ч
                            </span>
                          )}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <ShiftAssignmentEditor
        target={editorTarget}
        canEdit={Boolean(canEditTarget)}
        onClose={() => setEditorTarget(null)}
        onChanged={invalidateSchedule}
      />
    </>
  );
}

function EmployeeGridSkeleton() {
  return (
    <div className="overflow-hidden rounded-md border">
      <div className="flex gap-4 bg-[#0000FF] px-3 py-4">
        <Skeleton className="h-5 w-40" />
        {Array.from({ length: 7 }).map((_, index) => (
          <Skeleton key={index} className="h-12 w-28" />
        ))}
      </div>
      {Array.from({ length: 10 }).map((_, index) => (
        <div key={index} className="flex gap-4 border-t px-3 py-2">
          <Skeleton className="h-10 w-40" />
          {Array.from({ length: 7 }).map((__, day) => (
            <Skeleton key={day} className="h-10 w-28" />
          ))}
        </div>
      ))}
    </div>
  );
}
