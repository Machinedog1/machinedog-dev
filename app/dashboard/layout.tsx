"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "next-auth/react";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [projects, setProjects] = useState<any[]>([]);
  const router = useRouter();

  async function loadProjects() {
    const res = await fetch("/api/projects");
    const data = await res.json();
    setProjects(data);
  }

  async function createProject() {
    const name = prompt("Project name?");
    if (!name) return;

    const res = await fetch("/api/projects", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name }),
    });

    const project = await res.json();

    router.push(`/project/${project.id}`);
  }

  useEffect(() => {
    loadProjects();
  }, []);

  return (
    <div style={{ display: "flex", height: "100vh" }}>
      {/* Sidebar */}
      <div
        style={{
          width: 250,
          background: "#0b0b0b",
          color: "white",
          padding: 20,
        }}
      >
        <h2>MachineDog</h2>

        <button
          onClick={createProject}
          style={{
            background: "green",
            color: "white",
            padding: 10,
            width: "100%",
            marginTop: 10,
          }}
        >
          + New Project
        </button>

        <div style={{ marginTop: 20 }}>
          {projects.map((p) => (
            <div
              key={p.id}
              style={{ cursor: "pointer", marginTop: 10 }}
              onClick={() => router.push(`/project/${p.id}`)}
            >
              {p.name}
            </div>
          ))}
        </div>

        <button
          onClick={() => signOut()}
          style={{ marginTop: 20 }}
        >
          Logout
        </button>
      </div>

      {/* Page Content */}
      {children}
    </div>
  );
}