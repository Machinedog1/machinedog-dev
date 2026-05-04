"use client";

import { useEffect, useState } from "react";

type FileType = {
  id: string;
  name: string;
  content: string;
};

export default function ProjectClient({ id }: { id: string }) {
  const [files, setFiles] = useState<FileType[]>([]);
  const [activeFile, setActiveFile] = useState<FileType | null>(null);
  const [output, setOutput] = useState("");

  // 🔹 LOAD FILES (and auto-create if empty)
  useEffect(() => {
    async function loadFiles() {
      const res = await fetch(`/api/files?projectId=${id}`);
      const data = await res.json();

      if (data.length > 0) {
        setFiles(data);
        setActiveFile(data[0]);
      } else {
        // CREATE DEFAULT FILE
        const res = await fetch(`/api/files`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            projectId: id,
            name: "index.js",
            content: `console.log("Project ${id} loaded")`,
          }),
        });

        const newFile = await res.json();
        setFiles([newFile]);
        setActiveFile(newFile);
      }
    }

    if (id) loadFiles();
  }, [id]);

  // 🔹 AUTO SAVE
  useEffect(() => {
    const timeout = setTimeout(() => {
      if (!activeFile) return;

      fetch(`/api/files`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          projectId: id,
          name: activeFile.name,
          content: activeFile.content,
        }),
      });
    }, 1000);

    return () => clearTimeout(timeout);
  }, [activeFile, id]);

  async function runCode() {
    if (!activeFile) return;

    const res = await fetch("/api/run", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ code: activeFile.content }),
    });

    const data = await res.json();
    setOutput(data.output || data.error || "No output");
  }

  async function createFile() {
    const name = prompt("File name?");
    if (!name) return;

    const res = await fetch(`/api/files`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        projectId: id,
        name,
        content: "",
      }),
    });

    const newFile = await res.json();
    setFiles([...files, newFile]);
    setActiveFile(newFile);
  }

  return (
    <div style={{ display: "flex", height: "100vh", background: "#0b0b0b", color: "white" }}>
      
      {/* FILE SIDEBAR */}
      <div style={{ width: 220, padding: 10, borderRight: "1px solid #333" }}>
        <h3>Files</h3>

        <button onClick={createFile}>+ New File</button>

        {files.map((file) => (
          <div
            key={file.id}
            onClick={() => setActiveFile(file)}
            style={{
              cursor: "pointer",
              padding: 6,
              background: activeFile?.id === file.id ? "#222" : "transparent",
            }}
          >
            📄 {file.name}
          </div>
        ))}
      </div>

      {/* EDITOR */}
      <div style={{ flex: 2, padding: 20 }}>
        <h2>Project: {id}</h2>

        {activeFile && (
          <>
            <textarea
              value={activeFile.content}
              onChange={(e) =>
                setActiveFile({
                  ...activeFile,
                  content: e.target.value,
                })
              }
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
          </>
        )}
      </div>

      {/* OUTPUT */}
      <div style={{ flex: 1, padding: 20, borderLeft: "1px solid #333" }}>
        <h3>Output</h3>
        <pre>{output}</pre>
      </div>
    </div>
  );
}