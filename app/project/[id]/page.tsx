"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import Editor from "@monaco-editor/react";

export default function ProjectPage() {
  const params = useParams();
  const id = params?.id as string;

  const [files, setFiles] = useState<any[]>([]);
  const [activeFile, setActiveFile] = useState<any>(null);
  const [output, setOutput] = useState<string>("");

  async function loadFiles() {
    try {
      console.log("Loading files for project:", id);

      const res = await fetch(`/api/files?projectId=${id}`);
      const data = await res.json();

      console.log("FILES:", data);

      if (!data || data.length === 0) {
        console.log("No files found → creating default file");

        const newFileRes = await fetch("/api/files", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            projectId: id,
            name: "index.js",
            content: `console.log("Project ${id} loaded")`,
          }),
        });

        const created = await newFileRes.json();

        console.log("Created file:", created);

        setFiles([created]);
        setActiveFile(created);
      } else {
        setFiles(data);
        setActiveFile(data[0]);
      }
    } catch (err) {
      console.error("LOAD FILE ERROR:", err);
    }
  }

  useEffect(() => {
    if (id) loadFiles();
  }, [id]);

  function runCode(code: string) {
    try {
      let logs: string[] = [];

      const fakeConsole = {
        log: (...args: any[]) => logs.push(args.join(" ")),
      };

      const fn = new Function("console", code);
      fn(fakeConsole);

      setOutput(logs.join("\n") || "No output");
    } catch (err: any) {
      setOutput("Error:\n" + err.message);
    }
  }

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

    runCode(content);
  }

  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column", background: "#111", color: "white" }}>
      
      <div style={{ padding: 12, borderBottom: "1px solid #222" }}>
        Project: {id}
      </div>

      <div style={{ flex: 1, display: "flex" }}>
        
        {/* File list */}
        <div style={{ width: 250, borderRight: "1px solid #222", padding: 10 }}>
          {files.length === 0 && <div>No files</div>}

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
          {!activeFile && (
            <div style={{ padding: 20 }}>Loading editor...</div>
          )}

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

        {/* Output */}
        <div style={{
          width: 300,
          borderLeft: "1px solid #222",
          padding: 10,
          background: "#000"
        }}>
          <div>🖥 Output</div>
          <pre>{output}</pre>
        </div>

      </div>
    </div>
  );
}