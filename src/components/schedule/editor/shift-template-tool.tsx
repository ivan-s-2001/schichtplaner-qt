"use client";

import type { ShiftTemplate } from "@/lib/schedule/shift-pool";
import { cn } from "@/lib/utils";

export function ShiftTemplateTool({
  template,
  selected = false,
  disabled = false,
  showDescription = false,
  onClick,
  className,
}: {
  template: ShiftTemplate;
  selected?: boolean;
  disabled?: boolean;
  showDescription?: boolean;
  onClick: () => void;
  className?: string;
}) {
  const borderColor =
    template.color.toUpperCase() === "#FFFFFF" ? "#94A3B8" : template.color;

  return (
    <button
      type="button"
      disabled={disabled}
      aria-pressed={selected}
      onClick={onClick}
      className={cn(
        "schedule-editor-tool min-h-14 min-w-32 rounded-md border px-3 py-2 text-left text-xs transition disabled:cursor-not-allowed disabled:opacity-50",
        selected
          ? "ring-2 ring-primary ring-offset-2 ring-offset-background"
          : "hover:brightness-[0.98]",
        className
      )}
      style={{
        backgroundColor: template.color,
        color: template.textColor,
        borderColor,
      }}
      title={template.description ?? `${template.name}: ${template.label}`}
    >
      <span className="block truncate font-semibold">{template.name}</span>
      <span className="mt-0.5 block font-medium opacity-85">{template.label}</span>
      {showDescription && template.description && (
        <span className="mt-1 block max-w-60 text-[11px] leading-snug opacity-80">
          {template.description}
        </span>
      )}
    </button>
  );
}
