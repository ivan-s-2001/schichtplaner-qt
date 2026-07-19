import * as React from "react";
import { cx } from "./utils";

export function Card({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="card" className={cx("qto-card", className)} {...props} />;
}

export function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="card-header" className={cx("qto-card-header", className)} {...props} />;
}

export function CardTitle({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="card-title" className={cx("qto-card-title", className)} {...props} />;
}

export function CardDescription({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-description"
      className={cx("qto-card-description", className)}
      {...props}
    />
  );
}

export function CardAction({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-action"
      className={cx("col-start-2 row-span-2 row-start-1 self-start justify-self-end", className)}
      {...props}
    />
  );
}

export function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="card-content" className={cx("qto-card-content", className)} {...props} />;
}

export function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="card-footer" className={cx("qto-card-footer", className)} {...props} />;
}

export type BadgeVariant =
  | "default"
  | "secondary"
  | "destructive"
  | "outline"
  | "ghost"
  | "link";

export function Badge({
  variant = "secondary",
  className,
  ...props
}: React.ComponentProps<"span"> & { variant?: BadgeVariant; asChild?: boolean }) {
  return (
    <span
      data-slot="badge"
      data-variant={variant}
      className={cx(
        "qto-badge",
        variant === "default" && "border-transparent bg-[var(--qto-accent)] text-[var(--qto-accent-text)]",
        variant === "destructive" && "border-transparent bg-[var(--qto-danger)] text-white",
        variant === "outline" && "bg-[var(--qto-background)]",
        variant === "ghost" && "border-transparent bg-transparent",
        variant === "link" && "border-transparent bg-transparent text-[var(--qto-accent)] underline-offset-4 hover:underline",
        className
      )}
      {...props}
    />
  );
}
