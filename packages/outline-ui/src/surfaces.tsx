import * as React from "react";
import { Slot } from "radix-ui";
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
      className={cx("qto-card-action", className)}
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
  variant,
  className,
  asChild = false,
  ...props
}: React.ComponentProps<"span"> & {
  variant?: BadgeVariant | null;
  asChild?: boolean;
}) {
  const resolvedVariant = variant ?? "secondary";
  const Component = asChild ? Slot.Root : "span";

  return (
    <Component
      data-slot="badge"
      data-variant={resolvedVariant}
      className={cx(
        "qto-badge",
        resolvedVariant === "default" && "qto-badge--primary",
        resolvedVariant === "destructive" && "qto-badge--danger",
        resolvedVariant === "outline" && "qto-badge--outline",
        resolvedVariant === "ghost" && "qto-badge--ghost",
        resolvedVariant === "link" && "qto-badge--link",
        className
      )}
      {...props}
    />
  );
}
