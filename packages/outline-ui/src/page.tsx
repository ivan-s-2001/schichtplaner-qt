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
      <div className="qto-page-main">
        <div className="qto-page-heading-row">
          {Icon && (
            <Icon
              className="qto-page-heading-icon"
              strokeWidth={1.7}
              aria-hidden
            />
          )}
          <h1 className="qto-page-title">{title}</h1>
        </div>
        {description && <div className="qto-page-description">{description}</div>}
      </div>
      {actions && <div className="qto-page-actions">{actions}</div>}
    </header>
  );
}

export function PageToolbar({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cx("qto-toolbar", className)} {...props} />;
}

export function DataPanel({ className, ...props }: React.ComponentProps<typeof Card>) {
  return <Card className={cx(className)} {...props} />;
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
    <Card
      className={cx(
        "qto-state",
        tone === "danger" && "qto-state--danger",
        className
      )}
    >
      {Icon && (
        <Icon
          className="qto-state-icon"
          strokeWidth={1.6}
          aria-hidden
        />
      )}
      <p className="qto-state-title">{title}</p>
      {description && <p className="qto-help">{description}</p>}
    </Card>
  );
}

export function MetricGrid({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cx("qto-metric-grid", className)} {...props} />;
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
    <div className="qto-metric-block">
      <div className="qto-metric-label">
        {Icon && (
          <Icon className="qto-metric-icon" strokeWidth={1.7} aria-hidden />
        )}
        <span>{label}</span>
      </div>
      <div
        className={cx(
          "qto-metric-value",
          tone === "danger" && "qto-metric-value--danger"
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
