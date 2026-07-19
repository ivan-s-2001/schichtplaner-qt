"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { Ban, ChevronLeft, ChevronRight, Send, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type {
  MonthPreferenceItem,
  MonthPreferenceResponse,
} from "@/types/month-planning";

const DAY_NAMES = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

type DraftItem = Pick<
  MonthPreferenceItem,
  "workDate" | "kind" | "shiftTemplateCode"
>;

function defaultTarget() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth() + 1, 1);
}

function dateKey(year: number, month: number, day: number) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function monthTitle(year: number, month: number) {
  return format(new Date(year, month - 1, 1), "LLLL yyyy", { locale: ru });
}

export function MonthPreferences() {
  const queryClient = useQueryClient();
  const [target, setTarget] = useState(defaultTarget);
  const [activeTool, setActiveTool] = useState<string>("unavailable");
  const [comment, setComment] = useState("");
  const [items, setItems] = useState<DraftItem[]>([]);

  const year = target.getFullYear();
  const month = target.getMonth() + 1;
  const queryKey = ["month-planning-preference", year, month];

  const query = useQuery<MonthPreferenceResponse>({
    queryKey,
    queryFn: async () => {
      const response = await fetch(`/api/month-planning?year=${year}&month=${month}`);
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Не удалось загрузить пожелания");
      return payload;
    },
  });

  useEffect(() => {
    setComment(query.data?.preference?.comment ?? "");
    setItems(
      query.data?.preference?.items.map((item) => ({
        workDate: item.workDate,
        kind: item.kind,
        shiftTemplateCode: item.shiftTemplateCode,
      })) ?? []
    );
  }, [query.data?.preference]);

  const templatesById = useMemo(
    () => new Map((query.data?.templates ?? []).map((template) => [template.id, template])),
    [query.data?.templates]
  );

  const itemsByDate = useMemo(() => {
    const result = new Map<string, DraftItem[]>();
    for (const item of items) {
      const list = result.get(item.workDate) ?? [];
      list.push(item);
      result.set(item.workDate, list);
    }
    return result;
  }, [items]);

  const calendar = useMemo(() => {
    const days = new Date(year, month, 0).getDate();
    const firstWeekDay = (new Date(year, month - 1, 1).getDay() + 6) % 7;
    return {
      leading: Array.from({ length: firstWeekDay }),
      days: Array.from({ length: days }, (_, index) => index + 1),
    };
  }, [year, month]);

  const saveMutation = useMutation({
    mutationFn: async (submit: boolean) => {
      const response = await fetch("/api/month-planning", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ year, month, comment: comment || null, submit, items }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Не удалось сохранить пожелания");
      return payload;
    },
    onSuccess: async (_, submit) => {
      toast.success(submit ? "Пожелания отправлены" : "Черновик сохранён");
      await queryClient.invalidateQueries({ queryKey });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Не удалось сохранить пожелания");
    },
  });

  function moveMonth(offset: number) {
    setTarget((value) => new Date(value.getFullYear(), value.getMonth() + offset, 1));
  }

  function toggleDate(workDate: string) {
    if (!query.data?.editable) return;

    setItems((current) => {
      if (activeTool === "unavailable") {
        const exists = current.some(
          (item) => item.workDate === workDate && item.kind === "UNAVAILABLE"
        );
        const withoutDate = current.filter((item) => item.workDate !== workDate);
        return exists
          ? withoutDate
          : [
              ...withoutDate,
              { workDate, kind: "UNAVAILABLE", shiftTemplateCode: null },
            ];
      }

      const templateCode = activeTool.replace(/^template:/, "");
      const matching = current.some(
        (item) =>
          item.workDate === workDate &&
          item.kind === "PREFERRED" &&
          item.shiftTemplateCode === templateCode
      );
      const withoutUnavailable = current.filter(
        (item) => !(item.workDate === workDate && item.kind === "UNAVAILABLE")
      );
      if (matching) {
        return withoutUnavailable.filter(
          (item) =>
            !(
              item.workDate === workDate &&
              item.kind === "PREFERRED" &&
              item.shiftTemplateCode === templateCode
            )
        );
      }
      return [
        ...withoutUnavailable,
        { workDate, kind: "PREFERRED", shiftTemplateCode: templateCode },
      ];
    });
  }

  if (query.isLoading) {
    return <div className="rounded-lg border p-8 text-sm text-muted-foreground">Загрузка пожеланий…</div>;
  }

  if (query.error) {
    return (
      <div className="rounded-lg border border-destructive/40 p-8 text-destructive">
        {query.error instanceof Error ? query.error.message : "Не удалось загрузить пожелания"}
      </div>
    );
  }

  const data = query.data;
  const period = data?.period;

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[26px] font-medium leading-tight">Пожелания по графику</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Отметьте только важные для вас даты и при необходимости оставьте комментарий.
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

      {!period ? (
        <Card>
          <CardHeader>
            <CardTitle>Сбор пожеланий ещё не открыт</CardTitle>
            <CardDescription>
              Руководитель должен открыть планирование выбранного месяца.
            </CardDescription>
          </CardHeader>
          {data?.canManage && (
            <CardContent>
              <Button asChild>
                <Link href={`/schedule/planning?year=${year}&month=${month}`}>Открыть планирование</Link>
              </Button>
            </CardContent>
          )}
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Выберите отметку</CardTitle>
              <CardDescription>
                Сначала выберите смену, затем нажимайте на даты. На один день можно указать несколько желательных смен.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              {(data?.templates ?? []).map((template) => {
                const selected = activeTool === `template:${template.id}`;
                return (
                  <button
                    key={template.id}
                    type="button"
                    disabled={!data?.editable}
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
                variant={activeTool === "unavailable" ? "destructive" : "outline"}
                disabled={!data?.editable}
                onClick={() => setActiveTool("unavailable")}
              >
                <Ban /> Не могу работать
              </Button>
            </CardContent>
          </Card>

          <div className="rounded-lg border bg-card p-3 md:p-4">
            <div className="grid grid-cols-7 gap-1 border-b pb-2 text-center text-xs font-semibold text-muted-foreground">
              {DAY_NAMES.map((name) => (
                <div key={name}>{name}</div>
              ))}
            </div>
            <div className="mt-1 grid grid-cols-7 gap-1">
              {calendar.leading.map((_, index) => (
                <div key={`empty-${index}`} className="min-h-24 rounded-md bg-muted/20" />
              ))}
              {calendar.days.map((day) => {
                const workDate = dateKey(year, month, day);
                const dayItems = itemsByDate.get(workDate) ?? [];
                const unavailable = dayItems.some((item) => item.kind === "UNAVAILABLE");
                return (
                  <button
                    key={workDate}
                    type="button"
                    disabled={!data?.editable}
                    onClick={() => toggleDate(workDate)}
                    className={cn(
                      "min-h-24 rounded-md border p-1.5 text-left align-top transition",
                      data?.editable && "hover:border-primary hover:bg-accent/30",
                      unavailable && "border-destructive/60 bg-destructive/10"
                    )}
                  >
                    <span className="block text-xs font-semibold">{day}</span>
                    <span className="mt-1 flex flex-col gap-1">
                      {unavailable && (
                        <span className="rounded bg-destructive px-1 py-0.5 text-[10px] font-semibold text-white">
                          Не могу
                        </span>
                      )}
                      {dayItems
                        .filter((item) => item.kind === "PREFERRED")
                        .map((item) => {
                          const template = item.shiftTemplateCode
                            ? templatesById.get(item.shiftTemplateCode)
                            : null;
                          if (!template) return null;
                          return (
                            <span
                              key={template.id}
                              className="truncate rounded px-1 py-0.5 text-[10px] font-semibold"
                              style={{ backgroundColor: template.color, color: template.textColor }}
                              title={`${template.name}: ${template.label}`}
                            >
                              {template.label}
                            </span>
                          );
                        })}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Дополнительный комментарий</CardTitle>
              <CardDescription>
                Например: «хочу больше офисных смен» или «по возможности меньше вечерних».
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Textarea
                value={comment}
                disabled={!data?.editable}
                onChange={(event) => setComment(event.target.value)}
                placeholder="Комментарий для руководителя"
                maxLength={2000}
              />
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                <div className="text-xs text-muted-foreground">
                  {period.preferenceDeadline
                    ? `Приём до ${format(new Date(period.preferenceDeadline), "d MMMM, HH:mm", { locale: ru })}`
                    : "Срок приёма не установлен"}
                  {data?.preference?.submittedAt && " · пожелания отправлены"}
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    disabled={!data?.editable || saveMutation.isPending}
                    onClick={() => saveMutation.mutate(false)}
                  >
                    <Save /> Сохранить черновик
                  </Button>
                  <Button
                    disabled={!data?.editable || saveMutation.isPending}
                    onClick={() => saveMutation.mutate(true)}
                  >
                    <Send /> Отправить пожелания
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
