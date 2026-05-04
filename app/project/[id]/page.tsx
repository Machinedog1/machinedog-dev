"use client";

import { useParams } from "next/navigation";

export default function ProjectPage() {
  const params = useParams();

  // Prevent crash while loading params
  if (!params || !params.id) {
    return <div style={{ color: "white", padding: 20 }}>Loading...</div>;
  }

  const id = params.id as string;

  return (
    <div
      style={{
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        background: "#111",
        color: "white",
      }}
    >
      {/* Top Bar */}
      <div
        style={{
          padding: 12,
          borderBottom: "1px solid #222",
          fontWeight: "bold",
        }}
      >
        Project: {id}
      </div>

      {/* Main Layout */}
      <div style={{ flex: 1, display: "flex" }}>
        
        {/* File Tree */}
        <div
          style={{
            width: 250,
            borderRight: "1px solid #222",
            padding: 10,
          }}
        >
          <div>📁 src</div>
          <div>📄 index.js</div>
        </div>

        {/* Editor */}
        <div
          style={{
            flex: 1,
            padding: 10,
          }}
        >
          <pre>{`console.log("Project ${id} loaded")`}</pre>
        </div>

        {/* Preview */}
        <div
          style={{
            width: 300,
            borderLeft: "1px solid #222",
            padding: 10,
          }}
        >
          Preview Panel
        </div>
      </div>
    </div>
  );
}