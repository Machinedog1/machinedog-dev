/**
 * Machinedog mobile design tokens — Cyber Husky palette.
 *
 * Mirrors the sibling web artifact's index.css. Keep in sync if the web
 * palette changes.
 */

const colors = {
  light: {
    text: "#1B232F",
    tint: "#2EA8E8",

    background: "#F5F8FB",
    foreground: "#1B232F",

    card: "#FFFFFF",
    cardForeground: "#1B232F",
    cardBorder: "#DFE5EC",

    popover: "#FFFFFF",
    popoverForeground: "#1B232F",

    primary: "#2EA8E8",
    primaryBright: "#5DC4F7",
    accentViolet: "#9B7DFF",
    primaryForeground: "#FFFFFF",
    primarySoft: "rgba(46, 168, 232, 0.12)",

    secondary: "#E5E8EB",
    secondaryForeground: "#1B232F",

    muted: "#E5E8EB",
    mutedForeground: "#5C6878",

    accent: "#DFE5EC",
    accentForeground: "#1B232F",

    destructive: "#EF4444",
    destructiveForeground: "#FFFFFF",

    border: "#DFE5EC",
    input: "#EEF2F6",
    ring: "#2EA8E8",

    glassBackground: "rgba(255, 255, 255, 0.62)",
    glassBorder: "rgba(15, 23, 42, 0.07)",
    glassHighlight: "rgba(255, 255, 255, 0.55)",
    backdropPrimary: "#F5F8FB",
    backdropSecondary: "#E5EEF7",
    backdropAccent: "rgba(46, 168, 232, 0.10)",
    gridDot: "rgba(15, 23, 42, 0.06)",
    blurTint: "light" as const,
  },

  dark: {
    text: "#E2EAF2",
    tint: "#3FB8F0",

    background: "#040711",
    foreground: "#E2EAF2",

    card: "#0A101C",
    cardForeground: "#E2EAF2",
    cardBorder: "#1B2433",

    popover: "#0A101C",
    popoverForeground: "#E2EAF2",

    primary: "#3FB8F0",
    primaryBright: "#6FCBF7",
    accentViolet: "#A98EFF",
    primaryForeground: "#04111A",
    primarySoft: "rgba(63, 184, 240, 0.18)",

    secondary: "#16202E",
    secondaryForeground: "#E2EAF2",

    muted: "#16202E",
    mutedForeground: "#8FA0B6",

    accent: "#1B2433",
    accentForeground: "#EDF2F8",

    destructive: "#EF4444",
    destructiveForeground: "#FFFFFF",

    border: "#1B2433",
    input: "#0F1828",
    ring: "#3FB8F0",

    glassBackground: "rgba(255, 255, 255, 0.045)",
    glassBorder: "rgba(255, 255, 255, 0.08)",
    glassHighlight: "rgba(255, 255, 255, 0.06)",
    backdropPrimary: "#03060E",
    backdropSecondary: "#070D1A",
    backdropAccent: "rgba(63, 184, 240, 0.14)",
    gridDot: "rgba(120, 180, 230, 0.08)",
    blurTint: "dark" as const,
  },

  radius: 14,
};

export default colors;
