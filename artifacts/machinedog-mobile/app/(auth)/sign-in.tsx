import { useSignIn } from "@clerk/expo";
import { LinearGradient } from "expo-linear-gradient";
import { type Href, Link, useRouter } from "expo-router";
import React from "react";
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { GlassCard } from "@/components/GlassCard";
import { PrimaryButton } from "@/components/PrimaryButton";
import { ScreenShell } from "@/components/ScreenShell";
import { useColors } from "@/hooks/useColors";
import { useResponsive } from "@/hooks/useResponsive";

const huskyImg = require("@/assets/images/husky-mark.png");
const huskyPortrait = require("@/assets/images/husky-portrait.png");

export default function SignInScreen() {
  const colors = useColors();
  const r = useResponsive();
  const { signIn, errors, fetchStatus } = useSignIn();
  const router = useRouter();

  const heroHeight = Math.min(
    Math.max(Math.round(r.height * (r.isTablet ? 0.5 : 0.58)), 340),
    r.isTablet ? 620 : 500,
  );
  const heroPaddingX = r.isTablet ? 32 : r.isCompact ? 14 : 18;
  const headlineFont = r.isTablet ? 56 : r.isCompact ? 28 : 38;
  const headlineLine = r.isTablet ? 58 : r.isCompact ? 30 : 40;

  const [emailAddress, setEmailAddress] = React.useState("");
  const [password, setPassword] = React.useState("");

  const handleSubmit = async () => {
    const { error } = await signIn.password({
      emailAddress: emailAddress.trim(),
      password,
    });
    if (error) {
      console.warn("[sign-in]", JSON.stringify(error));
      return;
    }
    if (signIn.status === "complete") {
      await signIn.finalize({
        navigate: ({ decorateUrl }: { decorateUrl: (path: string) => string }) => {
          const url = decorateUrl("/");
          router.replace(url as Href);
        },
      });
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScreenShell contentStyle={{ paddingHorizontal: 0, gap: 0 }}>
        {/* Hero header — dramatic husky portrait backdrop */}
        <View
          style={[
            styles.hero,
            {
              height: heroHeight,
              paddingHorizontal: heroPaddingX,
              paddingBottom: r.isTablet ? 36 : 28,
            },
          ]}
        >
          <Image
            source={huskyPortrait}
            resizeMode="cover"
            style={[
              StyleSheet.absoluteFill,
              // objectPosition is honored by react-native-web only;
              // shifts focal point lower so the cyan eye + collar are visible.
              { objectPosition: "50% 65%" } as object,
            ]}
          />
          {/* Cyber blue radial tint */}
          <LinearGradient
            colors={[
              "rgba(63,184,240,0.28)",
              "transparent",
              "rgba(168,140,255,0.18)",
            ]}
            start={{ x: 0.5, y: 0.15 }}
            end={{ x: 0.5, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
          {/* Bottom fade for headline legibility */}
          <LinearGradient
            colors={[
              "transparent",
              "rgba(4,7,17,0.55)",
              "rgba(4,7,17,0.95)",
              colors.background,
            ]}
            locations={[0, 0.55, 0.85, 1]}
            style={StyleSheet.absoluteFill}
          />

          <View style={styles.heroBrandRow}>
            <View
              style={[
                styles.brandRing,
                {
                  borderColor: colors.primary,
                  shadowColor: colors.primary,
                },
              ]}
            >
              <Image
                source={huskyImg}
                style={styles.brandAvatar}
                resizeMode="contain"
              />
            </View>
            <Text style={styles.brandWord}>MACHINEDOG.DEV</Text>
          </View>

          <View style={styles.heroCopy}>
            <Text
              style={[
                styles.eyebrow,
                { color: colors.primaryBright ?? colors.primary },
              ]}
            >
              INVITE-ONLY AI ATELIER
            </Text>
            <Text
              style={[
                styles.headline,
                {
                  fontSize: headlineFont,
                  lineHeight: headlineLine,
                },
              ]}
            >
              WE FORGE{"\n"}
              <Text style={{ color: colors.primaryBright ?? colors.primary }}>
                DIGITAL
              </Text>
              {"\n"}INTELLIGENCE
            </Text>
          </View>
        </View>

        {/* Form */}
        <View
          style={[
            styles.formWrap,
            {
              paddingHorizontal: heroPaddingX,
              maxWidth: r.containerMaxWidth,
              alignSelf: "center",
              width: "100%",
            },
          ]}
        >
          <GlassCard padding={22} style={styles.card}>
            <Text style={[styles.title, { color: colors.foreground }]}>
              Welcome back
            </Text>
            <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
              Sign in to your invite-only Machinedog.Dev workspace.
            </Text>

            <View style={{ gap: 14, marginTop: 18 }}>
              <View>
                <Text style={[styles.label, { color: colors.mutedForeground }]}>
                  Email address
                </Text>
                <TextInput
                  value={emailAddress}
                  onChangeText={setEmailAddress}
                  placeholder="you@company.com"
                  autoCapitalize="none"
                  autoComplete="email"
                  keyboardType="email-address"
                  placeholderTextColor={colors.mutedForeground}
                  style={[
                    styles.input,
                    {
                      backgroundColor: colors.input,
                      color: colors.foreground,
                      borderColor: colors.cardBorder,
                      borderRadius: colors.radius,
                    },
                  ]}
                />
                {errors?.fields?.identifier && (
                  <Text style={[styles.error, { color: colors.destructive }]}>
                    {errors.fields.identifier.message}
                  </Text>
                )}
              </View>

              <View>
                <Text style={[styles.label, { color: colors.mutedForeground }]}>
                  Password
                </Text>
                <TextInput
                  value={password}
                  onChangeText={setPassword}
                  placeholder="••••••••"
                  secureTextEntry
                  autoComplete="password"
                  placeholderTextColor={colors.mutedForeground}
                  style={[
                    styles.input,
                    {
                      backgroundColor: colors.input,
                      color: colors.foreground,
                      borderColor: colors.cardBorder,
                      borderRadius: colors.radius,
                    },
                  ]}
                />
                {errors?.fields?.password && (
                  <Text style={[styles.error, { color: colors.destructive }]}>
                    {errors.fields.password.message}
                  </Text>
                )}
              </View>

              {errors?.global?.length ? (
                <Text style={[styles.error, { color: colors.destructive }]}>
                  {errors.global[0].message}
                </Text>
              ) : null}

              <PrimaryButton
                title="SIGN IN"
                size="lg"
                fullWidth
                onPress={handleSubmit}
                loading={fetchStatus === "fetching"}
                disabled={!emailAddress || !password}
              />
            </View>

            <View style={styles.linkRow}>
              <Text style={{ color: colors.mutedForeground }}>
                Don&apos;t have an account?{" "}
              </Text>
              <Link href="/(auth)/sign-up" replace>
                <Text style={{ color: colors.primary, fontWeight: "700" }}>
                  Sign up
                </Text>
              </Link>
            </View>
          </GlassCard>

          <Text style={[styles.footer, { color: colors.mutedForeground }]}>
            Machinedog.Dev is invite-only. Reach out to your account team for an
            invitation.
          </Text>
        </View>
      </ScreenShell>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  hero: {
    width: "100%",
    overflow: "hidden",
    justifyContent: "space-between",
    paddingTop: 12,
  },
  heroBrandRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  brandRing: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2,
    overflow: "hidden",
    shadowOpacity: 0.6,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 0 },
    backgroundColor: "hsl(220, 40%, 4%)",
    alignItems: "center",
    justifyContent: "center",
  },
  brandAvatar: {
    width: 36,
    height: 36,
  },
  brandWord: {
    fontFamily: "Inter_700Bold",
    fontWeight: "800",
    fontSize: 18,
    letterSpacing: 1.8,
    color: "#FFFFFF",
  },
  heroCopy: {
    paddingBottom: 8,
  },
  eyebrow: {
    fontFamily: "Inter_700Bold",
    fontWeight: "700",
    fontSize: 11,
    letterSpacing: 2.2,
    marginBottom: 8,
  },
  headline: {
    fontFamily: "Inter_700Bold",
    fontWeight: "900",
    fontSize: 38,
    lineHeight: 40,
    letterSpacing: -1.2,
    color: "#FFFFFF",
  },
  formWrap: {
    paddingHorizontal: 18,
    paddingTop: 4,
    gap: 12,
  },
  card: {
    marginTop: 4,
  },
  title: {
    fontFamily: "Inter_700Bold",
    fontWeight: "700",
    fontSize: 24,
    letterSpacing: -0.6,
  },
  subtitle: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    marginTop: 6,
    lineHeight: 20,
  },
  label: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    fontWeight: "700",
    marginBottom: 6,
    textTransform: "uppercase",
    letterSpacing: 1.2,
  },
  input: {
    borderWidth: 1,
    paddingVertical: 12,
    paddingHorizontal: 14,
    fontFamily: "Inter_400Regular",
    fontSize: 15,
  },
  error: {
    marginTop: 6,
    fontSize: 13,
  },
  linkRow: {
    flexDirection: "row",
    justifyContent: "center",
    marginTop: 18,
    flexWrap: "wrap",
  },
  footer: {
    textAlign: "center",
    fontSize: 12,
    paddingHorizontal: 12,
    marginTop: 4,
  },
});
