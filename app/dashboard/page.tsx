"use client";

import { useEffect, useState } from "react";
import { signOut } from "next-auth/react";

export default function Dashboard() {
  const [projects, setProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  async function loadProjects() {
    const res = await fetch("/api/projects");
    const data = await res.json();
    setProjects(data);
    setLoading(false);
  }

  async function createProject() {
    const name = prompt("Project name?");
    if (!name) return;

    await fetch("/api/projects", {
      method: "POST",
      body: JSON.stringify({ name }),
    });

    loadProjects();
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
            marginTop: 10
          }}
        >
          + New Project
        </button>

        <div style={{ marginTop: 20 }}>
          {loading ? "Loading..." : projects.map((p) => (
            <div key={p.id}>{p.name}</div>
          ))}
        </div>

        <button
          onClick={() => signOut()}
          style={{ marginTop: 20 }}
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