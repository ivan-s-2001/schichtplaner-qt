"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Clock3, Pencil, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Interval = {
  id?: string;
  kind: "WORK" | "BREAK";
  startMinute: number;
  endMinute: number;
};

type WorkDay = {
  id?: string;
  dayOfWeek: number;
  isWorkingDay: boolean;
  targetMinutes: number | null;
  intervals: Interval[];
};

type StableMember = {
  userId: string;
  name: string;
  email: string | null;
  avatarUrl: string | null;
  dailyTargetMinutes: number;
  weeklyTargetMinutes: number;
  balanceMinutes: number;
  canEdit: boolean;
  days: WorkDay[];
};

type StableScheduleResponse = {
  division: {
    id: string;
    title: string;
    scheduleMode: "STABLE";
    managerUserId: string | null;
  };
  currentUserId: string;
  canManage: boolean;
  members: StableMember[];
};

const dayNames = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

function formatTime(minutes: number): string {
  const safeMinutes = Math.min(minutes, 1439);
  return `${Math.floor(safeMinutes / 60).toString().padStart(2, "0")}:${(
    safeMinutes % 60
  )
    .toString()
    .padStart(2, "0")}`;
}

function parseTime(value: string): number | null {
  const parts = value.split(":");
  if (parts.length !== 2) return null;
  const hours = Number(parts[0]);
  const minutes = Number(parts[1]);
  if (
    !Number.isInteger(hours) ||
    !Number.isInteger(minutes) ||
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59
  ) {
    return null;
  }
  return hours * 60 + minutes;
}

function durationLabel(minutes: number): string {
  const sign = minutes > 0 ? "+" : minutes < 0 ? "−" : "";
  const absolute = Math.abs(minutes);
  return `${sign}${Math.floor(absolute / 60)}:${(absolute % 60)
    .toString()
    .padStart(2, "0")}`;
}

function createDefaultIntervals(targetMinutes: number): Interval[] {
  if (targetMinutes <= 0) return [];
  if (targetMinutes === 480) {
    return [
      { kind: "WORK", startMinute: 480, endMinute: 720 },
      { kind: "WORK", startMinute: 780, endMinute: 1020 },
    ];
  }
  return [
    {
      kind: "WORK",
      startMinute: 480,
      endMinute: Math.min(1439, 480 + targetMinutes),
    },
  ];
}

function editableDays(member: StableMember): WorkDay[] {
  const saved = new Map<number, WorkDay>(
    member.days.map((day) => [day.dayOfWeek, day])
  );

  return Array.from({ length: 7 }, (_, index): WorkDay => {
    const dayOfWeek = index + 1;
    const existing = saved.get(dayOfWeek);
    if (existing) {
      return {
        ...existing,
        intervals: existing.intervals.map(
          (interval): Interval => ({ ...interval })
        ),
      };
    }

    const isWorkingDay = dayOfWeek <= 5;
    return {
      dayOfWeek,
      isWorkingDay,
      targetMinutes: null,
      intervals: isWorkingDay
        ? createDefaultIntervals(member.dailyTargetMinutes)
        : [],
    };
  });
}

