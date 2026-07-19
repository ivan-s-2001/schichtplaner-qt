import * as React from "react";
import { cx } from "./utils";

export const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  function Input({ className, ...props }, ref) {
    return (
      <input
        ref={ref}
        data-slot="input"
        className={cx("qto-control", className)}
        {...props}
      />
    );
  }
);

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.ComponentProps<"textarea">
>(function Textarea({ className, ...props }, ref) {
  return (
    <textarea
      ref={ref}
      data-slot="textarea"
      className={cx("qto-control qto-control--textarea", className)}
      {...props}
    />
  );
});

export const NativeSelect = React.forwardRef<
  HTMLSelectElement,
  React.ComponentProps<"select">
>(function NativeSelect({ className, ...props }, ref) {
  return (
    <select
      ref={ref}
      data-slot="select"
      className={cx("qto-control qto-select-native", className)}
      {...props}
    />
  );
});

export function Field({
  label,
  description,
  error,
  children,
  className,
}: {
  label?: React.ReactNode;
  description?: React.ReactNode;
  error?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      {label && <div className="qto-label">{label}</div>}
      {children}
      {error ? (
        <div className="qto-error">{error}</div>
      ) : description ? (
        <div className="qto-help">{description}</div>
      ) : null}
    </div>
  );
}
