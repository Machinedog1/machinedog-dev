"use client";

import { useState } from "react";

export default function ProjectClient({ id }: { id: string }) {
  const [code, setCode] = useState(
    `console.log("Project ${id} loaded")`
  );
  const [output, setOutput] = useState("");

  async function runCode() {
    const res = await fetch("/api/run", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ code }),
    });

    const data = await res.json();
    setOutput(data.output || data.error);
  }

  return (
    <div style={{ display: "flex", height: "100vh", background: "#0b0b0b", color: "white" }}>
      
      {/* Editor */}
      <div style={{ flex: 2, padding: 20 }}>
        <h2>Project: {id}</h2>

        <textarea
          value={code}
          onChange={(e) => setCode(e.target.value)}
          style={{
            width: "100%",
            height: "70%",
            background: "#111",
            color: "lime",
            fontFamily: "monospace",
            padding: 10,
          }}
        />

        <button
          onClick={runCode}
          style={{
            marginTop: 10,
            background: "limegreen",
            color: "black",
            padding: 10,
          }}
        >
          ▶ Run
        </button>
      </div>

      {/* Output */}
      <div style={{ flex: 1, padding: 20, borderLeft: "1px solid #333" }}>
        <h3>Output</h3>
        <pre>{output}</pre>
      </div>
    </div>
  );
}