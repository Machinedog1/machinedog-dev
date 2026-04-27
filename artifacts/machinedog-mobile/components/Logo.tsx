import React from "react";
import { Image, StyleSheet, Text, View } from "react-native";

import { useColors } from "@/hooks/useColors";

interface LogoProps {
  size?: "sm" | "md" | "lg";
  showWordmark?: boolean;
}

const huskyImg = require("@/assets/images/husky.png");

export function Logo({ size = "md", showWordmark = true }: LogoProps) {
  const colors = useColors();
  const dim = size === "sm" ? 32 : size === "lg" ? 56 : 40;
  const fontSize = size === "sm" ? 14 : size === "lg" ? 22 : 16;

  return (
    <View style={styles.container}>
      <View
        style={[
          styles.markRing,
          {
            width: dim + 4,
            height: dim + 4,
            borderRadius: (dim + 4) / 2,
            borderColor: colors.primary,
            shadowColor: colors.primary,
          },
        ]}
      >
        <View
          style={{
            width: dim,
            height: dim,
            borderRadius: dim / 2,
            overflow: "hidden",
          }}
        >
          <Image
            source={huskyImg}
            resizeMode="cover"
            style={{
              width: dim * 1.8,
              height: dim * 1.8,
              marginLeft: -dim * 0.4,
              marginTop: -dim * 0.55,
            }}
          />
        </View>
      </View>
      {showWordmark && (
        <Text
          style={[
            styles.wordmark,
            {
              color: colors.foreground,
              fontSize,
              letterSpacing: 1.6,
            },
          ]}
        >
          MACHINEDOG.DEV
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  markRing: {
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    borderWidth: 2,
    shadowOpacity: 0.55,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 0 },
  },
  wordmark: {
    fontFamily: "Inter_700Bold",
    fontWeight: "800",
  },
});
