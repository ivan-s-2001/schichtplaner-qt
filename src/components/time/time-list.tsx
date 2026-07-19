"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Clock,
  Pencil,
  Plus,
  Search,
  Timer,
  Trash2,
} from "lucide-react";
import { addMonths, format, subMonths } from "date-fns";
import { ru } from "date-fns/locale";
import { toast } from "sonner";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useCurrentMember } from "@/lib/hooks/use-current-member";
import { TimeRecordForm } from "./time-record-form";
import { Stopwatch } from "./stopwatch";

type TimeRecord = {
  id: string;
  userId: string;
  date: string;
  timeFrom: string | null;
  timeTo: string | null;
  durationHours: number | null;
  durationMinutes: number | null;
  type: "MANUAL" | "WATCH" | "MANUAL_DURATION";
  categoryId: string | null;
  comment: string | null;
  category: { id: string; name: string } | null;
};

type EmployeeGroup = {
  userId: string;
  firstName: string;
  lastName: string;
  profileImage: string | null;
  totalHours: number;
  records: TimeRecord[];
};

type TimeResponse = {
  employees: EmployeeGroup[];
};

function initials(firstName: string, lastName: string) {
  return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
}

function formatHours(hours: number) {
  const whole = Math.floor(hours);
  const minutes = Math.round((hours - whole) * 60);
  return minutes > 0 ? `${whole} ч ${minutes} мин` : `${whole} ч`;
}

function recordTime(record: TimeRecord) {
  if (record.type === "MANUAL_DURATION") {
    return `${record.durationHours ?? 0} ч ${record.durationMinutes ?? 0} мин`;
  }
  if (record.timeFrom && record.timeTo) return `${record.timeFrom}–${record.timeTo}`;
  if (record.timeFrom) return `${record.timeFrom}–…`;
  return "—";
}

