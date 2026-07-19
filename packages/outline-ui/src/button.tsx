"use client";

import * as React from "react";
import { Slot } from "radix-ui";
import { cx } from "./utils";

export type ButtonVariant =
  | "default"
  | "neutral"
  | "outline"
  | "secondary"
  | "ghost"
  | "link"
  | "danger"
  | "destructive";

export type ButtonSize =
  | "default"
  | "compact"
  | "xs"
  | "sm"
  | "lg"
  | "icon"
  | "icon-xs"
  | "icon-sm"
  | "icon-lg";

export type ButtonVariantOptions = {
  variant?: ButtonVariant | null;
  size?: ButtonSize | null;
  className?: string;
};

export function buttonVariants({
  variant,
  size,
  className,
}: ButtonVariantOptions = {}) {
  const resolvedVariant = variant ?? "default";
  const resolvedSize = size ?? "default";
  const neutral = resolvedVariant === "neutral" || resolvedVariant === "outline";
  const secondary = resolvedVariant === "secondary";
  const danger = resolvedVariant === "danger" || resolvedVariant === "destructive";

  return cx(
    "qto-button",
    neutral && "qto-button--neutral",
    secondary && "qto-button--secondary",
    resolvedVariant === "ghost" && "qto-button--ghost",
    resolvedVariant === "link" && "qto-button--link",
    danger && "qto-button--danger",
    (resolvedSize === "compact" || resolvedSize === "xs") && "qto-button--xs",
    resolvedSize === "lg" && "qto-button--lg",
    (resolvedSize === "icon" || resolvedSize === "icon-sm") && "qto-button--icon",
    resolvedSize === "icon-xs" && "qto-button--icon-xs",
    resolvedSize === "icon-lg" && "qto-button--icon-lg",
    className
  );
}

export type ButtonProps = React.ComponentProps<"button"> & {
  asChild?: boolean;
  variant?: ButtonVariant | null;
  size?: ButtonSize | null;
};

export function Button({
  asChild = false,
  variant,
  size,
  className,
  ...props
}: ButtonProps) {
  const resolvedVariant = variant ?? "default";
  const resolvedSize = size ?? "default";
  const Component = asChild ? Slot.Root : "button";

  return (
    <Component
      data-slot="button"
      data-variant={resolvedVariant}
      data-size={resolvedSize}
      className={buttonVariants({
        variant: resolvedVariant,
        size: resolvedSize,
        className,
      })}
      {...props}
    />
  );
}
