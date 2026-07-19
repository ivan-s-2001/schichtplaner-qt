import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex shrink-0 select-none items-center justify-center gap-1 whitespace-nowrap rounded-md text-sm font-medium outline-none transition-[background-color,color,box-shadow] duration-200 disabled:pointer-events-none disabled:cursor-default disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default:
          "border-0 bg-primary text-primary-foreground shadow-[0_1px_2px_rgba(0,0,0,0.2)] hover:brightness-95",
        destructive:
          "border-0 bg-destructive text-white shadow-[0_1px_2px_rgba(0,0,0,0.2)] hover:brightness-95",
        outline:
          "border-0 bg-[var(--outline-button-neutral-background)] text-[var(--outline-button-neutral-text)] shadow-[0_1px_2px_rgba(0,0,0,0.07),inset_0_0_0_1px_var(--outline-button-neutral-border)] hover:bg-[var(--outline-button-neutral-hover)]",
        secondary:
          "border-0 bg-transparent text-[var(--outline-button-neutral-text)] shadow-none hover:bg-[var(--outline-control-hover)]",
        ghost:
          "border-0 bg-transparent text-[var(--outline-button-neutral-text)] shadow-none hover:bg-[var(--outline-control-hover)]",
        link:
          "h-auto rounded-none border-0 bg-transparent p-0 text-primary shadow-none underline-offset-4 hover:underline",
      },
      size: {
        default: "h-8 px-2 has-[>svg]:pl-1 has-[>svg]:pr-2",
        xs: "h-6 gap-0.5 px-1.5 text-xs [&_svg:not([class*='size-'])]:size-3",
        sm: "h-8 px-2 has-[>svg]:pl-1 has-[>svg]:pr-2",
        lg: "h-9 px-3 has-[>svg]:pl-2 has-[>svg]:pr-3",
        icon: "size-8 px-0",
        "icon-xs": "size-6 px-0 [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-8 px-0",
        "icon-lg": "size-9 px-0",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  }) {
  const Comp = asChild ? Slot.Root : "button";

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
