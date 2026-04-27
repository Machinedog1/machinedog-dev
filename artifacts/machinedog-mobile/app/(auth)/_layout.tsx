import { Redirect, Stack } from "expo-router";
import React from "react";

import { useAuth } from "@/lib/auth";

export default function AuthLayout() {
  const { isSignedIn, isLoading } = useAuth();

  if (isLoading) return null;
  if (isSignedIn) return <Redirect href="/(tabs)" />;

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: "transparent" },
      }}
    />
  );
}
