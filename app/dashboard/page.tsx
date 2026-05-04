"use client";

import { useEffect, useState } from "react";
import { signOut } from "next-auth/react";
import { useRouter } from "next/navigation";

export default function Dashboard() {
  const [projects, setProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  async function loadProjects() {
    try {
      const res = await fetch("/api/projects");
      const data = await res.json();
      setProjects(data);
    } catch (err) {
      console.error("Error loading projects:", err);
    } finally {
      setLoading(false);
    }
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

    // 👉 go straight into the project (Replit style)
    router.push(`/project/${project.id}`);
  }

  useEffect(() => {
    loadProjects();
  }, []);

  return (
    <div style={{ display: "flex", height: "100vh" }}>
      
      {/* Sidebar */}
      <div style={{
        width: 250,
        background: "#0b0b0b",
        color: "white",
        padding: 20
      }}>
        <h2>MachineDog</h2>

        <button
          onClick={createProject}
          style={{
            background: "green",
            color: "white",
            padding: 10,
            width: "100%",
            marginTop: 10,
            cursor: "pointer"
          }}
        >
          + New Project
        </button>

        <div style={{ marginTop: 20 }}>
          {loading
            ? "Loading..."
            : projects.length === 0
              ? "No projects yet"
              : projects.map((p) => (
                  <div
                    key={p.id}
                    onClick={() => router.push(`/project/${p.id}`)}
                    style={{
                      padding: "8px 0",
                      cursor: "pointer",
                      borderBottom: "1px solid #222"
                    }}
                  >
                    {p.name}
                  </div>
                ))}
        </div>

        <button
          onClick={() => signOut()}
          style={{ marginTop: 20, cursor: "pointer" }}
        >
          Logout
        </button>
      </div>

      {/* Main */}
      <div style={{
        flex: 1,
        display: "flex",
        alignItems: "center",
        justifyContent: "center"
      }}>
        <h2>Dashboard</h2>
      </div>

    </div>
  );
}