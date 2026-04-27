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
  bottomInset = 120,
}: ScreenShellProps) {
  const insets = useSafeAreaInsets();
  const paddingTop = insets.top + 12;

  const inner = (
    <View
      style={[
        styles.content,
        { paddingTop, paddingBottom: bottomInset },
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
    paddingHorizontal: 18,
    gap: 18,
  },
});
