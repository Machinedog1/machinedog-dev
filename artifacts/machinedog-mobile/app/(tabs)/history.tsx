import { Feather } from "@expo/vector-icons";
import { useListMyPrompts } from "@workspace/api-client-react";
import React from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

import { GlassCard } from "@/components/GlassCard";
import { Logo } from "@/components/Logo";
import { ScreenShell } from "@/components/ScreenShell";
import { useColors } from "@/hooks/useColors";
import { useResponsive } from "@/hooks/useResponsive";

function formatTokens(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function formatDate(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;
  return d.toLocaleDateString();
}

export default function HistoryScreen() {
  const colors = useColors();
  const r = useResponsive();
  const promptsQuery = useListMyPrompts({ limit: 50 });

  const items = promptsQuery.data?.data ?? [];

  return (
    <ScreenShell>
      <View style={styles.headerRow}>
        <Logo size="md" />
      </View>

      <GlassCard padding={r.isTablet ? 26 : 20}>
        <Text style={[styles.eyebrow, { color: colors.primary }]}>
          Prompt history
        </Text>
        <Text
          style={[
            styles.heading,
            { color: colors.foreground, fontSize: r.font(20, 22, 30) },
          ]}
        >
          Your recent conversations
        </Text>
        <Text style={[styles.subheading, { color: colors.mutedForeground }]}>
          Every prompt you&apos;ve run is stored privately to your workspace.
        </Text>
      </GlassCard>

      {promptsQuery.isLoading && (
        <GlassCard padding={28}>
          <ActivityIndicator color={colors.primary} />
        </GlassCard>
      )}

      {promptsQuery.isError && (
        <GlassCard padding={20}>
          <Text style={{ color: colors.destructive }}>
            Couldn&apos;t load history. Pull to retry.
          </Text>
        </GlassCard>
      )}

      {!promptsQuery.isLoading && items.length === 0 && (
        <GlassCard padding={28}>
          <View style={{ alignItems: "center", gap: 10 }}>
            <Feather name="message-circle" size={28} color={colors.mutedForeground} />
            <Text
              style={{
                color: colors.foreground,
                fontFamily: "Inter_600SemiBold",
                fontWeight: "600",
                fontSize: 16,
              }}
            >
              No prompts yet
            </Text>
            <Text
              style={{
                color: colors.mutedForeground,
                fontSize: 13,
                textAlign: "center",
                paddingHorizontal: 12,
              }}
            >
              Head to the Console tab to send your first prompt.
            </Text>
          </View>
        </GlassCard>
      )}

      {items.map((session) => (
        <GlassCard key={session.id} padding={18}>
          <View style={styles.metaRow}>
            <View
              style={[
                styles.modelPill,
                {
                  backgroundColor: colors.primarySoft,
                  borderColor: colors.primary + "33",
                },
              ]}
            >
              <Text style={{ color: colors.primary, fontSize: 11, fontFamily: "Inter_600SemiBold", fontWeight: "600" }}>
                {session.model}
              </Text>
            </View>
            <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>
              {formatDate(session.createdAt)} · {formatTokens(session.tokensUsed)} tokens
            </Text>
          </View>
          <Text
            numberOfLines={2}
            style={{
              color: colors.foreground,
              fontFamily: "Inter_600SemiBold",
              fontWeight: "600",
              fontSize: 15,
              marginTop: 10,
              lineHeight: 21,
            }}
          >
            {session.prompt}
          </Text>
          <Text
            numberOfLines={4}
            style={{
              color: colors.mutedForeground,
              fontSize: 14,
              marginTop: 8,
              lineHeight: 20,
            }}
          >
            {session.output}
          </Text>
        </GlassCard>
      ))}
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    paddingHorizontal: 4,
    marginTop: 4,
  },
  eyebrow: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 1.2,
  },
  heading: {
    fontSize: 22,
    fontFamily: "Inter_700Bold",
    fontWeight: "700",
    letterSpacing: -0.4,
    marginTop: 6,
  },
  subheading: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    lineHeight: 20,
    marginTop: 6,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  modelPill: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
  },
});
