"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import Editor from "@monaco-editor/react";

export default function ProjectPage() {
  const params = useParams();
  const id = params?.id as string;

  const [files, setFiles] = useState<any[]>([]);
  const [activeFile, setActiveFile] = useState<any>(null);

  // Load files
  async function loadFiles() {
    const res = await fetch(`/api/files?projectId=${id}`);
    const data = await res.json();

    if (data.length === 0) {
      const newFile = await fetch("/api/files", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: id,
          name: "index.js",
          content: `console.log("Project ${id} loaded")`,
        }),
      });

      const created = await newFile.json();
      setFiles([created]);
      setActiveFile(created);
    } else {
      setFiles(data);
      setActiveFile(data[0]);
    }
  }

  useEffect(() => {
    if (id) loadFiles();
  }, [id]);

  // Save file
  async function saveFile(content: string) {
    if (!activeFile) return;

    await fetch("/api/files", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        projectId: id,
        name: activeFile.name,
        content,
      }),
    });
  }

  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column", background: "#111", color: "white" }}>
      
      {/* Top */}
      <div style={{ padding: 12, borderBottom: "1px solid #222" }}>
        Project: {id}
      </div>

      <div style={{ flex: 1, display: "flex" }}>
        
        {/* Files */}
        <div style={{ width: 250, borderRight: "1px solid #222", padding: 10 }}>
          {files.map((f) => (
            <div
              key={f.id}
              onClick={() => setActiveFile(f)}
              style={{
                padding: 6,
                cursor: "pointer",
                background: activeFile?.id === f.id ? "#222" : "transparent"
              }}
            >
              📄 {f.name}
            </div>
          ))}
        </div>

        {/* Editor */}
        <div style={{ flex: 1 }}>
          {activeFile && (
            <Editor
              height="100%"
              theme="vs-dark"
              defaultLanguage="javascript"
              value={activeFile.content}
              onChange={(val) => saveFile(val || "")}
            />
          )}
        </div>

        {/* Preview */}
        <div style={{ width: 300, borderLeft: "1px solid #222", padding: 10 }}>
          Preview Panel
        </div>

      </div>
    </div>
  );
}