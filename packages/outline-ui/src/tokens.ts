export const outlineLightTokens = {
  colorScheme: "light",
  background: "#ffffff",
  backgroundSecondary: "hsl(212 31% 95% / 1)",
  backgroundTertiary: "#d7e0ea",
  foreground: "#111319",
  textSecondary: "#394351",
  textTertiary: "#66778f",
  placeholder: "#a2b2c3",
  accent: "#0366d6",
  accentText: "#ffffff",
  divider: "#dae1e9",
  inputBorder: "#dae1e9",
  inputBorderFocused: "#66778f",
  inputBackground: "hsl(212 31% 95% / 1)",
  neutralBackground: "#ffffff",
  neutralHoverBackground: "hsl(212 31% 95% / 1)",
  neutralText: "#111319",
  neutralBorder: "hsl(212 31% 88% / 1)",
  danger: "#ed2651",
  warning: "#f08a24",
  success: "#3ad984",
  modalBackdrop: "rgba(0, 0, 0, 0.25)",
  modalBackground: "#ffffff",
  menuBackground: "#ffffff",
} as const;

export const outlineDarkTokens = {
  colorScheme: "dark",
  background: "#111319",
  backgroundSecondary: "#1f232e",
  backgroundTertiary: "#2a2f3e",
  foreground: "#e6e6e6",
  textSecondary: "#8291a6",
  textTertiary: "#66778f",
  placeholder: "hsl(215 17% 30% / 1)",
  accent: "#137ffb",
  accentText: "#ffffff",
  divider: "#262a37",
  inputBorder: "#394351",
  inputBorderFocused: "#66778f",
  inputBackground: "#262d36",
  neutralBackground: "#111319",
  neutralHoverBackground: "#1a1e28",
  neutralText: "#ffffff",
  neutralBorder: "#394351",
  danger: "#ed2651",
  warning: "#f08a24",
  success: "#3ad984",
  modalBackdrop: "rgba(0, 0, 0, 0.5)",
  modalBackground: "#181c25",
  menuBackground: "#181c25",
} as const;

export type OutlineThemeTokens = typeof outlineLightTokens | typeof outlineDarkTokens;

export const outlineTypography = {
  fontFamily:
    "-apple-system, BlinkMacSystemFont, Inter, 'Segoe UI', Roboto, Oxygen, sans-serif",
  monoFamily:
    "'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, Courier, monospace",
  regular: 400,
  medium: 500,
  bold: 600,
} as const;

export const outlineGeometry = {
  controlHeight: 32,
  controlRadius: 6,
  fieldRadius: 4,
  menuRadius: 8,
  modalRadius: 8,
  compactGap: 4,
  regularGap: 8,
  sectionGap: 16,
} as const;
