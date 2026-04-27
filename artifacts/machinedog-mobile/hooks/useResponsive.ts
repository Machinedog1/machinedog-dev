import { useMemo } from "react";
import { useWindowDimensions } from "react-native";

export type Breakpoint = "compact" | "regular" | "medium" | "expanded";

export interface Responsive {
  width: number;
  height: number;
  breakpoint: Breakpoint;
  isCompact: boolean;
  isRegular: boolean;
  isMedium: boolean;
  isExpanded: boolean;
  isPhone: boolean;
  isTablet: boolean;
  isLandscape: boolean;
  containerMaxWidth: number | undefined;
  gutter: number;
  gap: number;
  columns: number;
  scale: (value: number) => number;
  font: (compact: number, regular: number, tablet?: number) => number;
  pick: <T>(values: { compact?: T; regular?: T; tablet?: T; default: T }) => T;
}

const BASE_WIDTH = 393;

export function useResponsive(): Responsive {
  const { width, height } = useWindowDimensions();

  return useMemo(() => {
    let breakpoint: Breakpoint;
    if (width < 360) breakpoint = "compact";
    else if (width < 720) breakpoint = "regular";
    else if (width < 1024) breakpoint = "medium";
    else breakpoint = "expanded";

    const isCompact = breakpoint === "compact";
    const isRegular = breakpoint === "regular";
    const isMedium = breakpoint === "medium";
    const isExpanded = breakpoint === "expanded";
    const isPhone = isCompact || isRegular;
    const isTablet = isMedium || isExpanded;

    const containerMaxWidth = isExpanded ? 880 : isMedium ? 720 : undefined;

    const gutter = isExpanded ? 48 : isMedium ? 32 : isCompact ? 14 : 18;
    const gap = isTablet ? 22 : isCompact ? 14 : 18;
    const columns = isTablet ? 2 : 1;

    const scaleFactor = Math.min(width / BASE_WIDTH, 1.35);
    const scale = (value: number) =>
      Math.round(value * (isCompact ? 0.92 : scaleFactor));

    const font = (compact: number, regular: number, tablet?: number) => {
      if (isCompact) return compact;
      if (isTablet) return tablet ?? Math.round(regular * 1.15);
      return regular;
    };

    const pick = <T,>(values: {
      compact?: T;
      regular?: T;
      tablet?: T;
      default: T;
    }): T => {
      if (isCompact && values.compact !== undefined) return values.compact;
      if (isTablet && values.tablet !== undefined) return values.tablet;
      if (isRegular && values.regular !== undefined) return values.regular;
      return values.default;
    };

    return {
      width,
      height,
      breakpoint,
      isCompact,
      isRegular,
      isMedium,
      isExpanded,
      isPhone,
      isTablet,
      isLandscape: width > height,
      containerMaxWidth,
      gutter,
      gap,
      columns,
      scale,
      font,
      pick,
    };
  }, [width, height]);
}
