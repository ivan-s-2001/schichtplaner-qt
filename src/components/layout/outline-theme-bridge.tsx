"use client";

import { useEffect } from "react";

type OutlineThemePayload = {
  type: "outline:schedule-theme";
  background: string;
  foreground: string;
  secondaryText: string;
  border: string;
  accent: string;
  accentText: string;
  neutralBackground: string;
  neutralHoverBackground: string;
  danger: string;
  fontFamily: string;
  colorScheme: "light" | "dark";
};

function validCssValue(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function OutlineThemeBridge() {
  useEffect(() => {
    function applyTheme(event: MessageEvent<OutlineThemePayload>) {
      if (event.source !== window.parent || event.data?.type !== "outline:schedule-theme") {
        return;
      }

      const theme = event.data;
      const root = document.documentElement;
      const variables: Record<string, unknown> = {
        "--background": theme.background,
        "--foreground": theme.foreground,
        "--card": theme.background,
        "--card-foreground": theme.foreground,
        "--popover": theme.background,
        "--popover-foreground": theme.foreground,
        "--muted-foreground": theme.secondaryText,
        "--border": theme.border,
        "--input": theme.border,
        "--ring": theme.accent,
        "--primary": theme.accent,
        "--primary-foreground": theme.accentText,
        "--destructive": theme.danger,
        "--outline-host-neutral": theme.neutralBackground,
        "--outline-host-neutral-hover": theme.neutralHoverBackground,
        "--outline-font-sans": theme.fontFamily,
      };

      for (const [name, value] of Object.entries(variables)) {
        if (validCssValue(value)) root.style.setProperty(name, value);
      }

      root.dataset.outlineHostTheme = theme.colorScheme;
      root.style.colorScheme = theme.colorScheme;
    }

    window.addEventListener("message", applyTheme);
    if (window.parent !== window) {
      window.parent.postMessage({ type: "schedule:theme-ready" }, "*");
    }

    return () => window.removeEventListener("message", applyTheme);
  }, []);

  return null;
}
