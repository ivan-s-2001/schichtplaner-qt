import * as React from "react";

import { cn } from "@/lib/utils";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "h-8 w-full min-w-0 rounded-sm border border-[var(--outline-input-border)] bg-background px-3 py-1 text-[15px] text-foreground shadow-none outline-none transition-colors duration-100 placeholder:text-[var(--outline-placeholder)] selection:bg-primary/15 selection:text-foreground file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
        "focus-visible:border-[var(--outline-input-border-focused)] focus-visible:ring-0",
        "aria-invalid:border-destructive aria-invalid:ring-0",
        className
      )}
      {...props}
    />
  );
}

export { Input };
