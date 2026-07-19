"use client";

import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { useFormatter, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { CalendarRange, Loader2, Pencil, Trash2 } from "lucide-react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DEFAULT_SHIFT_POOL,
  resolveShiftTemplate,
  type ShiftTemplate,
} from "@/lib/schedule/shift-pool";
import { cn } from "@/lib/utils";
import type {
  BookingUser,
  ScheduleAbsence,
  ScheduleDayOff,
  ShiftBooking,
  ShiftData,
} from "@/types/schedule";

export type ShiftAssignment = {
  shift: ShiftData;
  booking: ShiftBooking;
};

export type ShiftAssignmentTarget = {
  scheduleId: string;
  user: BookingUser;
  date: Date;
  dayOfWeek: number;
  assignment: ShiftAssignment | null;
  dayOff?: ScheduleDayOff | null;
  absence?: ScheduleAbsence | null;
};

interface ShiftAssignmentEditorProps {
  target: ShiftAssignmentTarget | null;
  canEdit: boolean;
  onClose: () => void;
  onChanged: (scheduleId: string) => Promise<unknown> | void;
}

type EditorMode = "view" | "edit";
type CellKind = "SHIFT" | "DAY_OFF" | "VACATION" | "SICK";
type EditableCellKind = Exclude<CellKind, "VACATION">;

type ShiftPoolResponse = {
  templates: ShiftTemplate[];
  canEdit: boolean;
};

function isLegacyOvertime(shift: ShiftData): boolean {
  const text = `${shift.title ?? ""} ${shift.description ?? ""}`;
  return /переработ|overtime|(?:^|\s)П(?:\s|$)/i.test(text);
}

function absenceKind(absence: ScheduleAbsence | null | undefined): CellKind {
  const name = absence?.category.name.toLowerCase() ?? "";
  return /больнич|sick/.test(name) ? "SICK" : "VACATION";
}

function currentKind(target: ShiftAssignmentTarget | null): CellKind {
  if (target?.assignment) return "SHIFT";
  if (target?.dayOff) return "DAY_OFF";
  if (target?.absence) return absenceKind(target.absence);
  return "SHIFT";
}

async function readError(response: Response, fallback: string): Promise<never> {
  const data = await response.json().catch(() => null);
  throw new Error(data?.error || fallback);
}

