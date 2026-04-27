import { Feather } from "@expo/vector-icons";
import { useGetMe } from "@workspace/api-client-react";
import { useRouter } from "expo-router";
import React from "react";
import { Appearance, StyleSheet, Text, View, useColorScheme } from "react-native";

import { GlassCard } from "@/components/GlassCard";
import { Logo } from "@/components/Logo";
import { PrimaryButton } from "@/components/PrimaryButton";
import { ScreenShell } from "@/components/ScreenShell";
import { useColors } from "@/hooks/useColors";
import { useResponsive } from "@/hooks/useResponsive";
import { useAuth } from "@/lib/auth";

function formatTokens(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

export default function ProfileScreen() {
  const colors = useColors();
  const r = useResponsive();
  const router = useRouter();
  const { client, signOut } = useAuth();
  const meQuery = useGetMe();
  const me = meQuery.data;
  const scheme = useColorScheme();
  const [signingOut, setSigningOut] = React.useState(false);

  const handleSignOut = async () => {
    setSigningOut(true);
    try {
      await signOut();
      router.replace("/(auth)/sign-in");
    } finally {
      setSigningOut(false);
    }
  };

  const cycleTheme = () => {
    if (scheme === "dark") {
      Appearance.setColorScheme("light");
    } else {
      Appearance.setColorScheme("dark");
    }
  };

  const email = client?.email ?? me?.email ?? "Signed-in user";
  const displayName = email.split("@")[0];

  return (
    <ScreenShell>
      <View style={styles.headerRow}>
        <Logo size="md" />
      </View>

      <GlassCard padding={r.isTablet ? 28 : 22}>
        <View style={styles.identityRow}>
          <View
            style={[
              styles.avatar,
              {
                backgroundColor: colors.primary,
              },
            ]}
          >
            <Text
              style={{
                color: colors.primaryForeground,
                fontFamily: "Inter_700Bold",
                fontWeight: "700",
                fontSize: 22,
              }}
            >
              {displayName.charAt(0).toUpperCase()}
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text
              style={[
                styles.name,
                { color: colors.foreground, fontSize: r.font(18, 20, 26) },
              ]}
            >
              {displayName}
            </Text>
            <Text
              style={{
                color: colors.mutedForeground,
                fontFamily: "Inter_500Medium",
                fontSize: 13,
                marginTop: 2,
              }}
            >
              {email}
            </Text>
            {me?.isAdmin && (
              <View
                style={[
                  styles.adminPill,
                  {
                    backgroundColor: colors.primarySoft,
                    borderColor: colors.primary + "44",
                  },
                ]}
              >
                <Text
                  style={{
                    color: colors.primary,
                    fontFamily: "Inter_700Bold",
                    fontWeight: "700",
                    fontSize: 10,
                    letterSpacing: 0.8,
                  }}
                >
                  ADMIN
                </Text>
              </View>
            )}
          </View>
        </View>

        <View
          style={[styles.divider, { backgroundColor: colors.cardBorder }]}
        />

        <View style={styles.statsRow}>
          <View style={styles.stat}>
            <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>
              Available
            </Text>
            <Text
              style={[
                styles.statValue,
                { color: colors.foreground, fontSize: r.font(20, 22, 30) },
              ]}
            >
              {formatTokens(me?.tokenBalance ?? 0)}
            </Text>
          </View>
          <View
            style={[styles.statDivider, { backgroundColor: colors.cardBorder }]}
          />
          <View style={styles.stat}>
            <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>
              Used
            </Text>
            <Text
              style={[
                styles.statValue,
                { color: colors.foreground, fontSize: r.font(20, 22, 30) },
              ]}
            >
              {formatTokens(me?.totalTokensUsed ?? 0)}
            </Text>
          </View>
        </View>
      </GlassCard>

      <GlassCard padding={18}>
        <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
          Appearance
        </Text>
        <Text
          style={{
            color: colors.mutedForeground,
            fontSize: 13,
            marginTop: 4,
            marginBottom: 12,
          }}
        >
          Currently using the {scheme === "dark" ? "Deep Editor" : "Pearlescent"} theme.
        </Text>
        <PrimaryButton
          title={scheme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          variant="secondary"
          onPress={cycleTheme}
          fullWidth
          rightIcon={
            <Feather
              name={scheme === "dark" ? "sun" : "moon"}
              size={16}
              color={colors.foreground}
            />
          }
        />
      </GlassCard>

      <GlassCard padding={18}>
        <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
          Account
        </Text>
        <Text
          style={{
            color: colors.mutedForeground,
            fontSize: 13,
            marginTop: 4,
            marginBottom: 12,
          }}
        >
          Signing out will clear your stored session on this device.
        </Text>
        <PrimaryButton
          title="Sign out"
          variant="secondary"
          loading={signingOut}
          onPress={handleSignOut}
          fullWidth
          rightIcon={
            <Feather name="log-out" size={16} color={colors.foreground} />
          }
        />
      </GlassCard>

      <Text
        style={{
          color: colors.mutedForeground,
          fontSize: 11,
          textAlign: "center",
          paddingHorizontal: 32,
        }}
      >
        Machinedog.Dev · Invite-only access governed by your account agreement.
      </Text>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  headerRow: { paddingHorizontal: 4, marginTop: 4 },
  identityRow: { flexDirection: "row", alignItems: "center", gap: 14 },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  name: {
    fontFamily: "Inter_700Bold",
    fontWeight: "700",
    fontSize: 20,
    letterSpacing: -0.4,
  },
  adminPill: {
    alignSelf: "flex-start",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: 1,
    marginTop: 8,
  },
  divider: { height: 1, marginVertical: 16 },
  statsRow: { flexDirection: "row", alignItems: "center" },
  stat: { flex: 1 },
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
  statDivider: { width: 1, height: 32, marginHorizontal: 12 },
  sectionTitle: {
    fontFamily: "Inter_700Bold",
    fontWeight: "700",
    fontSize: 16,
    letterSpacing: -0.2,
  },
});
