"use client";

import { signIn, signOut, useSession } from "next-auth/react";

export default function Home() {
  const { data: session } = useSession();

  return (
    <main
      style={{
        display: "flex",
        height: "100vh",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "Arial, sans-serif",
      }}
    >
      <div style={{ textAlign: "center" }}>
        {session ? (
          <>
            <p style={{ marginBottom: "20px" }}>
              Logged in as <strong>{session.user?.email}</strong>
            </p>

            <button
              onClick={() => signOut()}
              style={{
                padding: "10px 20px",
                backgroundColor: "#000",
                color: "#fff",
                border: "none",
                borderRadius: "6px",
                cursor: "pointer",
              }}
            >
              Logout
            </button>
          </>
        ) : (
          <button
            onClick={() => signIn("github")}
            style={{
              padding: "10px 20px",
              backgroundColor: "#24292e",
              color: "#fff",
              border: "none",
              borderRadius: "6px",
              cursor: "pointer",
            }}
          >
            Login with GitHub
          </button>
        )}
      </div>
    </main>
  );
}