"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, CalendarDays } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import type { ProjectNavItem } from "./top-nav";

export function MobileNav({
  items,
  homeHref,
}: {
  items: ProjectNavItem[];
  homeHref: string;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  function isActive(href: string) {
    const segment = `/${href.split("/")[1]}`;
    return pathname.startsWith(segment);
  }

  const itemClass = (active: boolean) =>
    cn(
      "flex min-h-[30px] items-center gap-2 rounded-sm px-3 py-1.5 text-sm font-medium transition-colors",
      active
        ? "bg-accent text-accent-foreground"
        : "text-muted-foreground hover:bg-secondary hover:text-foreground"
    );

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="md:hidden">
          <Menu className="size-5" />
          <span className="sr-only">Открыть меню проекта</span>
        </Button>
      </SheetTrigger>

      <SheetContent side="left" className="w-72 border-border bg-background p-0">
        <SheetHeader className="border-b border-border px-4 py-3">
          <SheetTitle>
            <Link
              href={homeHref}
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 text-base font-semibold text-foreground"
            >
              <CalendarDays className="size-5 text-muted-foreground" />
              QuickTickets
            </Link>
          </SheetTitle>
        </SheetHeader>

        <nav className="flex flex-col gap-0.5 p-3">
          {items.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);

            return (
              <Link
                key={item.key}
                href={item.href}
                onClick={() => setOpen(false)}
                className={itemClass(active)}
              >
                <Icon className="size-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </SheetContent>
    </Sheet>
  );
}
