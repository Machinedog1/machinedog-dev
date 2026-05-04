"use client";

import { signIn, useSession } from "next-auth/react";

export default function Home() {
  const { data: session } = useSession();

  if (session) {
    return (
      <main style={{ display: "flex", height: "100vh", alignItems: "center", justifyContent: "center" }}>
        <div>
          <p>Logged in as {session.user?.email}</p>
        </div>
      </main>
    );
  }

  return (
    <main style={{ display: "flex", height: "100vh", alignItems: "center", justifyContent: "center" }}>
      <button onClick={() => signIn("github")}>
        Login with GitHub
      </button>
    </main>
  );
}