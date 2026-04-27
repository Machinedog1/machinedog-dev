import { LinearGradient } from "expo-linear-gradient";
import React from "react";
import { Dimensions, StyleSheet, View } from "react-native";
import Svg, { Defs, Pattern, Rect, Circle } from "react-native-svg";

import { useColors } from "@/hooks/useColors";

/**
 * Layered ambient backdrop inspired by the Replit IDE: a deep base color,
 * a subtle dot-grid overlay, and a soft amber radial gradient that hints
 * at the brand color without overwhelming.
 */
export function Backdrop() {
  const colors = useColors();
  const { width, height } = Dimensions.get("window");

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <View
        style={[
          StyleSheet.absoluteFill,
          { backgroundColor: colors.backdropPrimary },
        ]}
      />
      <LinearGradient
        colors={[colors.backdropPrimary, colors.backdropSecondary]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <Svg
        width={width}
        height={height}
        style={StyleSheet.absoluteFill}
        opacity={0.55}
      >
        <Defs>
          <Pattern
            id="grid"
            x="0"
            y="0"
            width="28"
            height="28"
            patternUnits="userSpaceOnUse"
          >
            <Circle cx="1" cy="1" r="1" fill={colors.gridDot} />
          </Pattern>
        </Defs>
        <Rect x="0" y="0" width={width} height={height} fill="url(#grid)" />
      </Svg>
      <View
        style={[
          styles.amberGlow,
          {
            backgroundColor: colors.backdropAccent,
            top: -height * 0.15,
            right: -width * 0.25,
            width: width * 0.9,
            height: width * 0.9,
            borderRadius: width * 0.45,
          },
        ]}
      />
      <View
        style={[
          styles.amberGlow,
          {
            backgroundColor: colors.backdropAccent,
            bottom: -height * 0.1,
            left: -width * 0.2,
            width: width * 0.7,
            height: width * 0.7,
            borderRadius: width * 0.35,
            opacity: 0.6,
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  amberGlow: {
    position: "absolute",
  },
});
