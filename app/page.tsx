"use client";

import { signIn, signOut, useSession } from "next-auth/react";

export const dynamic = "force-dynamic";

export default function Home() {
  const sessionResult = useSession();
  const session = sessionResult?.data;
  const status = sessionResult?.status;

  if (status === "loading") {
    return <main style={{ padding: 40 }}>Loading...</main>;
  }

  if (!session) {
    return (
      <main style={{ display: "flex", height: "100vh", alignItems: "center", justifyContent: "center" }}>
        <button onClick={() => signIn("github")}>
          Login with GitHub
        </button>
      </main>
    );
  }

  return (
    <main style={{ padding: 40 }}>
      <h1>Machinedog.dev</h1>
      <p>Logged in as {session.user?.email}</p>
      <button onClick={() => signOut()}>Logout</button>
    </main>
  );
}