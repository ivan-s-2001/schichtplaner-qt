"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  CalendarIcon,
  ClockIcon,
  TeamIcon,
  CommentIcon,
  GraphIcon,
  SettingsIcon,
  SparklesIcon,
} from "@/components/icons/outline-icons";
import { cn } from "@/lib/utils";
import { UserMenu } from "./user-menu";
import { MobileNav } from "./mobile-nav";
import { ConnectionStatus } from "./connection-status";
import { DivisionSwitcher } from "./division-switcher";

const navItems = [
  { key: "schedule", icon: CalendarIcon, href: "/schedule/employee", label: "График" },
  { key: "time", icon: ClockIcon, href: "/time", label: "Учёт времени" },
  { key: "employees", icon: TeamIcon, href: "/employees", label: "Сотрудники" },
  { key: "portal", icon: CommentIcon, href: "/portal/inbox", label: "Портал" },
  { key: "reporting", icon: GraphIcon, href: "/reporting", label: "Отчёты" },
  { key: "settings", icon: SettingsIcon, href: "/settings", label: "Настройки" },
] as const;

export { navItems };

export function TopNav() {
  const pathname = usePathname();

  const { data: unreadData } = useQuery<{ count: number }>({
    queryKey: ["messages", "unread-count"],
    queryFn: () => fetch("/api/messages/unread-count").then((r) => r.json()),
    refetchInterval: 30000,
  });

  const unreadCount = unreadData?.count ?? 0;

  function isActive(href: string) {
    const segment = "/" + href.split("/")[1];
    return pathname.startsWith(segment);
  }

  const itemClass = (active: boolean) =>
    cn(
      "relative flex min-h-8 items-center gap-1.5 rounded-md px-2.5 text-sm font-medium transition-colors duration-150",
      active
        ? "bg-accent text-foreground"
        : "text-muted-foreground hover:bg-secondary hover:text-foreground"
    );

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/88">
      <div className="mx-auto flex h-12 max-w-[1600px] items-center gap-2 px-4 md:px-6 lg:px-8">
        <MobileNav />

        <Link
          href="/schedule/employee"
          className="mr-3 flex min-w-0 items-center gap-2 rounded-md px-1.5 py-1 text-sm font-semibold text-foreground hover:bg-secondary"
        >
          <CalendarIcon className="size-5 text-muted-foreground" />
          <span className="hidden truncate sm:inline">QuickTickets</span>
        </Link>

        <nav className="hidden items-center gap-0.5 md:flex">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);
            return (
              <Link key={item.key} href={item.href} className={itemClass(active)}>
                <Icon className="size-4" />
                <span className="hidden lg:inline">{item.label}</span>
                {item.key === "portal" && unreadCount > 0 && (
                  <span className="absolute -right-1 -top-1 flex size-4 items-center justify-center rounded-full bg-destructive text-[10px] font-semibold text-white">
                    {unreadCount > 9 ? "9+" : unreadCount}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-1">
          <DivisionSwitcher />

          <Link href="/ai/chat" className={itemClass(pathname.startsWith("/ai"))}>
            <SparklesIcon className="size-4" />
            <span className="hidden lg:inline">ИИ</span>
          </Link>

          <ConnectionStatus />
          <UserMenu />
        </div>
      </div>
    </header>
  );
}
