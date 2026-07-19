"use client";

import { useEffect } from "react";

type OutlineThemePayload = {
  type: "outline:schedule-theme";
  background: string;
  backgroundSecondary: string;
  foreground: string;
  secondaryText: string;
  tertiaryText: string;
  placeholder: string;
  divider: string;
  inputBorder: string;
  inputBorderFocused: string;
  accent: string;
  accentText: string;
  neutralBackground: string;
  neutralHoverBackground: string;
  neutralText: string;
  neutralBorder: string;
  danger: string;
  modalBackground: string;
  modalBackdrop: string;
  modalShadow: string;
  menuBackground: string;
  menuShadow: string;
  controlHoverBackground: string;
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
        "--popover": theme.menuBackground,
        "--popover-foreground": theme.foreground,
        "--secondary": theme.neutralBackground,
        "--secondary-foreground": theme.neutralText,
        "--muted": theme.backgroundSecondary,
        "--muted-foreground": theme.secondaryText,
        "--accent": theme.neutralHoverBackground,
        "--accent-foreground": theme.foreground,
        "--border": theme.divider,
        "--input": theme.inputBorder,
        "--ring": theme.inputBorderFocused,
        "--primary": theme.accent,
        "--primary-foreground": theme.accentText,
        "--destructive": theme.danger,
        "--outline-background-secondary": theme.backgroundSecondary,
        "--outline-text-secondary": theme.secondaryText,
        "--outline-text-tertiary": theme.tertiaryText,
        "--outline-placeholder": theme.placeholder,
        "--outline-divider": theme.divider,
        "--outline-input-border": theme.inputBorder,
        "--outline-input-border-focused": theme.inputBorderFocused,
        "--outline-button-neutral-background": theme.neutralBackground,
        "--outline-button-neutral-hover": theme.neutralHoverBackground,
        "--outline-button-neutral-text": theme.neutralText,
        "--outline-button-neutral-border": theme.neutralBorder,
        "--outline-modal-background": theme.modalBackground,
        "--outline-modal-backdrop": theme.modalBackdrop,
        "--outline-modal-shadow": theme.modalShadow,
        "--outline-menu-background": theme.menuBackground,
        "--outline-menu-shadow": theme.menuShadow,
        "--outline-control-hover": theme.controlHoverBackground,
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
