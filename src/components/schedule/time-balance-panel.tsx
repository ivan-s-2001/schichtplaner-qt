"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, ChevronDown, ChevronUp } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type EntryKind =
  | "OVERTIME"
  | "SHORTENING"
  | "BALANCE_USE"
  | "ADMIN_LEAVE";

type BalanceEntry = {
  id: string;
  workDate: string;
  kind: EntryKind | "MANUAL_ADJUSTMENT";
  minutes: number;
  note: string | null;
  createdByName: string;
};

type BalanceResponse = {
  balanceMinutes: number;
  entries: BalanceEntry[];
};

const kindLabels: Record<BalanceEntry["kind"], string> = {
  OVERTIME: "Переработка",
  SHORTENING: "Сокращение с долгом",
  BALANCE_USE: "Использование накопленных часов",
  ADMIN_LEAVE: "Административный отпуск",
  MANUAL_ADJUSTMENT: "Ручная корректировка",
};

function todayValue() {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}

function timeLabel(minutes: number) {
  const sign = minutes > 0 ? "+" : minutes < 0 ? "−" : "";
  const absolute = Math.abs(minutes);
  return `${sign}${Math.floor(absolute / 60)} ч ${absolute % 60} мин`;
}

export function TimeBalancePanel({ divisionId }: { divisionId: string }) {
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState(false);
  const [kind, setKind] = useState<EntryKind>("SHORTENING");
  const [workDate, setWorkDate] = useState(todayValue());
  const [hours, setHours] = useState("1");
  const [note, setNote] = useState("");

  const query = useQuery<BalanceResponse>({
    queryKey: ["time-balance", divisionId],
    queryFn: async () => {
      const response = await fetch(
        `/api/time-balance?divisionId=${encodeURIComponent(divisionId)}`
      );
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "Не удалось загрузить баланс времени");
      }
      return payload;
    },
  });

  const mutation = useMutation({
    mutationFn: async () => {
      const response = await fetch("/api/time-balance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          divisionId,
          workDate,
          kind,
          minutes:
            kind === "ADMIN_LEAVE" ? 0 : Math.round(Number(hours) * 60),
          note: note.trim() || null,
        }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "Не удалось сохранить операцию");
      }
      return payload;
    },
    onSuccess: async () => {
      setNote("");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["time-balance", divisionId] }),
        queryClient.invalidateQueries({ queryKey: ["stable-schedule", divisionId] }),
      ]);
      toast.success("Баланс рабочего времени обновлён");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const balance = query.data?.balanceMinutes ?? 0;

  return (
    <section className="rounded-lg border bg-card">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-4 px-4 py-3 text-left"
        onClick={() => setExpanded((value) => !value)}
      >
        <div className="flex items-center gap-3">
          <CalendarClock className="size-5 text-muted-foreground" />
          <div>
            <div className="font-medium">Мой баланс рабочего времени</div>
            <div
              className={cn(
                "text-sm",
                balance > 0 && "text-emerald-600",
                balance < 0 && "text-destructive",
                balance === 0 && "text-muted-foreground"
              )}
            >
              {balance === 0
                ? "Баланс нулевой"
                : balance > 0
                  ? `Накоплено: ${timeLabel(balance)}`
                  : `Долг: ${timeLabel(balance)}`}
            </div>
          </div>
        </div>
        {expanded ? (
          <ChevronUp className="size-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="size-4 text-muted-foreground" />
        )}
      </button>

      {expanded && (
        <div className="border-t p-4">
          <div className="grid gap-3 md:grid-cols-[1.4fr_160px_130px_1fr_auto] md:items-end">
            <label className="space-y-1 text-sm">
              <span className="text-muted-foreground">Операция</span>
              <select
                value={kind}
                onChange={(event) => setKind(event.target.value as EntryKind)}
                className="h-10 w-full rounded-md border bg-background px-3"
              >
                <option value="SHORTENING">Уйти раньше — создать долг</option>
                <option value="BALANCE_USE">Потратить накопленные часы</option>
                <option value="OVERTIME">Зафиксировать переработку</option>
                <option value="ADMIN_LEAVE">Административный отпуск</option>
              </select>
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-muted-foreground">Дата</span>
              <input
                type="date"
                value={workDate}
                onChange={(event) => setWorkDate(event.target.value)}
                className="h-10 w-full rounded-md border bg-background px-3"
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-muted-foreground">Часов</span>
              <input
                type="number"
                min="0.25"
                max="24"
                step="0.25"
                disabled={kind === "ADMIN_LEAVE"}
                value={kind === "ADMIN_LEAVE" ? "0" : hours}
                onChange={(event) => setHours(event.target.value)}
                className="h-10 w-full rounded-md border bg-background px-3 disabled:opacity-60"
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-muted-foreground">Комментарий</span>
              <input
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder={
                  kind === "ADMIN_LEAVE"
                    ? "Основание или номер заявления"
                    : "Необязательно"
                }
                className="h-10 w-full rounded-md border bg-background px-3"
              />
            </label>
            <Button
              type="button"
              disabled={mutation.isPending || !workDate}
              onClick={() => mutation.mutate()}
            >
              {mutation.isPending ? "Сохранение…" : "Сохранить"}
            </Button>
          </div>

          <div className="mt-5">
            <h3 className="text-sm font-medium">Последние операции</h3>
            {query.isLoading ? (
              <div className="mt-2 text-sm text-muted-foreground">Загрузка…</div>
            ) : query.data?.entries.length ? (
              <div className="mt-2 divide-y rounded-md border">
                {query.data.entries.slice(0, 10).map((entry) => (
                  <div
                    key={entry.id}
                    className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm"
                  >
                    <div>
                      <span className="font-medium">{kindLabels[entry.kind]}</span>
                      <span className="ml-2 text-muted-foreground">
                        {entry.workDate}
                      </span>
                      {entry.note && (
                        <div className="text-xs text-muted-foreground">
                          {entry.note}
                        </div>
                      )}
                    </div>
                    <span
                      className={cn(
                        "font-medium",
                        entry.minutes > 0 && "text-emerald-600",
                        entry.minutes < 0 && "text-destructive",
                        entry.minutes === 0 && "text-muted-foreground"
                      )}
                    >
                      {entry.kind === "ADMIN_LEAVE"
                        ? "Без отработки"
                        : timeLabel(entry.minutes)}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-2 text-sm text-muted-foreground">
                Операций пока нет.
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
