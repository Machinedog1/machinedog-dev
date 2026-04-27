import { useColorScheme } from "react-native";

import colors from "@/constants/colors";

type Palette = typeof colors.light | typeof colors.dark;

/**
 * Returns the design tokens for the current color scheme.
 *
 * The returned object contains all color tokens for the active palette
 * plus scheme-independent values like `radius`.
 */
export function useColors() {
  const scheme = useColorScheme();
  const palette: Palette = scheme === "dark" ? colors.dark : colors.light;
  return { ...palette, radius: colors.radius };
}
