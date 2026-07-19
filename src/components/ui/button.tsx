import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-md text-sm font-medium outline-none transition-[background-color,color,box-shadow,border-color,filter] duration-150 disabled:pointer-events-none disabled:opacity-60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default:
          "border border-transparent bg-primary text-primary-foreground shadow-[0_1px_2px_rgba(0,0,0,0.2)] hover:brightness-95",
        destructive:
          "border border-transparent bg-destructive text-white shadow-[0_1px_2px_rgba(0,0,0,0.16)] hover:brightness-95",
        outline:
          "border border-border bg-background text-foreground shadow-[0_1px_2px_rgba(0,0,0,0.07)] hover:bg-accent",
        secondary:
          "border border-transparent bg-secondary text-secondary-foreground shadow-none hover:bg-accent",
        ghost:
          "border border-transparent bg-transparent text-secondary-foreground shadow-none hover:bg-accent hover:text-accent-foreground",
        link: "h-auto rounded-none p-0 text-primary underline-offset-4 shadow-none hover:underline",
      },
      size: {
        default: "h-8 px-3 has-[>svg]:px-2.5",
        xs: "h-6 gap-1 px-2 text-xs has-[>svg]:px-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-8 px-3 has-[>svg]:px-2.5",
        lg: "h-9 px-4 has-[>svg]:px-3",
        icon: "size-8",
        "icon-xs": "size-6 [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-8",
        "icon-lg": "size-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
