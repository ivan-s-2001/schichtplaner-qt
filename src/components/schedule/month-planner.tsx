"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import {
  CalendarCheck,
  ChevronLeft,
  ChevronRight,
  Eraser,
  MessageSquareText,
  Save,
  Send,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type {
  MonthPlanningManagerResponse,
  MonthPlanningStatus,
  MonthPreferenceItem,
} from "@/types/month-planning";

function defaultTarget() {
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 2 };
}

function normalizeTarget(year: number, month: number) {
  const date = new Date(year, month - 1, 1);
  return { year: date.getFullYear(), month: date.getMonth() + 1 };
}

function dateKey(year: number, month: number, day: number) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function monthTitle(year: number, month: number) {
  return format(new Date(year, month - 1, 1), "LLLL yyyy", { locale: ru });
}

function fullName(member: MonthPlanningManagerResponse["members"][number]) {
  return [member.lastName, member.firstName, member.patronymic].filter(Boolean).join(" ");
}

const STATUS_LABELS: Record<MonthPlanningStatus, string> = {
  COLLECTING_PREFERENCES: "Сбор пожеланий",
  PLANNING: "Составление графика",
  PUBLISHED: "Опубликован",
  CLOSED: "Закрыт",
};

export function MonthPlanner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const fallback = defaultTarget();
  const year = Number(searchParams.get("year") ?? fallback.year);
  const month = Number(searchParams.get("month") ?? fallback.month);
  const queryKey = ["month-planning-manage", year, month];

  const [activeTool, setActiveTool] = useState<string>("erase");
  const [assignments, setAssignments] = useState<Record<string, string>>({});
  const [pendingCells, setPendingCells] = useState<Set<string>>(new Set());
  const [deadline, setDeadline] = useState("");

  const query = useQuery<MonthPlanningManagerResponse>({
    queryKey,
    queryFn: async () => {
      const response = await fetch(
        `/api/month-planning/manage?year=${year}&month=${month}`
      );
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Не удалось загрузить планирование");
      return payload;
    },
  });

  useEffect(() => {
    const next: Record<string, string> = {};
    for (const assignment of query.data?.assignments ?? []) {
      next[`${assignment.userId}:${assignment.workDate}`] =
        assignment.shiftTemplateCode;
    }
    setAssignments(next);
    setDeadline(query.data?.period.preferenceDeadline?.slice(0, 16) ?? "");
  }, [query.data]);

  const templatesById = useMemo(
    () => new Map((query.data?.templates ?? []).map((template) => [template.id, template])),
    [query.data?.templates]
  );
  const preferencesByUser = useMemo(
    () => new Map((query.data?.preferences ?? []).map((preference) => [preference.userId, preference])),
    [query.data?.preferences]
  );
  const preferenceItemsByCell = useMemo(() => {
    const result = new Map<string, MonthPreferenceItem[]>();
    for (const preference of query.data?.preferences ?? []) {
      for (const item of preference.items) {
        const key = `${preference.userId}:${item.workDate}`;
        const list = result.get(key) ?? [];
        list.push(item);
        result.set(key, list);
      }
    }
    return result;
  }, [query.data?.preferences]);

  const days = useMemo(
    () =>
      Array.from({ length: new Date(year, month, 0).getDate() }, (_, index) => {
        const day = index + 1;
        const date = new Date(year, month - 1, day);
        return {
          day,
          date,
          key: dateKey(year, month, day),
          weekDay: format(date, "EE", { locale: ru }),
          weekend: date.getDay() === 0 || date.getDay() === 6,
        };
      }),
    [year, month]
  );

  const periodMutation = useMutation({
    mutationFn: async (input: {
      status?: "COLLECTING_PREFERENCES" | "PLANNING" | "CLOSED";
      preferenceDeadline?: string | null;
    }) => {
      if (!query.data?.period) throw new Error("Период не загружен");
      const response = await fetch(
        `/api/month-planning/manage?year=${year}&month=${month}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ periodId: query.data.period.id, ...input }),
        }
      );
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Не удалось обновить период");
      return payload;
    },
    onSuccess: async () => {
      toast.success("Параметры планирования сохранены");
      await queryClient.invalidateQueries({ queryKey });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Не удалось обновить период");
    },
  });

  const publishMutation = useMutation({
    mutationFn: async () => {
      if (!query.data?.period) throw new Error("Период не загружен");
      const response = await fetch("/api/month-planning/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ periodId: query.data.period.id }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Не удалось опубликовать график");
      return payload;
    },
    onSuccess: async (payload) => {
      toast.success(
        `График опубликован: ${payload.result.bookingsCreated} назначений`
      );
      await Promise.all([
        queryClient.invalidateQueries({ queryKey }),
        queryClient.invalidateQueries({ queryKey: ["schedule"] }),
      ]);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Не удалось опубликовать график");
    },
  });

  function moveMonth(offset: number) {
    const next = normalizeTarget(year, month + offset);
    router.push(`/schedule/planning?year=${next.year}&month=${next.month}`);
  }

  async function applyAssignment(userId: string, workDate: string) {
    const period = query.data?.period;
    if (!period || period.status === "PUBLISHED" || period.status === "CLOSED") return;

    const cellKey = `${userId}:${workDate}`;
    if (pendingCells.has(cellKey)) return;
    const previous = assignments[cellKey];
    const next = activeTool === "erase" ? undefined : activeTool.replace(/^template:/, "");

    setAssignments((current) => {
      const copy = { ...current };
      if (next) copy[cellKey] = next;
      else delete copy[cellKey];
      return copy;
    });
    setPendingCells((current) => new Set(current).add(cellKey));

    try {
      const response = await fetch("/api/month-planning/assignments", {
        method: next ? "PUT" : "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          periodId: period.id,
          userId,
          workDate,
          ...(next ? { shiftTemplateCode: next } : {}),
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Не удалось изменить ячейку");
    } catch (error) {
      setAssignments((current) => {
        const copy = { ...current };
        if (previous) copy[cellKey] = previous;
        else delete copy[cellKey];
        return copy;
      });
      toast.error(error instanceof Error ? error.message : "Не удалось изменить ячейку");
    } finally {
      setPendingCells((current) => {
        const copy = new Set(current);
        copy.delete(cellKey);
        return copy;
      });
    }
  }

  if (query.isLoading) {
    return <div className="rounded-lg border p-8 text-sm text-muted-foreground">Загрузка планирования…</div>;
  }
  if (query.error || !query.data) {
    return (
      <div className="rounded-lg border border-destructive/40 p-8 text-destructive">
        {query.error instanceof Error ? query.error.message : "Не удалось загрузить планирование"}
      </div>
    );
  }

  const { period, templates, members } = query.data;
  const locked = period.status === "PUBLISHED" || period.status === "CLOSED";

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[26px] font-medium leading-tight">Планирование следующего месяца</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Выберите смену сверху и расставляйте её кликами по таблице.
          </p>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon" onClick={() => moveMonth(-1)} aria-label="Предыдущий месяц">
            <ChevronLeft />
          </Button>
          <div className="min-w-40 text-center text-sm font-semibold capitalize">
            {monthTitle(year, month)}
          </div>
          <Button variant="outline" size="icon" onClick={() => moveMonth(1)} aria-label="Следующий месяц">
            <ChevronRight />
          </Button>
        </div>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center gap-2">
            <CalendarCheck className="size-5" />
            {STATUS_LABELS[period.status]}
          </CardTitle>
          <CardDescription>
            Пожелания остаются подсказками. Руководитель может назначить другую смену.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-2">
            <label className="min-w-64 text-xs font-medium text-muted-foreground">
              Приём пожеланий до
              <Input
                className="mt-1"
                type="datetime-local"
                value={deadline}
                disabled={locked}
                onChange={(event) => setDeadline(event.target.value)}
              />
            </label>
            <Button
              variant="outline"
              disabled={locked || periodMutation.isPending}
              onClick={() =>
                periodMutation.mutate({
                  preferenceDeadline: deadline
                    ? new Date(deadline).toISOString()
                    : null,
                })
              }
            >
              <Save /> Сохранить срок
            </Button>
            {period.status === "COLLECTING_PREFERENCES" && (
              <Button
                variant="secondary"
                disabled={periodMutation.isPending}
                onClick={() => periodMutation.mutate({ status: "PLANNING" })}
              >
                Завершить сбор пожеланий
              </Button>
            )}
            {period.status === "PLANNING" && (
              <Button
                variant="outline"
                disabled={periodMutation.isPending}
                onClick={() => periodMutation.mutate({ status: "COLLECTING_PREFERENCES" })}
              >
                Снова открыть пожелания
              </Button>
            )}
            <Button
              className="ml-auto"
              disabled={locked || publishMutation.isPending}
              onClick={() => publishMutation.mutate()}
            >
              <Send /> Опубликовать график
            </Button>
          </div>

          <div className="flex flex-wrap gap-2 border-t pt-4">
            {templates.map((template) => {
              const selected = activeTool === `template:${template.id}`;
              return (
                <button
                  key={template.id}
                  type="button"
                  disabled={locked}
                  onClick={() => setActiveTool(`template:${template.id}`)}
                  className={cn(
                    "rounded-md border px-3 py-2 text-left text-xs transition disabled:opacity-50",
                    selected ? "ring-2 ring-primary ring-offset-2" : "hover:border-foreground/40"
                  )}
                  style={{
                    backgroundColor: template.color,
                    color: template.textColor,
                    borderColor: template.color === "#FFFFFF" ? "#94A3B8" : template.color,
                  }}
                  title={template.description ?? template.name}
                >
                  <span className="block font-semibold">{template.name}</span>
                  <span className="block opacity-80">{template.label}</span>
                </button>
              );
            })}
            <Button
              type="button"
              variant={activeTool === "erase" ? "destructive" : "outline"}
              disabled={locked}
              onClick={() => setActiveTool("erase")}
            >
              <Eraser /> Ластик
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="overflow-x-auto rounded-md border border-slate-400 bg-white shadow-sm dark:bg-slate-950">
        <table className="border-collapse text-xs" style={{ minWidth: `${220 + days.length * 76}px` }}>
          <thead>
            <tr>
              <th className="sticky left-0 z-30 w-56 min-w-56 border-b border-r border-slate-400 bg-[#0000FF] px-3 py-3 text-left font-semibold text-white">
                Сотрудник
              </th>
              {days.map((day) => (
                <th
                  key={day.key}
                  className={cn(
                    "w-[76px] min-w-[76px] border-b border-r border-slate-400 px-1 py-2 text-center text-white",
                    day.weekend ? "bg-emerald-700" : "bg-[#0000FF]"
                  )}
                >
                  <div className="font-bold capitalize">{day.weekDay}</div>
                  <div className="text-[11px] font-normal">{day.day}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {members.map((member) => {
              const preference = preferencesByUser.get(member.id);
              return (
                <tr key={member.id}>
                  <td className="sticky left-0 z-20 border-b border-r border-slate-300 bg-white px-3 py-2 dark:bg-slate-950">
                    <div className="flex items-center gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-semibold text-slate-900 dark:text-slate-100">
                          {member.firstName}
                        </div>
                        <div className="truncate text-[10px] text-slate-500">
                          {fullName(member)}
                        </div>
                      </div>
                      {preference?.comment && (
                        <MessageSquareText
                          className="size-4 shrink-0 text-indigo-600"
                          aria-label="Есть комментарий"
                        />
                      )}
                    </div>
                  </td>
                  {days.map((day) => {
                    const cellKey = `${member.id}:${day.key}`;
                    const templateCode = assignments[cellKey];
                    const template = templateCode ? templatesById.get(templateCode) : null;
                    const wishes = preferenceItemsByCell.get(cellKey) ?? [];
                    const unavailable = wishes.some((item) => item.kind === "UNAVAILABLE");
                    const preferred = wishes
                      .filter((item) => item.kind === "PREFERRED" && item.shiftTemplateCode)
                      .map((item) => item.shiftTemplateCode as string);
                    const title = [
                      unavailable ? "Сотрудник не может работать" : null,
                      preferred.length
                        ? `Пожелания: ${preferred
                            .map((code) => templatesById.get(code)?.label ?? code)
                            .join(", ")}`
                        : null,
                      preference?.comment ? `Комментарий: ${preference.comment}` : null,
                    ]
                      .filter(Boolean)
                      .join("\n");

                    return (
                      <td
                        key={day.key}
                        className={cn(
                          "h-14 border-b border-r border-slate-300 p-1 align-middle",
                          day.weekend && "bg-emerald-50 dark:bg-emerald-950/30",
                          unavailable && "bg-red-50 dark:bg-red-950/30"
                        )}
                      >
                        <button
                          type="button"
                          disabled={locked || pendingCells.has(cellKey)}
                          onClick={() => applyAssignment(member.id, day.key)}
                          className={cn(
                            "relative flex min-h-11 w-full flex-col items-center justify-center rounded-sm border px-1 py-1 text-[10px] font-semibold transition",
                            !locked && "hover:ring-2 hover:ring-indigo-400",
                            unavailable ? "border-red-300" : "border-slate-200",
                            pendingCells.has(cellKey) && "opacity-50"
                          )}
                          style={
                            template
                              ? {
                                  backgroundColor: template.color,
                                  color: template.textColor,
                                  borderColor:
                                    template.color === "#FFFFFF" ? "#94A3B8" : template.color,
                                }
                              : undefined
                          }
                          title={title || "Нет пожеланий"}
                        >
                          {template ? template.label : activeTool === "erase" ? "" : "+"}
                          <span className="absolute bottom-0.5 left-1/2 flex -translate-x-1/2 gap-0.5">
                            {unavailable && <span className="size-1.5 rounded-full bg-red-600" />}
                            {preferred.slice(0, 3).map((code) => {
                              const preferredTemplate = templatesById.get(code);
                              return (
                                <span
                                  key={code}
                                  className="size-1.5 rounded-full border border-white"
                                  style={{ backgroundColor: preferredTemplate?.color ?? "#6366f1" }}
                                />
                              );
                            })}
                          </span>
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
    </div>
  );
}
