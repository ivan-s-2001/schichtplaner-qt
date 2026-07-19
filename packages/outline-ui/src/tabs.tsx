"use client";

import * as React from "react";
import { Slot } from "radix-ui";
import { cx } from "./utils";

export function Tabs({ className, ...props }: React.ComponentProps<"nav">) {
  return <nav data-slot="tabs" className={cx("qto-tabs", className)} {...props} />;
}

export function Tab({
  active = false,
  asChild = false,
  className,
  ...props
}: React.ComponentProps<"button"> & {
  active?: boolean;
  asChild?: boolean;
}) {
  const Component = asChild ? Slot.Root : "button";

  return (
    <Component
      data-slot="tab"
      aria-selected={active || undefined}
      aria-current={active ? "page" : undefined}
      className={cx("qto-tab", className)}
      {...props}
    />
  );
}
