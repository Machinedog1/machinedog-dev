import { useAuth, useSignUp } from "@clerk/expo";
import { type Href, Link, useRouter } from "expo-router";
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

export default function SignUpScreen() {
  const colors = useColors();
  const { signUp, errors, fetchStatus } = useSignUp();
  const { isSignedIn } = useAuth();
  const router = useRouter();

  const [emailAddress, setEmailAddress] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [code, setCode] = React.useState("");

  const handleSubmit = async () => {
    const { error } = await signUp.password({
      emailAddress: emailAddress.trim(),
      password,
    });
    if (error) {
      console.warn("[sign-up]", JSON.stringify(error));
      return;
    }
    await signUp.verifications.sendEmailCode();
  };

  const handleVerify = async () => {
    await signUp.verifications.verifyEmailCode({ code });
    if (signUp.status === "complete") {
      await signUp.finalize({
        navigate: ({ decorateUrl }: { decorateUrl: (path: string) => string }) => {
          const url = decorateUrl("/");
          router.replace(url as Href);
        },
      });
    }
  };

  if (signUp.status === "complete" || isSignedIn) {
    return null;
  }

  const needsVerification =
    signUp.status === "missing_requirements" &&
    signUp.unverifiedFields?.includes("email_address") &&
    (!signUp.missingFields || signUp.missingFields.length === 0);

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScreenShell>
        <View style={styles.headerRow}>
          <Logo size="md" />
        </View>

        <GlassCard padding={24} style={styles.card}>
          {needsVerification ? (
            <>
              <Text style={[styles.title, { color: colors.foreground }]}>
                Verify your email
              </Text>
              <Text
                style={[styles.subtitle, { color: colors.mutedForeground }]}
              >
                We just sent a 6-digit code to {emailAddress}.
              </Text>

              <View style={{ gap: 14, marginTop: 18 }}>
                <TextInput
                  value={code}
                  onChangeText={setCode}
                  placeholder="000000"
                  keyboardType="number-pad"
                  placeholderTextColor={colors.mutedForeground}
                  maxLength={6}
                  style={[
                    styles.input,
                    styles.codeInput,
                    {
                      backgroundColor: colors.input,
                      color: colors.foreground,
                      borderColor: colors.cardBorder,
                      borderRadius: colors.radius,
                    },
                  ]}
                />
                {errors?.fields?.code && (
                  <Text style={[styles.error, { color: colors.destructive }]}>
                    {errors.fields.code.message}
                  </Text>
                )}
                <PrimaryButton
                  title="Verify and continue"
                  size="lg"
                  fullWidth
                  onPress={handleVerify}
                  loading={fetchStatus === "fetching"}
                  disabled={code.length < 6}
                />
                <PrimaryButton
                  title="Resend code"
                  variant="ghost"
                  fullWidth
                  onPress={() => signUp.verifications.sendEmailCode()}
                />
              </View>
            </>
          ) : (
            <>
              <Text style={[styles.title, { color: colors.foreground }]}>
                Create your account
              </Text>
              <Text
                style={[styles.subtitle, { color: colors.mutedForeground }]}
              >
                Use the email your account team invited. Other addresses cannot
                access the workspace.
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
                  {errors?.fields?.emailAddress && (
                    <Text style={[styles.error, { color: colors.destructive }]}>
                      {errors.fields.emailAddress.message}
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
                  title="Create account"
                  size="lg"
                  fullWidth
                  onPress={handleSubmit}
                  loading={fetchStatus === "fetching"}
                  disabled={!emailAddress || password.length < 8}
                />
              </View>

              <View nativeID="clerk-captcha" />

              <View style={styles.linkRow}>
                <Text style={{ color: colors.mutedForeground }}>
                  Already have an account?{" "}
                </Text>
                <Link href="/(auth)/sign-in" replace>
                  <Text style={{ color: colors.primary, fontWeight: "600" }}>
                    Sign in
                  </Text>
                </Link>
              </View>
            </>
          )}
        </GlassCard>
      </ScreenShell>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    alignItems: "center",
    paddingTop: 8,
    paddingBottom: 4,
  },
  card: {
    marginTop: 12,
  },
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
  codeInput: {
    fontSize: 26,
    letterSpacing: 8,
    textAlign: "center",
    fontFamily: "Inter_600SemiBold",
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
});
