"use client";

import { useMemo, useState } from "react";
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

type EditableMember = StableMember & { days: WorkDay[] };

const dayNames = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

function formatTime(minutes: number) {
  const hours = Math.floor(minutes / 60)
    .toString()
    .padStart(2, "0");
  const mins = (minutes % 60).toString().padStart(2, "0");
  return `${hours}:${mins}`;
}

function parseTime(value: string): number | null {
  if (!/^\d{2}:\d{2}$/.test(value)) return null;
  const [hours, minutes] = value.split(":").map(Number);
  const total = hours * 60 + minutes;
  return total >= 0 && total <= 1440 ? total : null;
}

function durationLabel(minutes: number) {
  const sign = minutes > 0 ? "+" : minutes < 0 ? "−" : "";
  const absolute = Math.abs(minutes);
  const hours = Math.floor(absolute / 60);
  const rest = absolute % 60;
  return `${sign}${hours}:${rest.toString().padStart(2, "0")}`;
}

function defaultDays(member: StableMember): WorkDay[] {
  const existing = new Map(member.days.map((day) => [day.dayOfWeek, day]));
  return Array.from({ length: 7 }, (_, index) => {
    const dayOfWeek = index + 1;
    const saved = existing.get(dayOfWeek);
    if (saved) {
      return {
        ...saved,
        intervals: saved.intervals.map((interval) => ({ ...interval })),
      };
    }

    const isWorkingDay = dayOfWeek <= 5;
    const target = member.dailyTargetMinutes;
    const intervals: Interval[] = [];
    if (isWorkingDay && target > 0) {
      if (target === 480) {
        intervals.push(
          { kind: "WORK", startMinute: 8 * 60, endMinute: 12 * 60 },
          { kind: "WORK", startMinute: 13 * 60, endMinute: 17 * 60 }
        );
      } else {
        intervals.push({
          kind: "WORK",
          startMinute: 8 * 60,
          endMinute: Math.min(24 * 60, 8 * 60 + target),
        });
      }
    }

    return {
      dayOfWeek,
      isWorkingDay,
      targetMinutes: null,
      intervals,
    };
  });
}

