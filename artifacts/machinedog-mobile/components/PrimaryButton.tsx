import { LinearGradient } from "expo-linear-gradient";
import React from "react";
import {
  ActivityIndicator,
  Pressable,
  PressableProps,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from "react-native";

import { useColors } from "@/hooks/useColors";

interface PrimaryButtonProps extends Omit<PressableProps, "children" | "style"> {
  title: string;
  loading?: boolean;
  variant?: "primary" | "secondary" | "ghost";
  fullWidth?: boolean;
  size?: "md" | "lg";
  style?: ViewStyle;
  rightIcon?: React.ReactNode;
}

export function PrimaryButton({
  title,
  loading,
  variant = "primary",
  fullWidth,
  size = "md",
  disabled,
  style,
  rightIcon,
  ...rest
}: PrimaryButtonProps) {
  const colors = useColors();
  const padV = size === "lg" ? 16 : 12;
  const padH = size === "lg" ? 22 : 18;
  const fontSize = size === "lg" ? 16 : 15;

  const isPrimary = variant === "primary";
  const isSecondary = variant === "secondary";

  return (
    <Pressable
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.base,
        {
          opacity: disabled ? 0.5 : pressed ? 0.85 : 1,
          width: fullWidth ? "100%" : undefined,
          borderRadius: colors.radius,
        },
        isSecondary && {
          backgroundColor: colors.secondary,
          borderWidth: 1,
          borderColor: colors.cardBorder,
        },
        variant === "ghost" && {
          backgroundColor: "transparent",
        },
        style,
      ]}
      {...rest}
    >
      {isPrimary && (
        <LinearGradient
          colors={[
            colors.primaryBright ?? colors.primary,
            colors.primary,
            colors.accentViolet ?? colors.primary,
          ]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[StyleSheet.absoluteFill, { borderRadius: colors.radius }]}
        />
      )}
      <View
        style={[
          styles.content,
          { paddingVertical: padV, paddingHorizontal: padH },
        ]}
      >
        {loading ? (
          <ActivityIndicator
            color={
              isPrimary ? colors.primaryForeground : colors.foreground
            }
          />
        ) : (
          <>
            <Text
              style={{
                color: isPrimary
                  ? colors.primaryForeground
                  : variant === "ghost"
                    ? colors.primary
                    : colors.foreground,
                fontFamily: "Inter_600SemiBold",
                fontWeight: "600",
                fontSize,
                letterSpacing: -0.1,
              }}
            >
              {title}
            </Text>
            {rightIcon}
          </>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  content: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
});
