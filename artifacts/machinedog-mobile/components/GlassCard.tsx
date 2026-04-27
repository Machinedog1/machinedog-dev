import { BlurView } from "expo-blur";
import React from "react";
import { Platform, StyleSheet, View, ViewProps, ViewStyle } from "react-native";

import { useColors } from "@/hooks/useColors";

interface GlassCardProps extends ViewProps {
  intensity?: number;
  padding?: number;
  radius?: number;
  bordered?: boolean;
  children?: React.ReactNode;
  style?: ViewStyle | ViewStyle[];
}

/**
 * Apple-Glass / Liquid-Glass surface used across the app. On native it uses a
 * BlurView with a translucent fill + inset highlight; on web it falls back to
 * a frosted background since BlurView's web shim renders solid.
 */
export function GlassCard({
  intensity = 60,
  padding = 18,
  radius,
  bordered = true,
  children,
  style,
  ...rest
}: GlassCardProps) {
  const colors = useColors();
  const cornerRadius = radius ?? colors.radius + 4;
  const userStyle = Array.isArray(style) ? style : style ? [style] : [];

  const containerStyle: ViewStyle = {
    borderRadius: cornerRadius,
    overflow: "hidden",
    backgroundColor: colors.glassBackground,
    borderWidth: bordered ? StyleSheet.hairlineWidth : 0,
    borderColor: colors.glassBorder,
    padding,
    ...(Platform.OS === "ios"
      ? {
          shadowColor: "#000",
          shadowOpacity: (colors.blurTint as string) === "dark" ? 0.4 : 0.08,
          shadowRadius: 16,
          shadowOffset: { width: 0, height: 6 },
        }
      : {
          elevation: 4,
        }),
  };

  return (
    <View style={[containerStyle, ...userStyle]} {...rest}>
      {Platform.OS !== "web" && (
        <BlurView
          intensity={intensity}
          tint={colors.blurTint}
          style={StyleSheet.absoluteFill}
        />
      )}
      <View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFillObject,
          {
            borderTopWidth: 1,
            borderTopColor: colors.glassHighlight,
            borderRadius: cornerRadius,
          },
        ]}
      />
      <View style={styles.content}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    position: "relative",
    zIndex: 1,
  },
});
