import { type Href, Link, useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
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
import { useAuth } from "@/lib/auth";

export default function SignUpScreen() {
  const colors = useColors();
  const r = useResponsive();
  const router = useRouter();
  const { acceptInvite } = useAuth();

  const [inviteToken, setInviteToken] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const intakeUrl = process.env.EXPO_PUBLIC_DOMAIN
    ? `https://${process.env.EXPO_PUBLIC_DOMAIN}/intake`
    : null;

  const canSubmit =
    inviteToken.trim().length > 0 &&
    password.length >= 8 &&
    password === confirm &&
    !submitting;

  const handleAccept = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    const result = await acceptInvite(inviteToken.trim(), password);
    setSubmitting(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    router.replace("/(tabs)" as Href);
  };

  const openIntake = async () => {
    if (intakeUrl) await WebBrowser.openBrowserAsync(intakeUrl);
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScreenShell>
        <View style={styles.headerRow}>
          <Logo size="md" />
        </View>

        <GlassCard padding={r.isTablet ? 28 : 22}>
          <Text
            style={[
              styles.title,
              { color: colors.foreground, fontSize: r.font(22, 26, 34) },
            ]}
          >
            Activate your invite
          </Text>
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
            Machinedog.Dev is invite-only. Paste the token from your invite
            email and choose a password to activate your account.
          </Text>

          <View style={{ gap: 14, marginTop: 18 }}>
            <View>
              <Text style={[styles.label, { color: colors.mutedForeground }]}>
                Invite token
              </Text>
              <TextInput
                value={inviteToken}
                onChangeText={setInviteToken}
                placeholder="Paste the token from your email"
                autoCapitalize="none"
                autoCorrect={false}
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
            </View>

            <View>
              <Text style={[styles.label, { color: colors.mutedForeground }]}>
                New password (min 8 chars)
              </Text>
              <TextInput
                value={password}
                onChangeText={setPassword}
                placeholder="At least 8 characters"
                secureTextEntry
                autoComplete="password-new"
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
            </View>

            <View>
              <Text style={[styles.label, { color: colors.mutedForeground }]}>
                Confirm password
              </Text>
              <TextInput
                value={confirm}
                onChangeText={setConfirm}
                secureTextEntry
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
            </View>

            {error && (
              <Text style={[styles.error, { color: colors.destructive }]}>
                {error}
              </Text>
            )}

            <PrimaryButton
              title="Activate account"
              size="lg"
              fullWidth
              onPress={handleAccept}
              loading={submitting}
              disabled={!canSubmit}
            />

            {intakeUrl && (
              <PrimaryButton
                title="Don't have an invite? Request one"
                variant="ghost"
                fullWidth
                onPress={openIntake}
              />
            )}
          </View>

          <View style={styles.linkRow}>
            <Text style={{ color: colors.mutedForeground }}>
              Already activated?{" "}
            </Text>
            <Link href="/(auth)/sign-in" replace>
              <Text style={{ color: colors.primary, fontWeight: "600" }}>
                Sign in
              </Text>
            </Link>
          </View>
        </GlassCard>
      </ScreenShell>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  headerRow: { alignItems: "center", paddingTop: 8, paddingBottom: 4 },
  title: {
    fontFamily: "Inter_700Bold",
    fontWeight: "700",
    fontSize: 26,
    letterSpacing: -0.6,
  },
  subtitle: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    marginTop: 6,
    lineHeight: 20,
  },
  label: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    fontWeight: "500",
    marginBottom: 6,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  input: {
    borderWidth: 1,
    paddingVertical: 12,
    paddingHorizontal: 14,
    fontFamily: "Inter_400Regular",
    fontSize: 15,
  },
  error: { marginTop: 6, fontSize: 13 },
  linkRow: {
    flexDirection: "row",
    justifyContent: "center",
    marginTop: 18,
    flexWrap: "wrap",
  },
});
