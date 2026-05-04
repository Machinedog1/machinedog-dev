"use client";

import { useEffect, useState } from "react";
import { signOut } from "next-auth/react";

export default function Dashboard() {
  const [projects, setProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

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

  useEffect(() => {
    loadProjects();
  }, []);

  return (
    <div style={{
      flex: 1,
      display: "flex",
      alignItems: "center",
      justifyContent: "center"
    }}>
      <div>
        <h2>Dashboard</h2>

        <div style={{ marginTop: 20 }}>
          {loading
            ? "Loading..."
            : projects.length === 0
              ? "No projects yet"
              : projects.map((p) => (
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
    </div>
  );
}