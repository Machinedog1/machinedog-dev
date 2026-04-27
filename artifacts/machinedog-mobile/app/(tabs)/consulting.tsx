import { Feather } from "@expo/vector-icons";
import {
  ConsultingPackage,
  useCreateConsultingCheckout,
  useListConsultingPackages,
  useListMyConsultingBookings,
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

function formatPrice(usd: number) {
  return `$${usd.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

export default function ConsultingScreen() {
  const colors = useColors();
  const packagesQuery = useListConsultingPackages();
  const bookingsQuery = useListMyConsultingBookings();
  const checkout = useCreateConsultingCheckout();
  const [pendingKey, setPendingKey] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const handleSelect = async (pkg: ConsultingPackage) => {
    if (!pkg.stripePriceId) return;
    setError(null);
    setPendingKey(pkg.key);
    try {
      const result = await checkout.mutateAsync({
        data: { packageKey: pkg.key },
      });
      if (result?.url) {
        const opened = await WebBrowser.openBrowserAsync(result.url);
        if (opened.type === "cancel" || opened.type === "dismiss") {
          bookingsQuery.refetch();
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

  const packages = packagesQuery.data?.data ?? [];
  const bookings = bookingsQuery.data?.data ?? [];

  return (
    <ScreenShell>
      <View style={styles.headerRow}>
        <Logo size="md" />
      </View>

      <GlassCard padding={22}>
        <Text style={[styles.eyebrow, { color: colors.primary }]}>
          Consulting hours
        </Text>
        <Text style={[styles.heading, { color: colors.foreground }]}>
          Book a strategist
        </Text>
        <Text style={[styles.subheading, { color: colors.mutedForeground }]}>
          Pair your prompts with hands-on strategy from the Machinedog team.
          Hours never expire.
        </Text>
      </GlassCard>

      {error && (
        <GlassCard padding={14}>
          <Text style={{ color: colors.destructive, fontSize: 13 }}>
            {error}
          </Text>
        </GlassCard>
      )}

      {packagesQuery.isLoading && (
        <GlassCard padding={28}>
          <ActivityIndicator color={colors.primary} />
        </GlassCard>
      )}

      {packages.map((pkg) => (
        <GlassCard key={pkg.key} padding={20} style={styles.packageCard}>
          <View style={styles.packageHeader}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.packageName, { color: colors.foreground }]}>
                {pkg.name}
              </Text>
              <Text
                style={{
                  color: colors.mutedForeground,
                  fontSize: 13,
                  marginTop: 4,
                  lineHeight: 18,
                }}
              >
                {pkg.description}
              </Text>
            </View>
            {pkg.popular && (
              <View
                style={[styles.popularPill, { backgroundColor: colors.primary }]}
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
              {formatPrice(pkg.priceUsd)}
            </Text>
            <View style={styles.hoursPill}>
              <Feather name="clock" size={13} color={colors.foreground} />
              <Text
                style={{
                  color: colors.foreground,
                  fontFamily: "Inter_600SemiBold",
                  fontWeight: "600",
                  fontSize: 14,
                }}
              >
                {pkg.hours} hours
              </Text>
            </View>
          </View>

          <PrimaryButton
            title={pendingKey === pkg.key ? "Opening checkout…" : "Book package"}
            onPress={() => handleSelect(pkg)}
            loading={pendingKey === pkg.key}
            disabled={!pkg.stripePriceId}
            fullWidth
          />
          {!pkg.stripePriceId && (
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
      ))}

      <View style={{ marginTop: 18 }}>
        <Text
          style={[
            styles.sectionTitle,
            { color: colors.foreground, marginBottom: 12 },
          ]}
        >
          Your bookings
        </Text>

        {bookings.length === 0 ? (
          <GlassCard padding={20}>
            <View style={{ alignItems: "center", gap: 8 }}>
              <Feather
                name="calendar"
                size={20}
                color={colors.mutedForeground}
              />
              <Text style={{ color: colors.mutedForeground, fontSize: 13 }}>
                No active bookings yet.
              </Text>
            </View>
          </GlassCard>
        ) : (
          bookings.map((b) => {
            const remaining = b.hoursTotal - b.hoursUsed;
            return (
              <GlassCard
                key={b.id}
                padding={16}
                style={{ marginBottom: 10 }}
              >
                <View style={styles.bookingRow}>
                  <View>
                    <Text
                      style={{
                        color: colors.foreground,
                        fontFamily: "Inter_600SemiBold",
                        fontWeight: "600",
                        fontSize: 15,
                      }}
                    >
                      {b.packageKey}
                    </Text>
                    <Text
                      style={{
                        color: colors.mutedForeground,
                        fontSize: 12,
                        marginTop: 2,
                      }}
                    >
                      {b.status} · {b.hoursUsed} of {b.hoursTotal} hrs used
                    </Text>
                  </View>
                  <View
                    style={[
                      styles.remainingPill,
                      {
                        backgroundColor: colors.primarySoft,
                        borderColor: colors.primary + "33",
                      },
                    ]}
                  >
                    <Text
                      style={{
                        color: colors.primary,
                        fontFamily: "Inter_700Bold",
                        fontWeight: "700",
                        fontSize: 14,
                      }}
                    >
                      {remaining}h left
                    </Text>
                  </View>
                </View>
              </GlassCard>
            );
          })
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
  heading: {
    fontSize: 24,
    fontFamily: "Inter_700Bold",
    fontWeight: "700",
    letterSpacing: -0.5,
    marginTop: 6,
  },
  subheading: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    lineHeight: 20,
    marginTop: 6,
  },
  sectionTitle: {
    fontSize: 18,
    fontFamily: "Inter_700Bold",
    fontWeight: "700",
    letterSpacing: -0.3,
  },
  packageCard: {
    marginBottom: 12,
  },
  packageHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
  },
  packageName: {
    fontFamily: "Inter_700Bold",
    fontWeight: "700",
    fontSize: 18,
    letterSpacing: -0.3,
  },
  popularPill: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
  },
  priceRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 14,
    marginBottom: 16,
  },
  priceValue: {
    fontFamily: "Inter_700Bold",
    fontWeight: "700",
    fontSize: 28,
    letterSpacing: -0.6,
  },
  hoursPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "rgba(0,0,0,0.04)",
  },
  bookingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  remainingPill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
  },
});