export function StableScheduleGrid({ divisionId }: { divisionId: string }) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<StableMember | null>(null);

  const { data, isLoading, error } = useQuery<StableScheduleResponse>({
    queryKey: ["stable-schedule", divisionId],
    queryFn: async () => {
      const response = await fetch(
        `/api/stable-schedule?divisionId=${encodeURIComponent(divisionId)}`
      );
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "Не удалось загрузить график");
      }
      return payload;
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (member: StableMember) => {
      const response = await fetch("/api/stable-schedule", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          divisionId,
          userId: member.userId,
          dailyTargetMinutes: member.dailyTargetMinutes,
          weeklyTargetMinutes: member.weeklyTargetMinutes,
          days: member.days,
        }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "Не удалось сохранить график");
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["stable-schedule", divisionId],
      });
      setEditing(null);
      toast.success("Личный график сохранён");
    },
    onError: (mutationError: Error) => toast.error(mutationError.message),
  });

  if (isLoading) {
    return (
      <div className="rounded-lg border p-8 text-center text-sm text-muted-foreground">
        Загрузка стабильного графика…
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className="rounded-lg border border-destructive/30 p-8 text-center text-sm text-destructive">
        {error instanceof Error ? error.message : "График недоступен"}
      </div>
    );
  }
  if (data.members.length === 0) {
    return (
      <div className="rounded-lg border p-8 text-center text-sm text-muted-foreground">
        В подразделение пока не назначены сотрудники.
      </div>
    );
  }

  return (
    <>
      <div className="overflow-x-auto rounded-lg border bg-card">
        <table className="w-full min-w-[1100px] border-collapse text-sm">
          <thead>
            <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
              <th className="sticky left-0 z-10 min-w-64 bg-muted/95 px-4 py-3">
                Сотрудник
              </th>
              <th className="w-28 px-3 py-3">Норма</th>
              {dayNames.map((day) => (
                <th key={day} className="min-w-28 px-3 py-3 text-center">
                  {day}
                </th>
              ))}
              <th className="w-24 px-3 py-3 text-center">Баланс</th>
            </tr>
          </thead>
          <tbody>
            {data.members.map((member) => {
              const isCurrent = member.userId === data.currentUserId;
              const memberDays = new Map<number, WorkDay>(
                member.days.map((day) => [day.dayOfWeek, day])
              );

              return (
                <tr
                  key={member.userId}
                  className={cn(
                    "border-b last:border-b-0",
                    isCurrent &&
                      "bg-primary/[0.07] ring-1 ring-inset ring-primary/25"
                  )}
                >
                  <td
                    className={cn(
                      "sticky left-0 z-[5] px-4 py-3",
                      isCurrent ? "bg-primary/[0.07]" : "bg-card"
                    )}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate font-medium">
                          {member.name}
                          {isCurrent && (
                            <span className="ml-2 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary">
                              Вы
                            </span>
                          )}
                        </div>
                        {member.email && (
                          <div className="truncate text-xs text-muted-foreground">
                            {member.email}
                          </div>
                        )}
                      </div>
                      {member.canEdit && (
                        <button
                          type="button"
                          title="Изменить график"
                          className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                          onClick={() =>
                            setEditing({
                              ...member,
                              days: editableDays(member),
                            })
                          }
                        >
                          <Pencil className="size-4" />
                        </button>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-3 text-xs">
                    <div>
                      {durationLabel(member.dailyTargetMinutes).replace("+", "")}
                      /день
                    </div>
                    <div className="text-muted-foreground">
                      {durationLabel(member.weeklyTargetMinutes).replace("+", "")}
                      /нед.
                    </div>
                  </td>
                  {dayNames.map((_, index) => {
                    const day = memberDays.get(index + 1);
                    const intervals: Interval[] =
                      day?.intervals.filter(
                        (interval: Interval) => interval.kind === "WORK"
                      ) ?? [];
                    return (
                      <td
                        key={index}
                        className="border-l px-2 py-3 text-center text-xs"
                      >
                        {!day || !day.isWorkingDay || intervals.length === 0 ? (
                          <span className="text-muted-foreground">Выходной</span>
                        ) : (
                          <div className="space-y-1">
                            {intervals.map((interval: Interval) => (
                              <div
                                key={
                                  interval.id ??
                                  `${interval.startMinute}-${interval.endMinute}`
                                }
                                className="whitespace-nowrap font-medium"
                              >
                                {formatTime(interval.startMinute)}–
                                {formatTime(interval.endMinute)}
                              </div>
                            ))}
                          </div>
                        )}
                      </td>
                    );
                  })}
                  <td
                    className={cn(
                      "px-3 py-3 text-center font-medium",
                      member.balanceMinutes < 0 && "text-destructive",
                      member.balanceMinutes > 0 && "text-emerald-600"
                    )}
                  >
                    {durationLabel(member.balanceMinutes)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {editing && (
        <StableEditor
          member={editing}
          canManage={data.canManage}
          saving={saveMutation.isPending}
          onChange={setEditing}
          onClose={() => setEditing(null)}
          onSave={() => saveMutation.mutate(editing)}
        />
      )}
    </>
  );
}

function StableEditor({
  member,
  canManage,
  saving,
  onChange,
  onClose,
  onSave,
}: {
  member: StableMember;
  canManage: boolean;
  saving: boolean;
  onChange: (member: StableMember) => void;
  onClose: () => void;
  onSave: () => void;
}) {
  function changeDay(dayOfWeek: number, change: (day: WorkDay) => WorkDay) {
    onChange({
      ...member,
      days: member.days.map((day) =>
        day.dayOfWeek === dayOfWeek ? change(day) : day
      ),
    });
  }

  function changeTime(
    dayOfWeek: number,
    intervalIndex: number,
    field: "startMinute" | "endMinute",
    value: string
  ) {
    const minutes = parseTime(value);
    if (minutes === null) return;
    changeDay(dayOfWeek, (day) => ({
      ...day,
      intervals: day.intervals.map((interval, index) =>
        index === intervalIndex ? { ...interval, [field]: minutes } : interval
      ),
    }));
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onMouseDown={onClose}
    >
      <section
        className="max-h-[92vh] w-full max-w-5xl overflow-y-auto rounded-xl border bg-background p-5 shadow-xl"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold">График: {member.name}</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Перерыв между рабочими интервалами не входит в рабочее время.
              Сумма интервалов должна совпадать с назначенной нормой.
            </p>
          </div>
          <button type="button" className="rounded p-2 hover:bg-muted" onClick={onClose}>
            <X className="size-5" />
          </button>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <label className="space-y-1 text-sm">
            <span className="text-muted-foreground">Часов в обычный день</span>
            <input
              type="number"
              min={0}
              max={24}
              step={0.25}
              disabled={!canManage}
              value={member.dailyTargetMinutes / 60}
              onChange={(event) =>
                onChange({
                  ...member,
                  dailyTargetMinutes: Math.round(Number(event.target.value) * 60),
                })
              }
              className="h-9 w-full rounded-md border bg-background px-3 disabled:opacity-70"
            />
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-muted-foreground">Часов в неделю</span>
            <input
              type="number"
              min={0}
              max={168}
              step={0.25}
              disabled={!canManage}
              value={member.weeklyTargetMinutes / 60}
              onChange={(event) =>
                onChange({
                  ...member,
                  weeklyTargetMinutes: Math.round(Number(event.target.value) * 60),
                })
              }
              className="h-9 w-full rounded-md border bg-background px-3 disabled:opacity-70"
            />
          </label>
        </div>

        <div className="mt-5 space-y-3">
          {member.days.map((day) => {
            const intervals: Interval[] = day.intervals.filter(
              (interval: Interval) => interval.kind === "WORK"
            );
            const worked = intervals.reduce(
              (sum, interval) =>
                sum + interval.endMinute - interval.startMinute,
              0
            );
            const target = day.targetMinutes ?? member.dailyTargetMinutes;

            return (
              <div
                key={day.dayOfWeek}
                className="grid gap-3 rounded-lg border p-3 md:grid-cols-[90px_1fr_120px] md:items-center"
              >
                <label className="flex items-center gap-2 font-medium">
                  <input
                    type="checkbox"
                    checked={day.isWorkingDay}
                    onChange={(event) =>
                      changeDay(day.dayOfWeek, (current) => ({
                        ...current,
                        isWorkingDay: event.target.checked,
                        intervals: event.target.checked
                          ? current.intervals.length > 0
                            ? current.intervals
                            : createDefaultIntervals(member.dailyTargetMinutes)
                          : [],
                      }))
                    }
                  />
                  {dayNames[day.dayOfWeek - 1]}
                </label>

                {day.isWorkingDay ? (
                  <div className="flex flex-wrap items-center gap-2">
                    {intervals.map((interval, index) => (
                      <div
                        key={index}
                        className="flex items-center gap-1 rounded-md bg-muted/50 p-1.5"
                      >
                        <input
                          type="time"
                          value={formatTime(interval.startMinute)}
                          onChange={(event) =>
                            changeTime(
                              day.dayOfWeek,
                              index,
                              "startMinute",
                              event.target.value
                            )
                          }
                          className="h-8 rounded border bg-background px-2"
                        />
                        <span>—</span>
                        <input
                          type="time"
                          value={formatTime(interval.endMinute)}
                          onChange={(event) =>
                            changeTime(
                              day.dayOfWeek,
                              index,
                              "endMinute",
                              event.target.value
                            )
                          }
                          className="h-8 rounded border bg-background px-2"
                        />
                        <button
                          type="button"
                          className="rounded p-1 text-muted-foreground hover:text-destructive"
                          onClick={() =>
                            changeDay(day.dayOfWeek, (current) => ({
                              ...current,
                              intervals: current.intervals.filter(
                                (_, currentIndex) => currentIndex !== index
                              ),
                            }))
                          }
                        >
                          <X className="size-3.5" />
                        </button>
                      </div>
                    ))}
                    {intervals.length < 3 && (
                      <button
                        type="button"
                        className="rounded-md border border-dashed px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground"
                        onClick={() =>
                          changeDay(day.dayOfWeek, (current) => {
                            const last = current.intervals.at(-1);
                            const startMinute = last?.endMinute ?? 480;
                            return {
                              ...current,
                              intervals: [
                                ...current.intervals,
                                {
                                  kind: "WORK",
                                  startMinute,
                                  endMinute: Math.min(1439, startMinute + 60),
                                },
                              ],
                            };
                          })
                        }
                      >
                        + интервал
                      </button>
                    )}
                  </div>
                ) : (
                  <span className="text-sm text-muted-foreground">Выходной</span>
                )}

                <div
                  className={cn(
                    "flex items-center gap-1 text-sm",
                    day.isWorkingDay && worked !== target
                      ? "text-destructive"
                      : "text-muted-foreground"
                  )}
                >
                  <Clock3 className="size-4" />
                  {durationLabel(worked).replace("+", "")} /{" "}
                  {durationLabel(day.isWorkingDay ? target : 0).replace("+", "")}
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Отмена
          </Button>
          <Button type="button" disabled={saving} onClick={onSave}>
            {saving ? "Сохранение…" : "Сохранить график"}
          </Button>
        </div>
      </section>
    </div>
  );
}
