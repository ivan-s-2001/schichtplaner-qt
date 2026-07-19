"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, ChevronDown, Loader2 } from "lucide-react";
import { toast } from "sonner";

type Division = {
  id: string;
  title: string;
  description: string | null;
  color: string;
  outlineGroupId: string | null;
};

type DivisionsResponse = {
  divisions: Division[];
  selected: Division | null;
  canViewReports: boolean;
};

export function DivisionSwitcher() {
  const pathname = usePathname();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [changing, setChanging] = useState(false);
  const { data, isLoading } = useQuery<DivisionsResponse>({
    queryKey: ["outline-divisions"],
    queryFn: async () => {
      const response = await fetch("/api/outline/divisions");
      if (!response.ok) throw new Error("Не удалось загрузить отделы");
      return response.json();
    },
    staleTime: 30_000,
  });

  if (isLoading) {
    return (
      <div className="outline-native-control flex h-8 items-center gap-2 px-2.5 text-sm text-muted-foreground">
        <Loader2 className="size-3.5 animate-spin" />
        <span className="hidden sm:inline">Подразделение</span>
      </div>
    );
  }

  if (!data?.selected || data.divisions.length === 0) return null;

  async function selectDivision(divisionId: string) {
    if (divisionId === data?.selected?.id || changing) return;
    setChanging(true);

    try {
      const response = await fetch("/api/outline/divisions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ divisionId }),
      });

      if (!response.ok) {
        const result = await response.json().catch(() => null);
        throw new Error(result?.error || "Не удалось переключить подразделение");
      }

      const result = (await response.json()) as {
        selected: Division;
        canViewReports?: boolean;
      };

      queryClient.setQueryData<DivisionsResponse>(["outline-divisions"], (current) =>
        current
          ? {
              ...current,
              selected: result.selected,
              canViewReports: Boolean(result.canViewReports),
            }
          : current
      );

      await queryClient.invalidateQueries({
        predicate: (query) => query.queryKey[0] !== "outline-divisions",
      });

      if (pathname.startsWith("/reporting") && !result.canViewReports) {
        router.replace("/schedule/employee");
      } else {
        router.refresh();
      }
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Не удалось переключить подразделение"
      );
    } finally {
      setChanging(false);
    }
  }

  return (
    <label className="outline-native-control group relative flex h-8 min-w-0 max-w-[15rem] items-center gap-2 px-2.5 text-sm">
      <Building2 className="hidden size-4 shrink-0 text-muted-foreground sm:block" strokeWidth={1.8} />
      <span
        aria-hidden="true"
        className="size-2 shrink-0 rounded-full"
        style={{ backgroundColor: data.selected.color }}
      />
      <span className="sr-only">Текущее подразделение</span>
      <select
        aria-label="Текущее подразделение"
        value={data.selected.id}
        disabled={changing}
        onChange={(event) => void selectDivision(event.target.value)}
        className="min-w-0 flex-1 cursor-pointer appearance-none truncate border-0 bg-transparent pr-5 font-medium text-foreground outline-none disabled:cursor-wait"
      >
        {data.divisions.map((division) => (
          <option key={division.id} value={division.id}>
            {division.title}
          </option>
        ))}
      </select>
      {changing ? (
        <Loader2 className="absolute right-2 size-3.5 animate-spin text-muted-foreground" />
      ) : (
        <ChevronDown className="pointer-events-none absolute right-2 size-3.5 text-muted-foreground" />
      )}
    </label>
  );
}
