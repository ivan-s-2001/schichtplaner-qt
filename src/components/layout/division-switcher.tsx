"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, Loader2 } from "lucide-react";
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
      <div className="outline-native-control flex h-8 items-center gap-1.5 px-2 text-sm text-[var(--outline-text-tertiary)]">
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
    <label className="outline-native-control relative flex h-8 min-w-0 max-w-[15rem] items-center text-sm">
      <span className="sr-only">Текущее подразделение</span>
      <select
        aria-label="Текущее подразделение"
        value={data.selected.id}
        disabled={changing}
        onChange={(event) => void selectDivision(event.target.value)}
        className="h-full min-w-0 flex-1 cursor-pointer appearance-none truncate border-0 bg-transparent py-0 pl-2 pr-7 text-sm font-medium text-[var(--outline-button-neutral-text)] outline-none disabled:cursor-wait"
      >
        {data.divisions.map((division) => (
          <option key={division.id} value={division.id}>
            {division.title}
          </option>
        ))}
      </select>
      {changing ? (
        <Loader2 className="pointer-events-none absolute right-2 size-3.5 animate-spin text-[var(--outline-text-tertiary)]" />
      ) : (
        <ChevronDown className="pointer-events-none absolute right-1.5 size-4 text-[var(--outline-text-tertiary)]" />
      )}
    </label>
  );
}
