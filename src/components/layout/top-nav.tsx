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
import { Tab, Tabs } from "@qt/outline-ui";
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
    <header className="sticky top-0 z-40 bg-[var(--qto-background)]">
      <div className="mx-auto flex w-full max-w-[1600px] items-stretch gap-4 px-4 md:px-11">
        <Tabs
          aria-label={mode === "vacations" ? "Раздел отпусков" : "Разделы графика"}
          className="min-w-0 flex-1"
        >
          {items.map((item) => {
            const active = itemIsActive(pathname, item.href);

            return (
              <Tab key={item.key} active={active} asChild>
                <Link href={item.href}>{item.label}</Link>
              </Tab>
            );
          })}
        </Tabs>

        <div className="flex shrink-0 items-center border-b border-[var(--qto-divider)]">
          <DivisionSwitcher />
        </div>
      </div>
    </header>
  );
}