export function StableScheduleGrid({ divisionId }: { divisionId: string }) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<EditableMember | null>(null);

  const { data, isLoading, error } = useQuery<StableScheduleResponse>({
    queryKey: ["stable-schedule", divisionId],
    queryFn: async () => {
      const response = await fetch(
        `/api/stable-schedule?divisionId=${encodeURIComponent(divisionId)}`
      );
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Не удалось загрузить график");
      return payload;
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (member: EditableMember) => {
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
      if (!response.ok) throw new Error(payload.error || "Не удалось сохранить график");
      return payload;
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

  const daysByMember = useMemo(() => {
    const result = new Map<string, Map<number, WorkDay>>();
    for (const member of data?.members ?? []) {
      result.set(
        member.userId,
        new Map(member.days.map((day) => [day.dayOfWeek, day]))
      );
    }
    return result;
  }, [data?.members]);

  if (isLoading) {
    return <div className="rounded-lg border p-8 text-center text-sm text-muted-foreground">Загрузка стабильного графика…</div>;
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
        <table className="min-w-[1100px] w-full border-collapse text-sm">
          <thead>
            <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
              <th className="sticky left-0 z-10 min-w-64 bg-muted/95 px-4 py-3">Сотрудник</th>
              <th className="w-28 px-3 py-3">Норма</th>
              {dayNames.map((day) => (
                <th key={day} className="min-w-28 px-3 py-3 text-center">{day}</th>
              ))}
              <th className="w-24 px-3 py-3 text-center">Баланс</th>
            </tr>
          </thead>
          <tbody>
            {data.members.map((member) => {
              const isCurrent = member.userId === data.currentUserId;
              const memberDays = daysByMember.get(member.userId) ?? new Map();
              return (
                <tr
                  key={member.userId}
                  className={cn(
                    "border-b last:border-b-0",
                    isCurrent && "bg-primary/[0.07] ring-1 ring-inset ring-primary/25"
                  )}
                >
                  <td className={cn("sticky left-0 z-[5] px-4 py-3", isCurrent ? "bg-primary/[0.07]" : "bg-card")}>
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate font-medium">
                          {member.name}
                          {isCurrent && (
                            <span className="ml-2 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary">Вы</span>
                          )}
                        </div>
                        {member.email && (
                          <div className="truncate text-xs text-muted-foreground">{member.email}</div>
                        )}
                      </div>
                      {member.canEdit && (
                        <button
                          type="button"
                          title="Изменить график"
                          className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                          onClick={() =>
                            setEditing({ ...member, days: defaultDays(member) })
                          }
                        >
                          <Pencil className="size-4" />
                        </button>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-3 text-xs">
                    <div>{durationLabel(member.dailyTargetMinutes).replace("+", "")}/день</div>
                    <div className="text-muted-foreground">{durationLabel(member.weeklyTargetMinutes).replace("+", "")}/нед.</div>
                  </td>
                  {Array.from({ length: 7 }, (_, index) => {
                    const day = memberDays.get(index + 1);
                    const work = day?.intervals.filter((interval) => interval.kind === "WORK") ?? [];
                    return (
                      <td key={index} className="border-l px-2 py-3 text-center text-xs">
                        {!day || !day.isWorkingDay || work.length === 0 ? (
                          <span className="text-muted-foreground">Выходной</span>
                        ) : (
                          <div className="space-y-1">
                            {work.map((interval) => (
                              <div key={interval.id ?? `${interval.startMinute}-${interval.endMinute}`} className="whitespace-nowrap font-medium">
                                {formatTime(interval.startMinute)}–{formatTime(interval.endMinute)}
                              </div>
                            ))}
                          </div>
                        )}
                      </td>
                    );
                  })}
                  <td className={cn("px-3 py-3 text-center font-medium", member.balanceMinutes < 0 && "text-destructive", member.balanceMinutes > 0 && "text-emerald-600")}>
                    {durationLabel(member.balanceMinutes)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {editing && (
        <StableScheduleEditor
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

function StableScheduleEditor({
  member,
  canManage,
  saving,
  onChange,
  onClose,
  onSave,
}: {
  member: EditableMember;
  canManage: boolean;
  saving: boolean;
  onChange: (member: EditableMember) => void;
  onClose: () => void;
  onSave: () => void;
}) {
  function updateDay(dayOfWeek: number, updater: (day: WorkDay) => WorkDay) {
    onChange({
      ...member,
      days: member.days.map((day) =>
        day.dayOfWeek === dayOfWeek ? updater(day) : day
      ),
    });
  }

  function updateInterval(
    dayOfWeek: number,
    index: number,
    field: "startMinute" | "endMinute",
    value: string
  ) {
    const parsed = parseTime(value);
    if (parsed === null) return;
    updateDay(dayOfWeek, (day) => ({
      ...day,
      intervals: day.intervals.map((interval, intervalIndex) =>
        intervalIndex === index ? { ...interval, [field]: parsed } : interval
      ),
    }));
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onMouseDown={onClose}>
      <section className="max-h-[92vh] w-full max-w-5xl overflow-y-auto rounded-xl border bg-background p-5 shadow-xl" onMouseDown={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold">График: {member.name}</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Рабочие интервалы должны точно соответствовать назначенной норме. Перерыв между интервалами не входит в рабочее время.
            </p>
          </div>
          <button type="button" className="rounded p-2 hover:bg-muted" onClick={onClose}>
            <X className="size-5" />
          </button>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <label className="space-y-1 text-sm">
            <span className="text-muted-foreground">Рабочих часов в обычный день</span>
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
            <span className="text-muted-foreground">Рабочих часов в неделю</span>
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
            const workIntervals = day.intervals.filter((interval) => interval.kind === "WORK");
            const workMinutes = workIntervals.reduce(
              (sum, interval) => sum + interval.endMinute - interval.startMinute,
              0
            );
            const target = day.targetMinutes ?? member.dailyTargetMinutes;
            return (
              <div key={day.dayOfWeek} className="grid gap-3 rounded-lg border p-3 md:grid-cols-[90px_1fr_110px] md:items-center">
                <label className="flex items-center gap-2 font-medium">
                  <input
                    type="checkbox"
                    checked={day.isWorkingDay}
                    onChange={(event) =>
                      updateDay(day.dayOfWeek, (current) => ({
                        ...current,
                        isWorkingDay: event.target.checked,
                        intervals: event.target.checked ? current.intervals : [],
                      }))
                    }
                  />
                  {dayNames[day.dayOfWeek - 1]}
                </label>

                {day.isWorkingDay ? (
                  <div className="flex flex-wrap items-center gap-2">
                    {workIntervals.map((interval, index) => (
                      <div key={index} className="flex items-center gap-1 rounded-md bg-muted/50 p-1.5">
                        <input
                          type="time"
                          value={formatTime(interval.startMinute)}
                          onChange={(event) =>
                            updateInterval(day.dayOfWeek, index, "startMinute", event.target.value)
                          }
                          className="h-8 rounded border bg-background px-2"
                        />
                        <span>—</span>
                        <input
                          type="time"
                          value={formatTime(interval.endMinute)}
                          onChange={(event) =>
                            updateInterval(day.dayOfWeek, index, "endMinute", event.target.value)
                          }
                          className="h-8 rounded border bg-background px-2"
                        />
                        <button
                          type="button"
                          className="rounded p-1 text-muted-foreground hover:text-destructive"
                          onClick={() =>
                            updateDay(day.dayOfWeek, (current) => ({
                              ...current,
                              intervals: current.intervals.filter((_, intervalIndex) => intervalIndex !== index),
                            }))
                          }
                        >
                          <X className="size-3.5" />
                        </button>
                      </div>
                    ))}
                    {workIntervals.length < 3 && (
                      <button
                        type="button"
                        className="rounded-md border border-dashed px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground"
                        onClick={() =>
                          updateDay(day.dayOfWeek, (current) => ({
                            ...current,
                            intervals: [
                              ...current.intervals,
                              {
                                kind: "WORK",
                                startMinute: current.intervals.at(-1)?.endMinute ?? 8 * 60,
                                endMinute: Math.min(
                                  24 * 60,
                                  (current.intervals.at(-1)?.endMinute ?? 8 * 60) + 60
                                ),
                              },
                            ],
                          }))
                        }
                      >
                        + интервал
                      </button>
                    )}
                  </div>
                ) : (
                  <span className="text-sm text-muted-foreground">Выходной</span>
                )}

                <div className={cn("flex items-center gap-1 text-sm", day.isWorkingDay && workMinutes !== target ? "text-destructive" : "text-muted-foreground")}>
                  <Clock3 className="size-4" />
                  {durationLabel(workMinutes).replace("+", "")} / {durationLabel(day.isWorkingDay ? target : 0).replace("+", "")}
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>Отмена</Button>
          <Button type="button" disabled={saving} onClick={onSave}>
            {saving ? "Сохранение…" : "Сохранить график"}
          </Button>
        </div>
      </section>
    </div>
  );
}
