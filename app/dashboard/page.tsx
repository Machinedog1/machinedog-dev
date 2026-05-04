"use client";

import { useSession } from "next-auth/react";

export default function Dashboard() {
  const { data: session } = useSession();

  if (!session) {
    return <div>You are not logged in</div>;
  }

  return (
    <div style={{ textAlign: "center", marginTop: "100px" }}>
      <h1>Dashboard</h1>
      <p>Welcome {session.user?.email}</p>
    </div>
  );
}