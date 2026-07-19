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

export type ButtonProps = React.ComponentProps<"button"> & {
  asChild?: boolean;
  variant?: ButtonVariant;
  size?: ButtonSize;
};

export function Button({
  asChild = false,
  variant = "default",
  size = "default",
  className,
  ...props
}: ButtonProps) {
  const Component = asChild ? Slot.Root : "button";
  const neutral = variant === "neutral" || variant === "outline";
  const secondary = variant === "secondary";
  const danger = variant === "danger" || variant === "destructive";

  return (
    <Component
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cx(
        "qto-button",
        neutral && "qto-button--neutral",
        secondary && "qto-button--secondary",
        variant === "ghost" && "qto-button--ghost",
        variant === "link" && "qto-button--link",
        danger && "qto-button--danger",
        (size === "compact" || size === "xs") && "qto-button--xs",
        size === "lg" && "qto-button--lg",
        (size === "icon" || size === "icon-sm") && "qto-button--icon",
        size === "icon-xs" && "qto-button--icon-xs",
        size === "icon-lg" && "qto-button--icon-lg",
        className
      )}
      {...props}
    />
  );
}
