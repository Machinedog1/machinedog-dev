import { useSignIn } from "@clerk/expo";
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
const huskyPortrait = require("@/assets/images/husky-portrait-frontal.png");

export default function SignInScreen() {
  const colors = useColors();
  const r = useResponsive();
  const { signIn, errors, fetchStatus } = useSignIn();
  const router = useRouter();

  const heroHeight = Math.min(
    Math.max(Math.round(r.height * (r.isTablet ? 0.5 : 0.58)), 340),
    r.isTablet ? 620 : 500,
  );
  const sidePad = r.isTablet ? 32 : r.isCompact ? 18 : 22;
  // Match the website's clamp(1.5rem, 7vw, 4.5rem) — at 393px that's ~27px.
  const headlineFont = r.isTablet
    ? Math.min(Math.max(Math.round(r.width * 0.07), 40), 64)
    : Math.min(Math.max(Math.round(r.width * 0.07), 22), 30);
  const headlineLine = Math.round(headlineFont * 0.95);

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
        {/* Top brand row — sits above the hero, mirroring the website header */}
        <View style={[styles.topBar, { paddingHorizontal: sidePad }]}>
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
          <Text style={styles.brandWord}>
            MACHINEDOG<Text style={{ color: colors.primary }}>.DEV</Text>
          </Text>
        </View>

        {/* Hero — husky portrait with eyes visible, no overlay copy.
            Mirrors portal sign-in mobile hero exactly via web-only CSS props. */}
        <View
          style={[
            styles.hero,
            {
              height: heroHeight,
              marginTop: 12,
            },
          ]}
        >
          <Image
            source={huskyPortrait}
            resizeMode="cover"
            style={[
              {
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                height: "100%",
                objectFit: "cover",
                objectPosition: "50% 30%",
                filter: "saturate(1.18) contrast(1.06) brightness(0.82)",
              } as object,
            ]}
          />
          {/* Cyan halo radial over the eyes (mix-blend-screen mirrors portal) */}
          <View
            pointerEvents="none"
            style={[
              StyleSheet.absoluteFill,
              {
                backgroundImage:
                  "radial-gradient(ellipse 70% 35% at 50% 42%, hsla(200,95%,55%,0.30) 0%, transparent 60%)",
                mixBlendMode: "screen",
              } as object,
            ]}
          />
          {/* Bottom fade only over lower 2/3 so the husky face stays clear */}
          <View
            pointerEvents="none"
            style={[
              {
                position: "absolute",
                left: 0,
                right: 0,
                bottom: 0,
                height: Math.round(heroHeight * 0.66),
                backgroundImage:
                  "linear-gradient(180deg, transparent 0%, hsla(220,45%,3%,0.55) 55%, hsla(220,45%,3%,1) 100%)",
              } as object,
            ]}
          />
        </View>

        {/* Headline glass card — sits BELOW the hero, like the website */}
        <View
          style={[
            styles.section,
            {
              paddingHorizontal: sidePad,
              maxWidth: r.containerMaxWidth,
              alignSelf: "center",
              width: "100%",
              marginTop: r.isTablet ? 8 : -16,
            },
          ]}
        >
          <GlassCard padding={r.isTablet ? 28 : 22}>
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
              We forge{"\n"}
              <Text style={{ color: colors.primaryBright ?? colors.primary }}>
                digital
              </Text>
              {"\n"}intelligence
            </Text>
            <Text
              style={[
                styles.heroBody,
                {
                  color: colors.mutedForeground,
                  fontSize: r.font(15, 16, 18),
                  lineHeight: r.font(22, 24, 26),
                },
              ]}
            >
              Machinedog.Dev is a private engineering atelier. Sign in with
              your invited account to access prompts, projects, and consulting
              hours.
            </Text>
          </GlassCard>
        </View>

        {/* Form glass card */}
        <View
          style={[
            styles.section,
            {
              paddingHorizontal: sidePad,
              maxWidth: r.containerMaxWidth,
              alignSelf: "center",
              width: "100%",
              marginTop: r.isTablet ? 22 : 16,
            },
          ]}
        >
          <GlassCard padding={r.isTablet ? 28 : 22}>
            <Text
              style={[
                styles.welcomeEyebrow,
                { color: colors.mutedForeground },
              ]}
            >
              WELCOME BACK
            </Text>
            <Text style={[styles.title, { color: colors.foreground }]}>
              Sign in to continue
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
            ENCRYPTED · INVITE-ONLY · NO SPAM
          </Text>
        </View>
      </ScreenShell>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingTop: 4,
    paddingBottom: 4,
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
  hero: {
    width: "100%",
    overflow: "hidden",
  },
  section: {
    paddingTop: 0,
  },
  eyebrow: {
    fontFamily: "Inter_700Bold",
    fontWeight: "700",
    fontSize: 11,
    letterSpacing: 2.6,
    marginBottom: 12,
  },
  headline: {
    fontFamily: "Inter_700Bold",
    fontWeight: "900",
    letterSpacing: -0.6,
    color: "#FFFFFF",
    textTransform: "uppercase",
  },
  heroBody: {
    fontFamily: "Inter_400Regular",
    marginTop: 16,
  },
  welcomeEyebrow: {
    fontFamily: "Inter_700Bold",
    fontWeight: "700",
    fontSize: 11,
    letterSpacing: 2.6,
    marginBottom: 6,
  },
  title: {
    fontFamily: "Inter_700Bold",
    fontWeight: "800",
    fontSize: 26,
    letterSpacing: -0.6,
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
    fontSize: 10,
    letterSpacing: 2.4,
    paddingHorizontal: 12,
    marginTop: 16,
    fontFamily: "Inter_700Bold",
    fontWeight: "700",
  },
});
