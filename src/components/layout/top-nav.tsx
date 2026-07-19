"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  CalendarDays,
  Clock,
  Users,
  MessageSquare,
  BarChart3,
  Settings,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { UserMenu } from "./user-menu";
import { MobileNav } from "./mobile-nav";
import { ConnectionStatus } from "./connection-status";
import { DivisionSwitcher } from "./division-switcher";

const navItems = [
  { key: "schedule", icon: CalendarDays, href: "/schedule/employee", label: "График" },
  { key: "time", icon: Clock, href: "/time", label: "Учёт времени" },
  { key: "employees", icon: Users, href: "/employees", label: "Сотрудники" },
  { key: "portal", icon: MessageSquare, href: "/portal/inbox", label: "Портал" },
  { key: "reporting", icon: BarChart3, href: "/reporting", label: "Отчёты" },
  { key: "settings", icon: Settings, href: "/settings", label: "Настройки" },
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
      "relative flex min-h-8 items-center gap-1.5 rounded-sm px-2.5 text-sm font-medium text-[#4e5c6e] transition-colors duration-150",
      active
        ? "bg-[#cdd8e5] text-[#111319]"
        : "hover:bg-[#dee5ed] hover:text-[#111319]"
    );

  return (
    <header className="sticky top-0 z-40 border-b border-[#dae1e9] bg-[#eef2f6]">
      <div className="mx-auto flex h-12 max-w-[1600px] items-center gap-2 px-4 md:px-6 lg:px-8">
        <MobileNav />

        <Link
          href="/schedule/employee"
          className="mr-3 flex min-w-0 items-center gap-2 rounded-sm px-1.5 py-1 text-sm font-semibold text-[#111319] hover:bg-[#dee5ed]"
        >
          <CalendarDays className="size-5 text-[#4e5c6e]" />
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
                  <span className="absolute -right-1 -top-1 flex size-4 items-center justify-center rounded-full bg-[#ed2651] text-[10px] font-semibold text-white">
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
            <Sparkles className="size-4" />
            <span className="hidden lg:inline">ИИ</span>
          </Link>

          <ConnectionStatus />
          <UserMenu />
        </div>
      </div>
    </header>
  );
}
