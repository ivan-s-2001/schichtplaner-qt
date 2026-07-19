import * as React from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";

export function PageHeader({
  icon: Icon,
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
    <header
      className={cn(
        "flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between",
        className
      )}
    >
      <div className="min-w-0">
        <div className="flex items-center gap-2.5">
          {Icon && <Icon className="size-6 shrink-0 text-muted-foreground" strokeWidth={1.7} />}
          <h1 className="truncate text-3xl font-semibold tracking-tight">{title}</h1>
        </div>
        {description && (
          <div className="mt-1.5 max-w-3xl text-sm text-muted-foreground">
            {description}
          </div>
        )}
      </div>
      {actions && (
        <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
      )}
    </header>
  );
}

export function PageToolbar({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3 border-y border-border py-3 sm:flex-row sm:items-center sm:justify-between",
        className
      )}
    >
      {children}
    </div>
  );
}

export function DataPanel({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Card className={cn("overflow-hidden py-0", className)}>{children}</Card>
  );
}

export function StatePanel({
  icon: Icon,
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
    <Card
      className={cn(
        "items-center justify-center gap-2 p-10 text-center",
        tone === "danger" && "border-destructive/30 text-destructive",
        className
      )}
    >
      {Icon && (
        <Icon
          className={cn(
            "size-8",
            tone === "danger" ? "text-destructive" : "text-muted-foreground"
          )}
          strokeWidth={1.6}
        />
      )}
      <p className="font-medium">{title}</p>
      {description && (
        <p className="max-w-xl text-sm text-muted-foreground">{description}</p>
      )}
    </Card>
  );
}

export function MetricGrid({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "grid gap-px overflow-hidden rounded-md border border-border bg-border sm:grid-cols-2 xl:grid-cols-4",
        className
      )}
    >
      {children}
    </div>
  );
}

export function MetricBlock({
  label,
  value,
  icon: Icon,
  tone = "normal",
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  icon?: LucideIcon;
  tone?: "normal" | "danger";
}) {
  return (
    <div className="min-w-0 bg-background px-4 py-3.5">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        {Icon && <Icon className="size-4" strokeWidth={1.7} />}
        <span className="truncate">{label}</span>
      </div>
      <div
        className={cn(
          "mt-1 text-2xl font-semibold tabular-nums",
          tone === "danger" && "text-destructive"
        )}
      >
        {value}
      </div>
    </div>
  );
}

export function InlineNotice({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-md border border-border bg-muted/50 px-3 py-2.5 text-sm text-muted-foreground",
        className
      )}
    >
      {children}
    </div>
  );
}
