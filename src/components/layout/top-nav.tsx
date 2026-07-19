"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  CalendarDays,
  CalendarRange,
  Clock,
  Users,
  BarChart3,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { MobileNav } from "./mobile-nav";
import { DivisionSwitcher } from "./division-switcher";
import { ThemeToggle } from "./theme-toggle";

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

export function TopNav({ mode }: { mode: ProjectMode }) {
  const pathname = usePathname();
  const { data } = useQuery<DivisionsResponse>({
    queryKey: ["outline-divisions"],
    queryFn: async () => {
      const response = await fetch("/api/outline/divisions");
      if (!response.ok) throw new Error("Не удалось загрузить отделы");
      return response.json();
    },
  });

  const items =
    mode === "vacations"
      ? vacationItems
      : data?.canViewReports
        ? [...scheduleItems, reportingItem]
        : scheduleItems;
  const homeHref = mode === "vacations" ? "/vacations" : "/schedule/employee";
  const projectTitle = mode === "vacations" ? "Отпуска" : "График работы";
  const HomeIcon = mode === "vacations" ? CalendarRange : CalendarDays;

  function isActive(href: string) {
    const segment = `/${href.split("/")[1]}`;
    return pathname.startsWith(segment);
  }

  const itemClass = (active: boolean) =>
    cn(
      "relative flex min-h-8 items-center gap-1.5 rounded-sm px-2.5 text-sm font-medium transition-colors duration-150",
      active
        ? "bg-accent text-accent-foreground"
        : "text-muted-foreground hover:bg-secondary hover:text-foreground"
    );

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/88">
      <div className="mx-auto flex h-12 max-w-[1600px] items-center gap-2 px-4 md:px-6 lg:px-8">
        <MobileNav items={items} homeHref={homeHref} />

        <Link
          href={homeHref}
          className="mr-3 flex min-w-0 items-center gap-2 rounded-sm px-1.5 py-1 text-sm font-semibold text-foreground hover:bg-secondary"
        >
          <HomeIcon className="size-5 text-muted-foreground" />
          <span className="hidden truncate sm:inline">{projectTitle}</span>
        </Link>

        <nav className="hidden items-center gap-0.5 md:flex">
          {items.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);

            return (
              <Link key={item.key} href={item.href} className={itemClass(active)}>
                <Icon className="size-4" />
                <span className="hidden lg:inline">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-1.5">
          <DivisionSwitcher />
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
