import { Feather } from "@expo/vector-icons";
import {
  TokenBundle,
  useCreateTokenCheckout,
  useGetMe,
  useListMyTokenPurchases,
  useListTokenBundles,
} from "@workspace/api-client-react";
import * as WebBrowser from "expo-web-browser";
import React from "react";
import {
  ActivityIndicator,
  Linking,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { GlassCard } from "@/components/GlassCard";
import { Logo } from "@/components/Logo";
import { PrimaryButton } from "@/components/PrimaryButton";
import { ScreenShell } from "@/components/ScreenShell";
import { useColors } from "@/hooks/useColors";
import { useResponsive } from "@/hooks/useResponsive";

function formatTokens(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toLocaleString(undefined, { maximumFractionDigits: 1 })}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
}

function formatPrice(usd: number) {
  return `$${usd.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function BundleCard({
  bundle,
  onSelect,
  pendingKey,
  noMargin,
}: {
  bundle: TokenBundle;
  onSelect: (b: TokenBundle) => void;
  pendingKey: string | null;
  noMargin?: boolean;
}) {
  const colors = useColors();
  const isPending = pendingKey === bundle.key;
  const perDollar = bundle.tokens / bundle.priceUsd;

  return (
    <GlassCard
      padding={18}
      style={noMargin ? undefined : styles.bundleCard}
    >
      <View style={styles.bundleHeader}>
        <View>
          <Text style={[styles.bundleName, { color: colors.foreground }]}>
            {bundle.name}
          </Text>
          <Text
            style={{
              color: colors.mutedForeground,
              fontSize: 12,
              fontFamily: "Inter_500Medium",
              marginTop: 2,
            }}
          >
            {formatTokens(Math.round(perDollar))} tokens / $
          </Text>
        </View>
        {bundle.popular && (
          <View
            style={[
              styles.popularPill,
              {
                backgroundColor: colors.primary,
              },
            ]}
          >
            <Text
              style={{
                color: colors.primaryForeground,
                fontSize: 10,
                fontFamily: "Inter_700Bold",
                fontWeight: "700",
                letterSpacing: 0.6,
              }}
            >
              POPULAR
            </Text>
          </View>
        )}
      </View>

      <View style={styles.priceRow}>
        <Text style={[styles.priceValue, { color: colors.primary }]}>
          {formatPrice(bundle.priceUsd)}
        </Text>
        <Text
          style={{
            color: colors.mutedForeground,
            fontSize: 14,
            fontFamily: "Inter_500Medium",
          }}
        >
          {formatTokens(bundle.tokens)} tokens
        </Text>
      </View>

      <PrimaryButton
        title={isPending ? "Opening checkout…" : "Buy bundle"}
        onPress={() => onSelect(bundle)}
        loading={isPending}
        disabled={!bundle.stripePriceId}
        fullWidth
      />
      {!bundle.stripePriceId && (
        <Text
          style={{
            color: colors.mutedForeground,
            fontSize: 11,
            marginTop: 8,
            textAlign: "center",
          }}
        >
          Stripe price not yet linked. Contact your account team.
        </Text>
      )}
    </GlassCard>
  );
}

export default function TokensScreen() {
  const colors = useColors();
  const r = useResponsive();
  const meQuery = useGetMe();
  const bundlesQuery = useListTokenBundles();
  const purchasesQuery = useListMyTokenPurchases();
  const checkout = useCreateTokenCheckout();
  const [pendingKey, setPendingKey] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const balance = meQuery.data?.tokenBalance ?? 0;

  const handleSelect = async (bundle: TokenBundle) => {
    if (!bundle.stripePriceId) return;
    setError(null);
    setPendingKey(bundle.key);
    try {
      const result = await checkout.mutateAsync({
        data: { bundleKey: bundle.key },
      });
      if (result?.url) {
        const opened = await WebBrowser.openBrowserAsync(result.url);
        if (opened.type === "cancel" || opened.type === "dismiss") {
          meQuery.refetch();
          purchasesQuery.refetch();
        }
      }
    } catch (e: unknown) {
      const message =
        (e as { response?: { data?: { error?: string } } })?.response?.data
          ?.error ??
        (e as Error)?.message ??
        "Checkout could not be created. Try again later.";
      setError(message);
      try {
        await Linking.openURL("mailto:billing@machinedog.ai");
      } catch {}
    } finally {
      setPendingKey(null);
    }
  };

  const bundles = bundlesQuery.data?.data ?? [];
  const purchases = purchasesQuery.data?.data ?? [];

  return (
    <ScreenShell>
      <View style={styles.headerRow}>
        <Logo size="md" />
      </View>

      <GlassCard padding={r.isTablet ? 28 : 22}>
        <Text style={[styles.eyebrow, { color: colors.primary }]}>
          Token wallet
        </Text>
        <Text
          style={[
            styles.balanceValue,
            { color: colors.foreground, fontSize: r.font(36, 44, 64) },
          ]}
        >
          {formatTokens(balance)}
        </Text>
        <Text
          style={{
            color: colors.mutedForeground,
            fontFamily: "Inter_500Medium",
            fontSize: 14,
            marginTop: 4,
          }}
        >
          tokens available right now
        </Text>
      </GlassCard>

      <View>
        <Text
          style={[
            styles.sectionTitle,
            { color: colors.foreground, marginBottom: 4 },
          ]}
        >
          Top up
        </Text>
        <Text
          style={{
            color: colors.mutedForeground,
            fontSize: 13,
            marginBottom: 14,
          }}
        >
          Choose a bundle. Tokens land in your wallet the moment payment clears.
        </Text>
      </View>

      {error && (
        <GlassCard padding={14}>
          <Text style={{ color: colors.destructive, fontSize: 13 }}>
            {error}
          </Text>
        </GlassCard>
      )}

      {bundlesQuery.isLoading && (
        <GlassCard padding={28}>
          <ActivityIndicator color={colors.primary} />
        </GlassCard>
      )}

      <View
        style={
          r.isTablet
            ? {
                flexDirection: "row",
                flexWrap: "wrap",
                columnGap: 12,
                rowGap: 12,
              }
            : undefined
        }
      >
        {bundles.map((bundle) => (
          <View
            key={bundle.key}
            style={
              r.isTablet
                ? { flexBasis: "48%", maxWidth: "48%" }
                : undefined
            }
          >
            <BundleCard
              bundle={bundle}
              onSelect={handleSelect}
              pendingKey={pendingKey}
              noMargin={r.isTablet}
            />
          </View>
        ))}
      </View>

      <View style={{ marginTop: 18 }}>
        <Text
          style={[
            styles.sectionTitle,
            { color: colors.foreground, marginBottom: 12 },
          ]}
        >
          Purchase history
        </Text>
        {purchases.length === 0 ? (
          <GlassCard padding={20}>
            <View style={{ alignItems: "center", gap: 8 }}>
              <Feather name="clock" size={20} color={colors.mutedForeground} />
              <Text style={{ color: colors.mutedForeground, fontSize: 13 }}>
                No purchases yet.
              </Text>
            </View>
          </GlassCard>
        ) : (
          purchases.map((p) => (
            <GlassCard key={p.id} padding={14} style={{ marginBottom: 10 }}>
              <View style={styles.purchaseRow}>
                <View>
                  <Text
                    style={{
                      color: colors.foreground,
                      fontFamily: "Inter_600SemiBold",
                      fontWeight: "600",
                      fontSize: 14,
                    }}
                  >
                    {p.bundleKey}
                  </Text>
                  <Text
                    style={{
                      color: colors.mutedForeground,
                      fontSize: 12,
                      marginTop: 2,
                    }}
                  >
                    {formatDate(p.createdAt)} · {p.status}
                  </Text>
                </View>
                <View style={{ alignItems: "flex-end" }}>
                  <Text
                    style={{
                      color: colors.primary,
                      fontFamily: "Inter_600SemiBold",
                      fontWeight: "600",
                      fontSize: 14,
                    }}
                  >
                    +{formatTokens(p.tokensAdded)}
                  </Text>
                  <Text
                    style={{
                      color: colors.mutedForeground,
                      fontSize: 12,
                      marginTop: 2,
                    }}
                  >
                    ${(p.amountCents / 100).toFixed(2)}
                  </Text>
                </View>
              </View>
            </GlassCard>
          ))
        )}
      </View>
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
  balanceValue: {
    fontFamily: "Inter_700Bold",
    fontWeight: "700",
    fontSize: 44,
    letterSpacing: -1.5,
    marginTop: 6,
  },
  sectionTitle: {
    fontSize: 18,
    fontFamily: "Inter_700Bold",
    fontWeight: "700",
    letterSpacing: -0.3,
  },
  bundleCard: {
    marginBottom: 12,
  },
  bundleHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  bundleName: {
    fontFamily: "Inter_700Bold",
    fontWeight: "700",
    fontSize: 17,
    letterSpacing: -0.2,
  },
  popularPill: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
  },
  priceRow: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    marginTop: 14,
    marginBottom: 14,
  },
  priceValue: {
    fontFamily: "Inter_700Bold",
    fontWeight: "700",
    fontSize: 28,
    letterSpacing: -0.6,
  },
  purchaseRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
});