export function TimeList() {
  const queryClient = useQueryClient();
  const { data: currentMember } = useCurrentMember();
  const isManager =
    currentMember?.role === "OWNER" ||
    currentMember?.role === "ADMIN" ||
    currentMember?.role === "MANAGER";

  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [search, setSearch] = useState("");
  const [expandedUsers, setExpandedUsers] = useState<Set<string>>(new Set());
  const [showRecordForm, setShowRecordForm] = useState(false);
  const [editingRecord, setEditingRecord] = useState<TimeRecord | null>(null);
  const [showStopwatch, setShowStopwatch] = useState(false);

  const monthKey = format(currentMonth, "yyyy-MM");
  const { data, isLoading, error } = useQuery<TimeResponse>({
    queryKey: ["time-records", monthKey],
    queryFn: async () => {
      const response = await fetch(`/api/time?month=${monthKey}`);
      if (!response.ok) throw new Error("Не удалось загрузить учёт времени");
      return response.json();
    },
  });

  const employees = data?.employees ?? [];
  const filteredEmployees = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return employees;
    return employees.filter((employee) =>
      `${employee.lastName} ${employee.firstName}`.toLowerCase().includes(query)
    );
  }, [employees, search]);

  const employeeOptions = useMemo(
    () =>
      employees.map((employee) => ({
        userId: employee.userId,
        firstName: employee.firstName,
        lastName: employee.lastName,
      })),
    [employees]
  );

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await fetch(`/api/time/${id}`, { method: "DELETE" });
      if (!response.ok) {
        const result = await response.json().catch(() => null);
        throw new Error(result?.error || "Не удалось удалить запись");
      }
    },
    onSuccess: async () => {
      toast.success("Запись удалена");
      await queryClient.invalidateQueries({ queryKey: ["time-records"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  function toggleUser(userId: string) {
    setExpandedUsers((current) => {
      const next = new Set(current);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  }

  function editRecord(record: TimeRecord) {
    setEditingRecord(record);
    setShowRecordForm(true);
  }

  function removeRecord(record: TimeRecord) {
    if (window.confirm("Удалить запись рабочего времени?")) {
      deleteMutation.mutate(record.id);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Учёт времени</h1>
          <p className="text-sm text-muted-foreground">
            Рабочее время сотрудников выбранного отдела
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowStopwatch((value) => !value)}
          >
            <Timer className="size-4" />
            Секундомер
          </Button>
          <Button
            size="sm"
            onClick={() => {
              setEditingRecord(null);
              setShowRecordForm(true);
            }}
          >
            <Plus className="size-4" />
            Добавить
          </Button>
        </div>
      </div>

      {showStopwatch && (
        <div className="max-w-sm">
          <Stopwatch />
        </div>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon-sm"
            onClick={() => setCurrentMonth((date) => subMonths(date, 1))}
          >
            <ChevronLeft className="size-4" />
          </Button>
          <span className="min-w-40 text-center text-lg font-semibold capitalize">
            {format(currentMonth, "LLLL yyyy", { locale: ru })}
          </span>
          <Button
            variant="outline"
            size="icon-sm"
            onClick={() => setCurrentMonth((date) => addMonths(date, 1))}
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>

        {isManager && (
          <div className="relative w-full sm:max-w-xs">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Найти сотрудника"
              className="pl-9"
            />
          </div>
        )}
      </div>

      {isLoading && <TimeListSkeleton />}
      {error && (
        <Card className="p-6 text-center text-destructive">
          Не удалось загрузить данные.
        </Card>
      )}
      {!isLoading && !error && filteredEmployees.length === 0 && (
        <Card className="p-10 text-center text-muted-foreground">
          Записей за выбранный месяц нет.
        </Card>
      )}

      {!isLoading &&
        !error &&
        filteredEmployees.map((employee) => {
          const expanded = expandedUsers.has(employee.userId);
          return (
            <Card key={employee.userId} className="overflow-hidden">
              <button
                type="button"
                className="flex w-full items-center gap-3 p-4 text-left transition-colors hover:bg-muted/50"
                onClick={() => toggleUser(employee.userId)}
              >
                <Avatar>
                  <AvatarFallback>
                    {initials(employee.firstName, employee.lastName)}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">
                    {employee.lastName} {employee.firstName}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {employee.records.length} записей
                  </div>
                </div>
                <Badge variant="secondary">{formatHours(employee.totalHours)}</Badge>
                {expanded ? (
                  <ChevronUp className="size-5 text-muted-foreground" />
                ) : (
                  <ChevronDown className="size-5 text-muted-foreground" />
                )}
              </button>

              {expanded && (
                <div className="divide-y border-t">
                  {employee.records.length === 0 ? (
                    <div className="p-5 text-center text-sm text-muted-foreground">
                      Записей нет
                    </div>
                  ) : (
                    employee.records.map((record) => (
                      <div
                        key={record.id}
                        className="flex flex-wrap items-center gap-3 px-4 py-3"
                      >
                        <Clock className="size-4 text-muted-foreground" />
                        <div className="min-w-28 text-sm font-medium">
                          {format(new Date(record.date), "dd.MM.yyyy")}
                        </div>
                        <div className="font-mono text-sm">{recordTime(record)}</div>
                        {record.category && (
                          <Badge variant="outline">{record.category.name}</Badge>
                        )}
                        {record.comment && (
                          <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
                            {record.comment}
                          </span>
                        )}
                        <div className="ml-auto flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon-xs"
                            onClick={() => editRecord(record)}
                          >
                            <Pencil className="size-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-xs"
                            disabled={deleteMutation.isPending}
                            onClick={() => removeRecord(record)}
                          >
                            <Trash2 className="size-3.5 text-destructive" />
                          </Button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </Card>
          );
        })}

      <TimeRecordForm
        open={showRecordForm}
        onOpenChange={(open) => {
          setShowRecordForm(open);
          if (!open) setEditingRecord(null);
        }}
        record={editingRecord}
        employees={employeeOptions}
      />
    </div>
  );
}

function TimeListSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 3 }).map((_, index) => (
        <Card key={index} className="p-4">
          <div className="flex items-center gap-3">
            <Skeleton className="size-10 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-3 w-24" />
            </div>
            <Skeleton className="h-6 w-16 rounded-full" />
          </div>
        </Card>
      ))}
    </div>
  );
}
