"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CalendarRange,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Pencil,
  Plus,
  Save,
  Search,
  Trash2,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type VacationPeriod = {
  id: string;
  dateFrom: string;
  dateTo: string;
  note: string | null;
  status: "PENDING" | "APPROVED" | "DECLINED";
  workingDays: number;
};

type VacationEmployee = {
  userId: string;
  firstName: string;
  lastName: string;
  patronymic: string | null;
  profileImage: string | null;
  allowanceDays: number;
  usedDays: number;
  remainingDays: number;
  periods: VacationPeriod[];
};

type VacationResponse = {
  year: number;
  canManage: boolean;
  division: {
    id: string;
    title: string;
  };
  employees: VacationEmployee[];
  totals: {
    allowanceDays: number;
    usedDays: number;
    remainingDays: number;
  };
};

type EditorTarget = {
  employee: VacationEmployee;
  period?: VacationPeriod;
};

function parseDate(value: string): Date {
  return new Date(`${value.slice(0, 10)}T00:00:00.000Z`);
}

function countWorkingDays(from: string, to: string): number {
  if (!from || !to) return 0;
  const start = parseDate(from);
  const end = parseDate(to);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) {
    return 0;
  }

  let count = 0;
  const current = new Date(start);
  while (current <= end) {
    const day = current.getUTCDay();
    if (day !== 0 && day !== 6) count += 1;
    current.setUTCDate(current.getUTCDate() + 1);
  }
  return count;
}

function calendarDayCount(from: string, to: string): number {
  if (!from || !to) return 0;
  const start = parseDate(from);
  const end = parseDate(to);
  if (start > end) return 0;
  return Math.floor((end.getTime() - start.getTime()) / 86400000) + 1;
}

function formatDate(value: string, withYear = true): string {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    ...(withYear ? { year: "numeric" } : {}),
    timeZone: "UTC",
  }).format(parseDate(value));
}

function formatPeriod(period: VacationPeriod): string {
  const from = period.dateFrom.slice(0, 10);
  const to = period.dateTo.slice(0, 10);
  if (from === to) return formatDate(from);
  return `${formatDate(from, false)} — ${formatDate(to)}`;
}

function employeeName(employee: VacationEmployee): string {
  return [employee.lastName, employee.firstName, employee.patronymic]
    .filter(Boolean)
    .join(" ");
}

function initials(employee: VacationEmployee): string {
  return `${employee.firstName.charAt(0)}${employee.lastName.charAt(0)}`.toUpperCase();
}

async function readError(response: Response, fallback: string): Promise<never> {
  const data = await response.json().catch(() => null);
  throw new Error(data?.error || fallback);
}