export function ShiftAssignmentEditor({
  target,
  canEdit,
  onClose,
  onChanged,
}: ShiftAssignmentEditorProps) {
  const router = useRouter();
  const t = useTranslations("schedule.editor");
  const tGrid = useTranslations("schedule.grid");
  const tPool = useTranslations("schedule.pool");
  const tCommon = useTranslations("common");
  const tErrors = useTranslations("errors");
  const formatValue = useFormatter();

  const [mode, setMode] = useState<EditorMode>("edit");
  const [kind, setKind] = useState<CellKind>("SHIFT");
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [overtimeBeforeHours, setOvertimeBeforeHours] = useState("0");
  const [overtimeAfterHours, setOvertimeAfterHours] = useState("0");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const { data: poolData, isLoading: poolLoading } = useQuery<ShiftPoolResponse>({
    queryKey: ["shift-pool"],
    queryFn: async () => {
      const response = await fetch("/api/shift-pool");
      if (!response.ok) throw new Error(tErrors("loadSchedule"));
      return response.json();
    },
    enabled: target !== null && currentKind(target) !== "VACATION",
  });

  const templates = poolData?.templates ?? [...DEFAULT_SHIFT_POOL];
  const currentTemplate = useMemo(
    () =>
      target?.assignment
        ? resolveShiftTemplate(target.assignment.shift)
        : undefined,
    [target]
  );
  const hasValue = Boolean(
    target?.assignment || target?.dayOff || target?.absence
  );
  const displayedKind = currentKind(target);
  const isVacation = displayedKind === "VACATION";
  const canEditHere = canEdit && !isVacation;

  const cellKindOptions: Array<{ value: EditableCellKind; label: string }> = [
    { value: "SHIFT", label: t("shift") },
    { value: "DAY_OFF", label: t("dayOff") },
    { value: "SICK", label: t("sickLeave") },
  ];

  const formatHours = (value: number) =>
    formatValue.number(value, {
      minimumFractionDigits: value % 1 === 0 ? 0 : 1,
      maximumFractionDigits: 1,
    });

  useEffect(() => {
    if (!target) return;

    const targetKind = currentKind(target);
    const selectedDate = format(target.date, "yyyy-MM-dd");
    setMode(hasValue ? "view" : "edit");
    setKind(targetKind);
    setSelectedTemplateId(currentTemplate?.id ?? "");
    setOvertimeBeforeHours(
      target.assignment
        ? String((target.assignment.booking.overtimeBeforeMinutes ?? 0) / 60)
        : "0"
    );
    setOvertimeAfterHours(
      target.assignment
        ? String(
            (target.assignment.booking.overtimeAfterMinutes ??
              target.assignment.booking.overtimeMinutes ??
              0) / 60
          )
        : "0"
    );
    setDateFrom(
      target.absence
        ? format(new Date(target.absence.dateFrom), "yyyy-MM-dd")
        : selectedDate
    );
    setDateTo(
      target.absence
        ? format(new Date(target.absence.dateTo), "yyyy-MM-dd")
        : selectedDate
    );
  }, [currentTemplate?.id, hasValue, target]);

  async function clearCurrentValue() {
    if (!target) return;
    if (target.absence && absenceKind(target.absence) === "VACATION") {
      throw new Error("Отпуск изменяется на отдельной странице «Отпуск»");
    }

    if (target.assignment) {
      const response = await fetch("/api/schedule-assignments", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scheduleId: target.scheduleId,
          userId: target.user.id,
          dayOfWeek: target.dayOfWeek,
        }),
      });
      if (!response.ok) await readError(response, tErrors("delete"));
      return;
    }

    if (target.dayOff || target.absence) {
      const response = await fetch("/api/schedule-cell-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scheduleId: target.scheduleId,
          userId: target.user.id,
          dayOfWeek: target.dayOfWeek,
          type: "CLEAR",
          absenceId: target.absence?.id,
        }),
      });
      if (!response.ok) await readError(response, tErrors("delete"));
    }
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!target) throw new Error(tErrors("invalidData"));
      if (kind === "VACATION") {
        throw new Error("Отпуск добавляется на отдельной странице «Отпуск»");
      }

      if (kind === "SHIFT") {
        if (!selectedTemplateId) throw new Error(tErrors("invalidData"));
        if (target.dayOff || target.absence) await clearCurrentValue();

        const parsedBefore = Number(overtimeBeforeHours.replace(",", "."));
        const parsedAfter = Number(overtimeAfterHours.replace(",", "."));
        const response = await fetch("/api/schedule-assignments", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            scheduleId: target.scheduleId,
            userId: target.user.id,
            dayOfWeek: target.dayOfWeek,
            templateId: selectedTemplateId,
            overtimeBeforeHours: Number.isFinite(parsedBefore) ? parsedBefore : 0,
            overtimeAfterHours: Number.isFinite(parsedAfter) ? parsedAfter : 0,
          }),
        });
        if (!response.ok) await readError(response, tErrors("save"));
        return;
      }

      const response = await fetch("/api/schedule-cell-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scheduleId: target.scheduleId,
          userId: target.user.id,
          dayOfWeek: target.dayOfWeek,
          type: kind,
          dateFrom: kind === "SICK" ? dateFrom : undefined,
          dateTo: kind === "SICK" ? dateTo : undefined,
          absenceId:
            target.absence && kind === "SICK" ? target.absence.id : undefined,
        }),
      });
      if (!response.ok) await readError(response, tErrors("save"));
    },
    onSuccess: async () => {
      if (!target) return;
      await onChanged(target.scheduleId);
      toast.success(t("saved"));
      onClose();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const removeMutation = useMutation({
    mutationFn: clearCurrentValue,
    onSuccess: async () => {
      if (!target) return;
      await onChanged(target.scheduleId);
      toast.success(t("deleted"));
      onClose();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const assignment = target?.assignment ?? null;
  const absence = target?.absence ?? null;
  const overtimeBeforeMinutes = assignment?.booking.overtimeBeforeMinutes ?? 0;
  const overtimeAfterMinutes =
    assignment?.booking.overtimeAfterMinutes ??
    assignment?.booking.overtimeMinutes ??
    0;
  const overtimeMinutes = overtimeBeforeMinutes + overtimeAfterMinutes;
  const totalEditedOvertime =
    (Number(overtimeBeforeHours.replace(",", ".")) || 0) +
    (Number(overtimeAfterHours.replace(",", ".")) || 0);

  return (
    <Dialog open={target !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{hasValue ? t("view") : t("edit")}</DialogTitle>
          <DialogDescription>
            {target && (
              <>
                {target.user.firstName} ·{" "}
                {formatValue.dateTime(target.date, {
                  weekday: "long",
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })}
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        {hasValue && !isVacation && (
          <div className="grid grid-cols-2 rounded-lg border bg-slate-100 p-1">
            <button
              type="button"
              onClick={() => setMode("view")}
              className={cn(
                "rounded-md px-3 py-2 text-sm font-medium transition",
                mode === "view"
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-500 hover:text-slate-900"
              )}
            >
              {t("view")}
            </button>
            <button
              type="button"
              disabled={!canEditHere}
              onClick={() => setMode("edit")}
              className={cn(
                "rounded-md px-3 py-2 text-sm font-medium transition",
                mode === "edit"
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-500 hover:text-slate-900",
                !canEditHere && "cursor-not-allowed opacity-50"
              )}
            >
              {t("edit")}
            </button>
          </div>
        )}

        {mode === "view" && hasValue ? (
          <div className="space-y-4 py-2">
            {displayedKind === "SHIFT" && assignment ? (
              <div
                className="rounded-lg border-2 p-6 text-center"
                style={{
                  backgroundColor: currentTemplate?.color ?? "#E5E7EB",
                  color: currentTemplate?.textColor ?? "#111827",
                  borderColor:
                    currentTemplate?.color === "#FFFFFF"
                      ? "#94A3B8"
                      : currentTemplate?.color ?? "#CBD5E1",
                }}
              >
                <div className="text-xl font-bold">
                  {currentTemplate?.name ??
                    assignment.shift.title ??
                    `${assignment.shift.shiftFrom}–${assignment.shift.shiftTo}`}
                </div>
                {currentTemplate?.label && (
                  <div className="mt-1 text-base font-semibold">
                    {currentTemplate.label}
                  </div>
                )}
                {overtimeMinutes > 0 ? (
                  <div className="mt-3 space-y-1 text-sm font-bold">
                    <div>
                      {tGrid("overtimeTotal")}: +{formatHours(overtimeMinutes / 60)}
                    </div>
                    <div className="text-xs font-semibold opacity-80">
                      {tGrid("overtimeBefore")}: +
                      {formatHours(overtimeBeforeMinutes / 60)} ·{" "}
                      {tGrid("overtimeAfter")}: +
                      {formatHours(overtimeAfterMinutes / 60)}
                    </div>
                  </div>
                ) : isLegacyOvertime(assignment.shift) ? (
                  <div className="mt-3 text-sm font-bold">
                    {tGrid("overtimeTotal")}
                  </div>
                ) : null}
              </div>
            ) : displayedKind === "DAY_OFF" ? (
              <div className="rounded-lg border-2 border-slate-300 bg-white p-6 text-center text-3xl font-bold text-slate-700">
                −
                <div className="mt-2 text-sm font-medium">{t("dayOff")}</div>
              </div>
            ) : absence ? (
              <div
                className={cn(
                  "rounded-lg border-2 p-6 text-center",
                  displayedKind === "VACATION"
                    ? "border-slate-300 bg-white text-slate-900"
                    : "border-red-300 bg-red-50 text-red-900"
                )}
              >
                <div className="text-xl font-bold">
                  {displayedKind === "VACATION" ? t("vacation") : t("sickLeave")}
                </div>
                <div className="mt-3 flex items-center justify-center gap-2 text-sm font-medium">
                  <CalendarRange className="size-4" />
                  {formatValue.dateTime(new Date(absence.dateFrom), {
                    day: "numeric",
                    month: "long",
                  })}
                  {" — "}
                  {formatValue.dateTime(new Date(absence.dateTo), {
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })}
                </div>
                {displayedKind === "VACATION" && (
                  <p className="mt-4 text-sm text-slate-600">
                    Период отпуска редактируется отдельно, а не через ячейку графика.
                  </p>
                )}
              </div>
            ) : null}
          </div>
        ) : (
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-3 gap-2">
              {cellKindOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setKind(option.value)}
                  className={cn(
                    "rounded-md border px-2 py-2 text-sm font-semibold transition",
                    kind === option.value
                      ? "border-primary bg-primary/10 text-primary ring-1 ring-primary"
                      : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>

            {kind === "SHIFT" ? (
              <>
                {poolLoading ? (
                  <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
                    <Loader2 className="size-4 animate-spin" />
                    {tCommon("loading")} {tPool("title").toLocaleLowerCase()}
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {templates.map((template) => {
                      const selected = selectedTemplateId === template.id;
                      return (
                        <button
                          type="button"
                          key={template.id}
                          onClick={() => setSelectedTemplateId(template.id)}
                          className={cn(
                            "min-h-20 rounded-md border-2 px-3 py-2 text-left transition",
                            selected
                              ? "ring-2 ring-primary ring-offset-2"
                              : "hover:scale-[1.01]"
                          )}
                          style={{
                            backgroundColor: template.color,
                            color: template.textColor,
                            borderColor:
                              template.color === "#FFFFFF"
                                ? "#94A3B8"
                                : template.color,
                          }}
                        >
                          <span className="block font-bold">{template.name}</span>
                          <span className="block text-sm font-semibold">
                            {template.label}
                          </span>
                          {template.description && (
                            <span className="mt-1 block text-xs opacity-85">
                              {template.description}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}

                <div className="grid grid-cols-1 gap-3 rounded-lg border bg-slate-50 p-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="overtime-before-hours">
                      {t("overtimeBefore")}
                    </Label>
                    <Input
                      id="overtime-before-hours"
                      type="number"
                      min="0"
                      max="24"
                      step="0.5"
                      value={overtimeBeforeHours}
                      onChange={(event) => setOvertimeBeforeHours(event.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="overtime-after-hours">
                      {t("overtimeAfter")}
                    </Label>
                    <Input
                      id="overtime-after-hours"
                      type="number"
                      min="0"
                      max="24"
                      step="0.5"
                      value={overtimeAfterHours}
                      onChange={(event) => setOvertimeAfterHours(event.target.value)}
                    />
                  </div>
                  <div className="text-xs font-semibold text-slate-600 sm:col-span-2">
                    {tGrid("overtimeTotal")}: +{formatHours(totalEditedOvertime)}
                  </div>
                </div>
              </>
            ) : kind === "DAY_OFF" ? (
              <div className="rounded-lg border border-slate-300 bg-slate-50 p-6 text-center">
                <div className="text-3xl font-bold">−</div>
                <div className="mt-2 text-sm text-slate-600">{tGrid("dayOff")}</div>
              </div>
            ) : (
              <div className="space-y-4 rounded-lg border bg-slate-50 p-4">
                <p className="text-sm text-muted-foreground">
                  Больничный по-прежнему можно указать непосредственно в графике.
                </p>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="absence-date-from">{t("periodFrom")}</Label>
                    <Input
                      id="absence-date-from"
                      type="date"
                      value={dateFrom}
                      onChange={(event) => setDateFrom(event.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="absence-date-to">{t("periodTo")}</Label>
                    <Input
                      id="absence-date-to"
                      type="date"
                      value={dateTo}
                      onChange={(event) => setDateTo(event.target.value)}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        <DialogFooter className="gap-2 sm:justify-between">
          <div>
            {mode === "edit" && hasValue && canEditHere && (
              <Button
                type="button"
                variant="destructive"
                disabled={removeMutation.isPending}
                onClick={() => removeMutation.mutate()}
              >
                {removeMutation.isPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Trash2 className="size-4" />
                )}
                {tCommon("delete")}
              </Button>
            )}
          </div>

          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              {tCommon("close")}
            </Button>

            {isVacation ? (
              <Button
                type="button"
                onClick={() => {
                  onClose();
                  router.push("/employees/absences");
                }}
              >
                <CalendarRange className="size-4" />
                Открыть страницу «Отпуск»
              </Button>
            ) : mode === "view" && hasValue && canEditHere ? (
              <Button type="button" onClick={() => setMode("edit")}> 
                <Pencil className="size-4" />
                {t("edit")}
              </Button>
            ) : mode === "edit" && canEditHere ? (
              <Button
                type="button"
                disabled={
                  saveMutation.isPending ||
                  (kind === "SHIFT" && !selectedTemplateId) ||
                  (kind === "SICK" && (!dateFrom || !dateTo))
                }
                onClick={() => saveMutation.mutate()}
              >
                {saveMutation.isPending && (
                  <Loader2 className="size-4 animate-spin" />
                )}
                {tCommon("save")}
              </Button>
            ) : null}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
