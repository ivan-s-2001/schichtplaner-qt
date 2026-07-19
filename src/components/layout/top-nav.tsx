"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { DivisionSwitcher } from "./division-switcher";

export type ProjectMode = "schedule" | "vacations";
export type ProjectNavItem = {
  key: "schedule" | "vacations" | "time" | "employees" | "reporting";
  label: string;
  href: string;
};

type DivisionsResponse = {
  canViewReports: boolean;
};

const scheduleItems: ProjectNavItem[] = [
  { key: "schedule", label: "График", href: "/schedule/employee" },
  { key: "time", label: "Учёт времени", href: "/time" },
  { key: "employees", label: "Сотрудники", href: "/employees" },
];

const reportingItem: ProjectNavItem = {
  key: "reporting",
  label: "Отчёты",
  href: "/reporting",
};

const vacationItems: ProjectNavItem[] = [
  { key: "vacations", label: "Отпуска", href: "/vacations" },
];

function itemIsActive(pathname: string, href: string) {
  const root = `/${href.split("/")[1]}`;
  return pathname === href || pathname.startsWith(`${root}/`) || pathname === root;
}

export function TopNav({ mode }: { mode: ProjectMode }) {
  const pathname = usePathname();
  const { data } = useQuery<DivisionsResponse>({
    queryKey: ["outline-divisions"],
    queryFn: async () => {
      const response = await fetch("/api/outline/divisions");
      if (!response.ok) throw new Error("Не удалось загрузить отделы");
      return response.json();
    },
    staleTime: 30_000,
  });

  const items =
    mode === "vacations"
      ? vacationItems
      : data?.canViewReports
        ? [...scheduleItems, reportingItem]
        : scheduleItems;

  return (
    <header className="sticky top-0 z-40 bg-background">
      <div className="mx-auto w-full max-w-[1600px] px-4 md:px-11">
        <div className="flex min-w-0 items-end gap-6 border-b border-[var(--outline-divider)]">
          <nav
            aria-label={mode === "vacations" ? "Раздел отпусков" : "Разделы графика"}
            className="outline-native-tabs min-w-0 flex-1 overflow-x-auto"
          >
            <div className="flex min-w-max items-end gap-6">
              {items.map((item) => {
                const active = itemIsActive(pathname, item.href);

                return (
                  <Link
                    key={item.key}
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "outline-native-tab relative inline-flex items-center whitespace-nowrap py-3 text-sm font-medium md:py-1.5",
                      active
                        ? "text-[var(--outline-text-secondary)]"
                        : "text-[var(--outline-text-tertiary)] hover:text-[var(--outline-text-secondary)]"
                    )}
                  >
                    {item.label}
                    {active && (
                      <span
                        aria-hidden="true"
                        className="absolute inset-x-0 -bottom-px h-[3px] rounded-[3px] bg-[var(--outline-text-secondary)]"
                      />
                    )}
                  </Link>
                );
              })}
            </div>
          </nav>

          <div className="shrink-0 pb-2.5 md:pb-1.5">
            <DivisionSwitcher />
          </div>
        </div>
      </div>
    </header>
  );
}
