"use client";

import { signIn, signOut, useSession } from "next-auth/react";
import { useRouter } from "next/navigation";

export default function Home() {
  const { data: session } = useSession();
  const router = useRouter();

  return (
    <main style={{ textAlign: "center", marginTop: "100px" }}>
      {session ? (
        <>
          <p>Logged in as {session.user?.email}</p>

          <button onClick={() => router.push("/dashboard")}>
            Go to Dashboard
          </button>

          <br /><br />

          <button onClick={() => signOut()}>
            Logout
          </button>
        </>
      ) : (
        <button onClick={() => signIn("github")}>
          Login with GitHub
        </button>
      )}
    </main>
  );
}