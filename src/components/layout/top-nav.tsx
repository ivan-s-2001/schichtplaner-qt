"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  CalendarDays,
  Clock,
  Users,
  BarChart3,
  Settings,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { MobileNav } from "./mobile-nav";
import { ThemeToggle } from "./theme-toggle";

export const navItems = [
  { key: "schedule", icon: CalendarDays, href: "/schedule/employee" },
  { key: "time", icon: Clock, href: "/time" },
  { key: "employees", icon: Users, href: "/employees" },
  { key: "reporting", icon: BarChart3, href: "/reporting" },
  { key: "settings", icon: Settings, href: "/settings/interface" },
] as const;

export function TopNav() {
  const pathname = usePathname();
  const t = useTranslations("nav");

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
        <MobileNav />

        <Link
          href="/schedule/employee"
          className="mr-3 flex min-w-0 items-center gap-2 rounded-sm px-1.5 py-1 text-sm font-semibold text-foreground hover:bg-secondary"
        >
          <CalendarDays className="size-5 text-muted-foreground" />
          <span className="hidden truncate sm:inline">QuickTickets</span>
        </Link>

        <nav className="hidden items-center gap-0.5 md:flex">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);

            return (
              <Link key={item.key} href={item.href} className={itemClass(active)}>
                <Icon className="size-4" />
                <span className="hidden lg:inline">{t(item.key)}</span>
              </Link>
            );
          })}
        </nav>

        <ThemeToggle />
      </div>
    </header>
  );
}
