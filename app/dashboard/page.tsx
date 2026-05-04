"use client";

import { useEffect, useState } from "react";

export default function Dashboard() {
  const [projects, setProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  async function loadProjects() {
    try {
      const res = await fetch("/api/projects");
      const data = await res.json();
      setProjects(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadProjects();
  }, []);

  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "white",
      }}
    >
      <div>
        <h2>Dashboard</h2>

        <p style={{ marginTop: 10 }}>
          {loading
            ? "Loading..."
            : projects.length === 0
            ? "No projects yet"
            : `${projects.length} project(s)`}
        </p>
      </div>
    </div>
  );
}