"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarOff, Clock3, Loader2, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { AbsenceSettings } from "@/components/settings/absence-settings";
import { TimeSettings } from "@/components/settings/time-settings";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useCurrentMember } from "@/lib/hooks/use-current-member";
import { cn } from "@/lib/utils";

type SettingsResponse = {
  organization: {
    id: string;
    name: string;
    managedByOutline: boolean;
  };
  timeSettings: {
    whoCanUse: string;
    watchAutoStop: boolean;
    warningsEnabled: boolean;
    warningsMaxHours: number;
    useCategories: boolean;
  };
  absenceCategories: {
    id: string;
    name: string;
    color: string;
    isPaid: boolean;
  }[];
  holidays: {
    id: string;
    name: string;
    date: string;
    country: string;
    state: string | null;
  }[];
};

type Section = "time" | "absences";

export default function SettingsPage() {
  const queryClient = useQueryClient();
  const { data: currentMember, isLoading: memberLoading } = useCurrentMember();
  const [activeSection, setActiveSection] = useState<Section>("time");

  const isAdmin =
    currentMember?.role === "OWNER" || currentMember?.role === "ADMIN";

  const { data, isLoading, error } = useQuery<SettingsResponse>({
    queryKey: ["settings"],
    queryFn: async () => {
      const response = await fetch("/api/settings");
      if (!response.ok) throw new Error("Ошибка загрузки настроек");
      return response.json();
    },
    enabled: isAdmin,
  });

  const updateMutation = useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const response = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        const result = await response.json().catch(() => null);
        throw new Error(result?.error || "Ошибка сохранения");
      }
      return response.json();
    },
    onSuccess: async () => {
      toast.success("Настройки сохранены");
      await queryClient.invalidateQueries({ queryKey: ["settings"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (memberLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-20">
        <ShieldAlert className="size-12 text-muted-foreground/50" />
        <h2 className="text-xl font-semibold">Доступ запрещён</h2>
        <p className="text-sm text-muted-foreground">
          Рабочие настройки доступны администраторам Outline.
        </p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <Card className="p-6 text-center text-destructive">
        Не удалось загрузить настройки.
      </Card>
    );
  }

  const holidayCountry = data.holidays[0]?.country ?? "RU";
  const holidayState = data.holidays[0]?.state ?? "";

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Рабочие настройки</h1>
        <p className="text-sm text-muted-foreground">
          Пользователи, группы и workspace «{data.organization.name}» управляются в Outline.
        </p>
      </div>

      <div className="flex flex-wrap gap-2 border-b pb-3">
        <Button
          type="button"
          variant={activeSection === "time" ? "secondary" : "ghost"}
          onClick={() => setActiveSection("time")}
          className={cn(activeSection === "time" && "font-semibold")}
        >
          <Clock3 className="size-4" />
          Учёт времени
        </Button>
        <Button
          type="button"
          variant={activeSection === "absences" ? "secondary" : "ghost"}
          onClick={() => setActiveSection("absences")}
          className={cn(activeSection === "absences" && "font-semibold")}
        >
          <CalendarOff className="size-4" />
          Отпуска и больничные
        </Button>
      </div>

      {activeSection === "time" && (
        <TimeSettings
          timeSettings={data.timeSettings}
          onUpdate={(value) => updateMutation.mutate(value)}
          isSaving={updateMutation.isPending}
        />
      )}

      {activeSection === "absences" && (
        <AbsenceSettings
          categories={data.absenceCategories}
          holidayCountry={holidayCountry}
          holidayState={holidayState}
          onUpdateSettings={(value) => updateMutation.mutate(value)}
          isSaving={updateMutation.isPending}
        />
      )}
    </div>
  );
}