export function VacationPlanner() {
  const queryClient = useQueryClient();
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const [search, setSearch] = useState("");
  const [editor, setEditor] = useState<EditorTarget | null>(null);
  const [allowanceDrafts, setAllowanceDrafts] = useState<Record<string, string>>({});

  const { data, isLoading, error } = useQuery<VacationResponse>({
    queryKey: ["vacations", year],
    queryFn: async () => {
      const response = await fetch(`/api/vacations?year=${year}`);
      if (!response.ok) await readError(response, "Не удалось загрузить отпуска");
      return response.json();
    },
  });

  useEffect(() => {
    if (!data) return;
    setAllowanceDrafts(
      Object.fromEntries(
        data.employees.map((employee) => [
          employee.userId,
          String(employee.allowanceDays),
        ])
      )
    );
  }, [data]);

  const employees = useMemo(() => {
    const items = data?.employees ?? [];
    const query = search.trim().toLocaleLowerCase("ru");
    if (!query) return items;
    return items.filter((employee) =>
      employeeName(employee).toLocaleLowerCase("ru").includes(query)
    );
  }, [data?.employees, search]);

  const allowanceMutation = useMutation({
    mutationFn: async (employee: VacationEmployee) => {
      const days = Number.parseInt(allowanceDrafts[employee.userId] ?? "", 10);
      if (!Number.isInteger(days) || days < 0 || days > 366) {
        throw new Error("Лимит должен быть целым числом от 0 до 366");
      }
      const response = await fetch("/api/vacations", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: employee.userId, year, days }),
      });
      if (!response.ok) await readError(response, "Не удалось изменить лимит");
      return response.json();
    },
    onSuccess: () => {
      toast.success("Годовой лимит отпуска сохранён");
      queryClient.invalidateQueries({ queryKey: ["vacations"] });
    },
    onError: (mutationError: Error) => toast.error(mutationError.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (period: VacationPeriod) => {
      const response = await fetch(`/api/vacations/${period.id}`, {
        method: "DELETE",
      });
      if (!response.ok) await readError(response, "Не удалось удалить отпуск");
      return response.json();
    },
    onSuccess: () => {
      toast.success("Отпуск удалён");
      queryClient.invalidateQueries({ queryKey: ["vacations"] });
      queryClient.invalidateQueries({ queryKey: ["schedule"] });
    },
    onError: (mutationError: Error) => toast.error(mutationError.message),
  });

  function removePeriod(period: VacationPeriod) {
    if (window.confirm(`Удалить отпуск ${formatPeriod(period)}?`)) {
      deleteMutation.mutate(period);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <CalendarRange className="size-7 text-primary" />
            <h1 className="text-2xl font-bold">Отпуск</h1>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {data?.division.title
              ? `${data.division.title}. Учитываются только рабочие дни с понедельника по пятницу.`
              : "Учитываются только рабочие дни с понедельника по пятницу."}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center rounded-md border bg-card">
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="Предыдущий год"
              onClick={() => setYear((value) => value - 1)}
            >
              <ChevronLeft className="size-4" />
            </Button>
            <Input
              type="number"
              min={2000}
              max={2100}
              value={year}
              onChange={(event) => {
                const value = Number.parseInt(event.target.value, 10);
                if (Number.isInteger(value)) setYear(value);
              }}
              className="h-8 w-24 border-0 text-center font-semibold shadow-none focus-visible:ring-0"
              aria-label="Год отпуска"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="Следующий год"
              onClick={() => setYear((value) => value + 1)}
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>
          {year !== currentYear && (
            <Button type="button" variant="outline" size="sm" onClick={() => setYear(currentYear)}>
              Текущий год
            </Button>
          )}
          {data?.canManage && data.employees.length > 0 && (
            <Button
              type="button"
              size="sm"
              onClick={() => setEditor({ employee: data.employees[0] })}
            >
              <Plus className="size-4" />
              Добавить отпуск
            </Button>
          )}
        </div>
      </div>

      {data && (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <SummaryCard label="Сотрудников" value={data.employees.length} icon={<Users className="size-4" />} />
          <SummaryCard label="Выделено дней" value={data.totals.allowanceDays} />
          <SummaryCard label="Использовано" value={data.totals.usedDays} />
          <SummaryCard
            label="Осталось"
            value={data.totals.remainingDays}
            negative={data.totals.remainingDays < 0}
          />
        </div>
      )}

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Найти сотрудника"
          className="pl-9"
        />
      </div>

      {isLoading && <VacationSkeleton />}

      {error && (
        <Card className="p-6 text-center text-destructive">
          {error instanceof Error ? error.message : "Не удалось загрузить отпуска"}
        </Card>
      )}

      {!isLoading && !error && employees.length === 0 && (
        <Card className="p-10 text-center">
          <CalendarRange className="mx-auto size-10 text-muted-foreground/50" />
          <p className="mt-3 font-medium">Сотрудники не найдены</p>
        </Card>
      )}

      {!isLoading && !error && employees.length > 0 && (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-60">Сотрудник</TableHead>
                  <TableHead className="w-40">Дней на {year} год</TableHead>
                  <TableHead className="w-28 text-center">Использовано</TableHead>
                  <TableHead className="w-24 text-center">Осталось</TableHead>
                  <TableHead className="min-w-80">Периоды</TableHead>
                  {data?.canManage && <TableHead className="w-16" />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {employees.map((employee) => (
                  <TableRow key={employee.userId}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar>
                          <AvatarFallback className="text-xs">
                            {initials(employee)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <div className="truncate font-semibold">{employeeName(employee)}</div>
                          <div className="text-xs text-muted-foreground">
                            {employee.periods.length === 0
                              ? "Отпуск ещё не назначен"
                              : `${employee.periods.length} период(а)`}
                          </div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      {data?.canManage ? (
                        <div className="flex items-center gap-1.5">
                          <Input
                            type="number"
                            min={0}
                            max={366}
                            step={1}
                            value={allowanceDrafts[employee.userId] ?? employee.allowanceDays}
                            onChange={(event) =>
                              setAllowanceDrafts((current) => ({
                                ...current,
                                [employee.userId]: event.target.value,
                              }))
                            }
                            onKeyDown={(event) => {
                              if (event.key === "Enter") {
                                event.preventDefault();
                                allowanceMutation.mutate(employee);
                              }
                            }}
                            className="h-8 w-20 text-center tabular-nums"
                            aria-label={`Дни отпуска для ${employeeName(employee)}`}
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-xs"
                            disabled={allowanceMutation.isPending}
                            onClick={() => allowanceMutation.mutate(employee)}
                            title="Сохранить лимит"
                          >
                            {allowanceMutation.isPending ? (
                              <Loader2 className="size-3.5 animate-spin" />
                            ) : (
                              <Save className="size-3.5" />
                            )}
                          </Button>
                        </div>
                      ) : (
                        <span className="font-semibold tabular-nums">{employee.allowanceDays}</span>
                      )}
                    </TableCell>
                    <TableCell className="text-center font-semibold tabular-nums">
                      {employee.usedDays}
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge
                        variant={employee.remainingDays < 0 ? "destructive" : "secondary"}
                        className="tabular-nums"
                      >
                        {employee.remainingDays}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex min-w-72 flex-wrap gap-2">
                        {employee.periods.length === 0 ? (
                          <span className="text-sm text-muted-foreground">—</span>
                        ) : (
                          employee.periods.map((period) => (
                            <div
                              key={period.id}
                              className="group flex items-center gap-1 rounded-md border bg-background px-2 py-1 text-sm"
                              title={period.note || undefined}
                            >
                              <CalendarRange className="size-3.5 text-muted-foreground" />
                              <span className="font-medium tabular-nums">{formatPeriod(period)}</span>
                              <span className="text-xs text-muted-foreground">
                                · {period.workingDays} раб. дн.
                              </span>
                              {period.status === "PENDING" && (
                                <Badge variant="outline" className="ml-1 text-[10px]">
                                  старое ожидание
                                </Badge>
                              )}
                              {data?.canManage && (
                                <div className="ml-1 flex items-center">
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon-xs"
                                    onClick={() => setEditor({ employee, period })}
                                    title="Изменить период"
                                  >
                                    <Pencil className="size-3" />
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon-xs"
                                    disabled={deleteMutation.isPending}
                                    onClick={() => removePeriod(period)}
                                    title="Удалить период"
                                  >
                                    <Trash2 className="size-3 text-destructive" />
                                  </Button>
                                </div>
                              )}
                            </div>
                          ))
                        )}
                      </div>
                    </TableCell>
                    {data?.canManage && (
                      <TableCell>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => setEditor({ employee })}
                          title="Добавить отпуск сотруднику"
                        >
                          <Plus className="size-4" />
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}

      <VacationEditor
        target={editor}
        year={year}
        employees={data?.employees ?? []}
        onClose={() => setEditor(null)}
        onSaved={() => {
          setEditor(null);
          queryClient.invalidateQueries({ queryKey: ["vacations"] });
          queryClient.invalidateQueries({ queryKey: ["schedule"] });
        }}
      />
    </div>
  );
}

function SummaryCard({
  label,
  value,
  icon,
  negative = false,
}: {
  label: string;
  value: number;
  icon?: React.ReactNode;
  negative?: boolean;
}) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className={cn("mt-1 text-2xl font-bold tabular-nums", negative && "text-destructive")}>
        {value}
      </div>
    </Card>
  );
}

function VacationEditor({
  target,
  year,
  employees,
  onClose,
  onSaved,
}: {
  target: EditorTarget | null;
  year: number;
  employees: VacationEmployee[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [userId, setUserId] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [note, setNote] = useState("");

  useEffect(() => {
    if (!target) return;
    setUserId(target.employee.userId);
    setDateFrom(target.period?.dateFrom.slice(0, 10) ?? `${year}-01-01`);
    setDateTo(target.period?.dateTo.slice(0, 10) ?? `${year}-01-01`);
    setNote(target.period?.note ?? "");
  }, [target, year]);

  const selectedEmployee =
    employees.find((employee) => employee.userId === userId) ?? target?.employee;
  const workingDays = countWorkingDays(dateFrom, dateTo);
  const calendarDays = calendarDayCount(dateFrom, dateTo);
  const usedWithoutCurrent = Math.max(
    (selectedEmployee?.usedDays ?? 0) -
      (target?.period && target.employee.userId === userId
        ? target.period.workingDays
        : 0),
    0
  );
  const afterVacation = usedWithoutCurrent + workingDays;
  const remainingAfter = (selectedEmployee?.allowanceDays ?? 0) - afterVacation;
  const invalidPeriod =
    !dateFrom ||
    !dateTo ||
    dateFrom > dateTo ||
    !dateFrom.startsWith(`${year}-`) ||
    !dateTo.startsWith(`${year}-`) ||
    workingDays === 0;
  const exceedsAllowance = remainingAfter < 0;

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!target || !selectedEmployee) throw new Error("Сотрудник не выбран");
      const editing = Boolean(target.period);
      const response = await fetch(
        editing ? `/api/vacations/${target.period?.id}` : "/api/vacations",
        {
          method: editing ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...(editing ? {} : { userId }),
            year,
            dateFrom,
            dateTo,
            note: note.trim() || null,
          }),
        }
      );
      if (!response.ok) await readError(response, "Не удалось сохранить отпуск");
      return response.json();
    },
    onSuccess: () => {
      toast.success(target?.period ? "Отпуск изменён" : "Отпуск добавлен");
      onSaved();
    },
    onError: (mutationError: Error) => toast.error(mutationError.message),
  });

  return (
    <Dialog open={target !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{target?.period ? "Изменить отпуск" : "Добавить отпуск"}</DialogTitle>
          <DialogDescription>
            Можно указать один день или непрерывный диапазон. Суббота и воскресенье в лимит не входят.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Сотрудник</Label>
            <Select
              value={userId}
              disabled={Boolean(target?.period)}
              onValueChange={setUserId}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Выберите сотрудника" />
              </SelectTrigger>
              <SelectContent>
                {employees.map((employee) => (
                  <SelectItem key={employee.userId} value={employee.userId}>
                    {employeeName(employee)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="vacation-from">С</Label>
              <Input
                id="vacation-from"
                type="date"
                min={`${year}-01-01`}
                max={`${year}-12-31`}
                value={dateFrom}
                onChange={(event) => setDateFrom(event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="vacation-to">По</Label>
              <Input
                id="vacation-to"
                type="date"
                min={`${year}-01-01`}
                max={`${year}-12-31`}
                value={dateTo}
                onChange={(event) => setDateTo(event.target.value)}
              />
            </div>
          </div>

          <Card className="grid grid-cols-2 gap-3 p-4 text-sm sm:grid-cols-4">
            <Metric label="Календарных" value={calendarDays} />
            <Metric label="Списывается" value={workingDays} />
            <Metric label="Лимит" value={selectedEmployee?.allowanceDays ?? 0} />
            <Metric label="Останется" value={remainingAfter} negative={remainingAfter < 0} />
          </Card>

          {calendarDays > workingDays && workingDays > 0 && (
            <p className="text-sm text-muted-foreground">
              Выходные не списываются: {calendarDays} календарных дней используют {workingDays} рабочих дней отпуска.
            </p>
          )}
          {exceedsAllowance && (
            <p className="text-sm font-medium text-destructive">
              Лимит превышен на {Math.abs(remainingAfter)} рабочий день.
            </p>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="vacation-note">Комментарий</Label>
            <Textarea
              id="vacation-note"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Причина изменения лимита или примечание к отпуску — необязательно"
              maxLength={500}
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Отмена
          </Button>
          <Button
            type="button"
            disabled={saveMutation.isPending || invalidPeriod || exceedsAllowance || !userId}
            onClick={() => saveMutation.mutate()}
          >
            {saveMutation.isPending && <Loader2 className="size-4 animate-spin" />}
            Сохранить
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Metric({
  label,
  value,
  negative = false,
}: {
  label: string;
  value: number;
  negative?: boolean;
}) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={cn("mt-0.5 text-lg font-bold tabular-nums", negative && "text-destructive")}>
        {value}
      </div>
    </div>
  );
}

function VacationSkeleton() {
  return (
    <Card className="p-4">
      <div className="space-y-4">
        {Array.from({ length: 5 }).map((_, index) => (
          <div key={index} className="flex items-center gap-3">
            <Skeleton className="size-9 rounded-full" />
            <Skeleton className="h-4 w-52" />
            <Skeleton className="ml-auto h-8 w-20" />
            <Skeleton className="h-8 w-64" />
          </div>
        ))}
      </div>
    </Card>
  );
}
