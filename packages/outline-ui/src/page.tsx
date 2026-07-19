import * as React from "react";
import { Card } from "./surfaces";
import { cx } from "./utils";

type IconComponent = React.ComponentType<{
  className?: string;
  strokeWidth?: number;
  "aria-hidden"?: boolean;
}>;

export function PageHeader({
  icon: Icon,
  title,
  description,
  actions,
  className,
}: {
  icon?: IconComponent;
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <header className={cx("qto-page-header", className)}>
      <div className="min-w-0">
        <div className="flex items-center gap-2.5">
          {Icon && <Icon className="size-5 shrink-0 text-[var(--qto-text-tertiary)]" strokeWidth={1.7} aria-hidden />}
          <h1 className="qto-page-title truncate">{title}</h1>
        </div>
        {description && <div className="qto-page-description">{description}</div>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

export function PageToolbar({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cx("qto-toolbar", className)} {...props} />;
}

export function DataPanel({ className, ...props }: React.ComponentProps<typeof Card>) {
  return <Card className={cx("overflow-hidden", className)} {...props} />;
}

export function StatePanel({
  icon: Icon,
  title,
  description,
  tone = "neutral",
  className,
}: {
  icon?: IconComponent;
  title: string;
  description?: React.ReactNode;
  tone?: "neutral" | "danger";
  className?: string;
}) {
  return (
    <Card className={cx("qto-state", tone === "danger" && "border-[var(--qto-danger)]", className)}>
      {Icon && (
        <Icon
          className={cx(
            "size-6",
            tone === "danger"
              ? "text-[var(--qto-danger)]"
              : "text-[var(--qto-text-tertiary)]"
          )}
          strokeWidth={1.6}
          aria-hidden
        />
      )}
      <p className={cx("qto-state-title", tone === "danger" && "text-[var(--qto-danger)]")}>
        {title}
      </p>
      {description && <p className="qto-help max-w-xl">{description}</p>}
    </Card>
  );
}

export function MetricGrid({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cx(
        "grid overflow-hidden rounded-lg border border-[var(--qto-divider)] sm:grid-cols-2 xl:grid-cols-4",
        className
      )}
      {...props}
    />
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
  icon?: IconComponent;
  tone?: "normal" | "danger";
}) {
  return (
    <div className="min-w-0 border-b border-r border-[var(--qto-divider)] bg-[var(--qto-background)] px-4 py-3.5 last:border-r-0">
      <div className="flex items-center gap-2 text-sm text-[var(--qto-text-secondary)]">
        {Icon && <Icon className="size-4" strokeWidth={1.7} aria-hidden />}
        <span className="truncate">{label}</span>
      </div>
      <div
        className={cx(
          "mt-1 text-2xl font-semibold tabular-nums text-[var(--qto-text)]",
          tone === "danger" && "text-[var(--qto-danger)]"
        )}
      >
        {value}
      </div>
    </div>
  );
}

export function InlineNotice({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cx("qto-notice", className)} {...props} />;
}
