import * as React from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function PageHeader({
  title,
  description,
  actions,
  className,
}: {
  icon?: LucideIcon;
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between", className)}>
      <div className="min-w-0">
        <h1 className="truncate text-[26px] font-medium leading-tight tracking-[-0.01em]">{title}</h1>
        {description && (
          <div className="mt-1 max-w-3xl text-[15px] text-[var(--outline-text-secondary)]">
            {description}
          </div>
        )}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

export function PageToolbar({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-3 border-b border-[var(--outline-divider)] pb-3 sm:flex-row sm:items-center sm:justify-between", className)}>
      {children}
    </div>
  );
}

export function DataPanel({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("min-w-0 overflow-hidden", className)}>{children}</div>;
}

export function StatePanel({
  title,
  description,
  tone = "neutral",
  className,
}: {
  icon?: LucideIcon;
  title: string;
  description?: React.ReactNode;
  tone?: "neutral" | "danger";
  className?: string;
}) {
  return (
    <div className={cn("flex min-h-36 flex-col items-center justify-center px-6 py-10 text-center", tone === "danger" ? "text-destructive" : "text-[var(--outline-text-tertiary)]", className)}>
      <p className="font-medium text-current">{title}</p>
      {description && <p className="mt-1 max-w-xl text-sm text-[var(--outline-text-tertiary)]">{description}</p>}
    </div>
  );
}

export function MetricGrid({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("grid border-y border-[var(--outline-divider)] sm:grid-cols-2 xl:grid-cols-4", className)}>{children}</div>;
}

export function MetricBlock({
  label,
  value,
  tone = "normal",
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  icon?: LucideIcon;
  tone?: "normal" | "danger";
}) {
  return (
    <div className="min-w-0 border-b border-[var(--outline-divider)] py-3 pr-6 last:border-b-0 sm:border-b-0 sm:border-r sm:px-4 sm:first:pl-0 sm:last:border-r-0">
      <div className="truncate text-sm text-[var(--outline-text-tertiary)]">{label}</div>
      <div className={cn("mt-0.5 text-xl font-medium tabular-nums", tone === "danger" && "text-destructive")}>{value}</div>
    </div>
  );
}

export function InlineNotice({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("border-l-2 border-[var(--outline-divider)] py-1 pl-3 text-sm text-[var(--outline-text-secondary)]", className)}>{children}</div>;
}
