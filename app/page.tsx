"use client";

import { signIn, signOut, useSession } from "next-auth/react";

export default function Home() {
  const { data: session } = useSession();

  if (!session) {
    return (
      <div style={{ display: "flex", height: "100vh", alignItems: "center", justifyContent: "center" }}>
        <button onClick={() => signIn("github")}>
          Login with GitHub
        </button>
      </div>
    );
  }

  return (
    <div style={{ padding: 20 }}>
      <h1>Machinedog.dev</h1>
      <p>Logged in as {session.user?.email}</p>
      <button onClick={() => signOut()}>Logout</button>
    </div>
  );
}