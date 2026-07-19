"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart3,
  CalendarDays,
  CalendarRange,
  Clock,
  Users,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { DivisionSwitcher } from "./division-switcher";

export type ProjectMode = "schedule" | "vacations";
export type ProjectNavItem = {
  key: "schedule" | "vacations" | "time" | "employees" | "reporting";
  label: string;
  icon: LucideIcon;
  href: string;
};

type DivisionsResponse = {
  canViewReports: boolean;
};

const scheduleItems: ProjectNavItem[] = [
  {
    key: "schedule",
    label: "График",
    icon: CalendarDays,
    href: "/schedule/employee",
  },
  { key: "time", label: "Учёт времени", icon: Clock, href: "/time" },
  { key: "employees", label: "Сотрудники", icon: Users, href: "/employees" },
];

const reportingItem: ProjectNavItem = {
  key: "reporting",
  label: "Отчёты",
  icon: BarChart3,
  href: "/reporting",
};

const vacationItems: ProjectNavItem[] = [
  {
    key: "vacations",
    label: "Отпуска",
    icon: CalendarRange,
    href: "/vacations",
  },
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
    <header className="outline-native-toolbar sticky top-0 z-40">
      <div className="mx-auto flex min-h-16 w-full max-w-[1600px] items-stretch gap-3 px-4 md:px-11">
        <nav
          aria-label={mode === "vacations" ? "Раздел отпусков" : "Разделы графика"}
          className="outline-native-tabs min-w-0 flex-1 overflow-x-auto"
        >
          <div className="flex h-full min-w-max items-stretch gap-1">
            {items.map((item) => {
              const Icon = item.icon;
              const active = itemIsActive(pathname, item.href);

              return (
                <Link
                  key={item.key}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "outline-native-tab relative flex min-h-16 items-center gap-2 px-3 text-sm font-medium",
                    active
                      ? "text-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <Icon className="size-4" strokeWidth={1.8} />
                  <span>{item.label}</span>
                  {active && (
                    <span
                      aria-hidden="true"
                      className="absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-primary"
                    />
                  )}
                </Link>
              );
            })}
          </div>
        </nav>

        <div className="flex shrink-0 items-center">
          <DivisionSwitcher />
        </div>
      </div>
    </header>
  );
}
