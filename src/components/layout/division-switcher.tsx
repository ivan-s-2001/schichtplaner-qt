"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Building2, Loader2 } from "lucide-react";

type Division = {
  id: string;
  title: string;
  description: string | null;
  color: string;
  outlineGroupId: string;
};

type DivisionsResponse = {
  divisions: Division[];
  selected: Division | null;
};

export function DivisionSwitcher() {
  const [changing, setChanging] = useState(false);
  const { data, isLoading } = useQuery<DivisionsResponse>({
    queryKey: ["outline-divisions"],
    queryFn: async () => {
      const response = await fetch("/api/outline/divisions");
      if (!response.ok) throw new Error("Не удалось загрузить отделы");
      return response.json();
    },
  });

  if (isLoading) {
    return (
      <div className="hidden items-center gap-2 px-2 text-xs text-muted-foreground lg:flex">
        <Loader2 className="size-3.5 animate-spin" />
        Отделы
      </div>
    );
  }

  if (!data?.selected || data.divisions.length === 0) return null;

  async function selectDivision(divisionId: string) {
    if (divisionId === data?.selected?.id) return;
    setChanging(true);

    const response = await fetch("/api/outline/divisions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ divisionId }),
    });

    if (!response.ok) {
      setChanging(false);
      return;
    }

    window.location.reload();
  }

  return (
    <label className="hidden min-w-0 items-center gap-1.5 rounded-md border border-border bg-background px-2 py-1 text-xs text-muted-foreground lg:flex">
      <Building2 className="size-3.5 shrink-0" />
      <span className="sr-only">Отдел</span>
      <select
        aria-label="Текущий отдел"
        value={data.selected.id}
        disabled={changing}
        onChange={(event) => void selectDivision(event.target.value)}
        className="max-w-52 min-w-28 cursor-pointer bg-transparent font-medium text-foreground outline-none disabled:cursor-wait"
      >
        {data.divisions.map((division) => (
          <option key={division.id} value={division.id}>
            {division.title}
          </option>
        ))}
      </select>
      {changing && <Loader2 className="size-3.5 animate-spin" />}
    </label>
  );
}
