import colors from "@/constants/colors";

type Palette = typeof colors.dark;

/**
 * Returns the design tokens for the active color scheme.
 *
 * Machinedog is intentionally always rendered against the deep "Cyber Husky"
 * dark palette to match the marketing site and the iconography (the
 * cybernetic husky portrait is unreadable on a light background). We
 * therefore ignore the system color scheme and always return the dark
 * tokens. `app.json` also pins `userInterfaceStyle: "dark"` for native.
 */
export function useColors() {
  const palette: Palette = colors.dark;
  return { ...palette, radius: colors.radius };
}
