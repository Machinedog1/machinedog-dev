import React from "react";
import {
  ScrollView,
  ScrollViewProps,
  StyleSheet,
  View,
  ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Backdrop } from "@/components/Backdrop";
import { useResponsive } from "@/hooks/useResponsive";

interface ScreenShellProps {
  children: React.ReactNode;
  scroll?: boolean;
  contentStyle?: ViewStyle;
  scrollViewProps?: ScrollViewProps;
  bottomInset?: number;
}

export function ScreenShell({
  children,
  scroll = true,
  contentStyle,
  scrollViewProps,
  bottomInset,
}: ScreenShellProps) {
  const insets = useSafeAreaInsets();
  const r = useResponsive();
  const paddingTop = insets.top + (r.isCompact ? 8 : 12);
  const baseBottom =
    bottomInset ?? (r.isTablet ? 140 : r.isCompact ? 96 : 120);
  const resolvedBottomInset = baseBottom + insets.bottom;

  const inner = (
    <View
      style={[
        styles.content,
        {
          paddingTop,
          paddingBottom: resolvedBottomInset,
          paddingHorizontal: r.gutter,
          gap: r.gap,
          maxWidth: r.containerMaxWidth,
          alignSelf: "center",
          width: "100%",
        },
        contentStyle,
      ]}
    >
      {children}
    </View>
  );

  return (
    <View style={styles.root}>
      <Backdrop />
      {scroll ? (
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          {...scrollViewProps}
        >
          {inner}
        </ScrollView>
      ) : (
        inner
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },
  content: {
    flex: 0,
  },
});
