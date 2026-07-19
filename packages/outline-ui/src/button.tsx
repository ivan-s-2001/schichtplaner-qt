"use client";

import * as React from "react";
import { Slot } from "radix-ui";
import { cx } from "./utils";

export type ButtonVariant = "default" | "neutral" | "ghost" | "danger";
export type ButtonSize = "default" | "compact" | "icon";

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

  return (
    <Component
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cx(
        "qto-button",
        variant === "neutral" && "qto-button--neutral",
        variant === "ghost" && "qto-button--ghost",
        variant === "danger" && "qto-button--danger",
        size === "compact" && "h-6 px-2 text-xs leading-6",
        size === "icon" && "qto-button--icon",
        className
      )}
      {...props}
    />
  );
}
