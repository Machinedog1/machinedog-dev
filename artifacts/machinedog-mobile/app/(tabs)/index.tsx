import { useAuth } from "@clerk/expo";
import { Feather } from "@expo/vector-icons";
import {
  getListMyPromptsQueryKey,
  useGetMe,
  useSubmitPrompt,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import React from "react";
import {
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { GlassCard } from "@/components/GlassCard";
import { Logo } from "@/components/Logo";
import { PrimaryButton } from "@/components/PrimaryButton";
import { ScreenShell } from "@/components/ScreenShell";
import { useColors } from "@/hooks/useColors";
import { useResponsive } from "@/hooks/useResponsive";

function formatTokens(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

export default function ConsoleScreen() {
  const colors = useColors();
  const r = useResponsive();
  const { isSignedIn } = useAuth();
  const queryClient = useQueryClient();
  const meQuery = useGetMe({
    query: { enabled: !!isSignedIn, queryKey: ["me"] },
  });
  const me = meQuery.data;

  const [prompt, setPrompt] = React.useState("");
  const [response, setResponse] = React.useState<string | null>(null);
  const [usedTokens, setUsedTokens] = React.useState<number | null>(null);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);

  const submit = useSubmitPrompt({
    mutation: {
      onSuccess: (data) => {
        setResponse(data.output);
        setUsedTokens(data.tokensUsed);
        setErrorMessage(null);
        meQuery.refetch();
        queryClient.invalidateQueries({ queryKey: getListMyPromptsQueryKey() });
      },
      onError: (error: unknown) => {
        const message =
          (error as { response?: { data?: { error?: string } } })?.response
            ?.data?.error ??
          (error as Error)?.message ??
          "Something went wrong while reaching Claude.";
        setErrorMessage(message);
        setResponse(null);
      },
    },
  });

  const handleSubmit = () => {
    const trimmed = prompt.trim();
    if (!trimmed || submit.isPending) return;
    setErrorMessage(null);
    submit.mutate({ data: { prompt: trimmed } });
  };

  const balance = me?.tokenBalance ?? 0;
  const usedTotal = me?.totalTokensUsed ?? 0;
  const balanceLow = balance < 10_000;

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScreenShell>
        <View style={styles.headerRow}>
          <Logo size="md" />
          <View
            style={[
              styles.balancePill,
              {
                backgroundColor: balanceLow
                  ? colors.destructive + "22"
                  : colors.primarySoft,
                borderColor: balanceLow
                  ? colors.destructive + "55"
                  : colors.primary + "44",
              },
            ]}
          >
            <Feather
              name="zap"
              size={12}
              color={balanceLow ? colors.destructive : colors.primary}
            />
            <Text
              style={{
                color: balanceLow ? colors.destructive : colors.primary,
                fontFamily: "Inter_600SemiBold",
                fontWeight: "600",
                fontSize: 12,
              }}
            >
              {formatTokens(balance)} tokens
            </Text>
          </View>
        </View>

        <GlassCard padding={r.isTablet ? 28 : r.isCompact ? 16 : 20}>
          <Text style={[styles.eyebrow, { color: colors.primary }]}>
            Prompt console
          </Text>
          <Text
            style={[
              styles.heading,
              { color: colors.foreground, fontSize: r.font(20, 22, 30) },
            ]}
          >
            What should Claude do today?
          </Text>
          <Text style={[styles.subheading, { color: colors.mutedForeground }]}>
            Each request is metered against your token bundle. Be specific —
            shorter prompts return faster.
          </Text>

          <TextInput
            value={prompt}
            onChangeText={setPrompt}
            placeholder="e.g. Draft a launch announcement for our enterprise plan…"
            placeholderTextColor={colors.mutedForeground}
            multiline
            textAlignVertical="top"
            style={[
              styles.promptInput,
              {
                backgroundColor: colors.input,
                color: colors.foreground,
                borderColor: colors.cardBorder,
                borderRadius: colors.radius,
                minHeight: r.isTablet ? 180 : r.isCompact ? 96 : 120,
                fontSize: r.font(14, 15, 16),
              },
            ]}
          />

          <View style={styles.actionRow}>
            <Text
              numberOfLines={1}
              style={{
                color: colors.mutedForeground,
                fontSize: 12,
                flexShrink: 1,
                flexBasis: "auto",
                minWidth: 0,
              }}
            >
              Powered by Machinedog.ai
            </Text>
            <View style={{ flexShrink: 0 }}>
              <PrimaryButton
                title={submit.isPending ? "Thinking…" : "Send"}
                size="md"
                loading={submit.isPending}
                disabled={!prompt.trim() || balance <= 0}
                onPress={handleSubmit}
              />
            </View>
          </View>

          {balance <= 0 && (
            <Text
              style={[styles.warning, { color: colors.destructive }]}
            >
              You&apos;re out of tokens. Top up from the Tokens tab to keep
              prompting.
            </Text>
          )}

          {errorMessage && (
            <Text
              style={[styles.warning, { color: colors.destructive }]}
            >
              {errorMessage}
            </Text>
          )}
        </GlassCard>

        {response && (
          <GlassCard padding={20}>
            <View style={styles.responseHeader}>
              <Text style={[styles.eyebrow, { color: colors.primary }]}>
                Latest response
              </Text>
              {usedTokens !== null && (
                <Text
                  style={{
                    color: colors.mutedForeground,
                    fontSize: 12,
                    fontFamily: "Inter_500Medium",
                  }}
                >
                  {formatTokens(usedTokens)} tokens used
                </Text>
              )}
            </View>
            <Text
              style={{
                color: colors.foreground,
                fontFamily: "Inter_400Regular",
                fontSize: 15,
                lineHeight: 22,
                marginTop: 8,
              }}
            >
              {response}
            </Text>
          </GlassCard>
        )}

        <GlassCard padding={r.isTablet ? 24 : 18}>
          <Text style={[styles.eyebrow, { color: colors.primary }]}>
            Workspace usage
          </Text>
          <View style={styles.statsRow}>
            <View style={styles.stat}>
              <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>
                Available
              </Text>
              <Text
                style={[
                  styles.statValue,
                  { color: colors.foreground, fontSize: r.font(20, 22, 28) },
                ]}
              >
                {formatTokens(balance)}
              </Text>
            </View>
            <View
              style={[styles.divider, { backgroundColor: colors.cardBorder }]}
            />
            <View style={styles.stat}>
              <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>
                Used to date
              </Text>
              <Text
                style={[
                  styles.statValue,
                  { color: colors.foreground, fontSize: r.font(20, 22, 28) },
                ]}
              >
                {formatTokens(usedTotal)}
              </Text>
            </View>
          </View>
        </GlassCard>
      </ScreenShell>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 4,
    marginTop: 4,
  },
  balancePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
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
    marginBottom: 14,
  },
  promptInput: {
    minHeight: 120,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontFamily: "Inter_400Regular",
    fontSize: 15,
    lineHeight: 21,
  },
  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 14,
    gap: 12,
  },
  warning: {
    marginTop: 12,
    fontSize: 13,
    fontFamily: "Inter_500Medium",
  },
  responseHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  statsRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 12,
    gap: 16,
  },
  stat: {
    flex: 1,
  },
  statLabel: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    fontWeight: "500",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  statValue: {
    fontSize: 22,
    fontFamily: "Inter_700Bold",
    fontWeight: "700",
    marginTop: 4,
  },
  divider: {
    width: 1,
    alignSelf: "stretch",
  },
});
