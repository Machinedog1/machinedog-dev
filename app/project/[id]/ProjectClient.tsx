"use client";



import { useMemo, useState } from "react";



type ProjectClientProps = {

  projectId: string;

};



type RightTab = "console" | "preview" | "publish";



export default function ProjectClient({ projectId }: ProjectClientProps) {

  const [code, setCode] = useState("// Start coding...\n");

  const [terminalInput, setTerminalInput] = useState("node index.js");

  const [terminalOutput, setTerminalOutput] = useState("");

  const [activeTab, setActiveTab] = useState<RightTab>("console");

  const [isRunning, setIsRunning] = useState(false);

  const [isPublishing, setIsPublishing] = useState(false);

  const [publishMessage, setPublishMessage] = useState("Initial publish from IDE");



  const previewUrl = useMemo(() => "http://44.222.149.142", [projectId]);



  async function runCommand() {

    setIsRunning(true);

    try {

      const res = await fetch("/api/run", {

        method: "POST",

        headers: { "Content-Type": "application/json" },

        body: JSON.stringify({

          command: terminalInput,

          cwd: `/workspaces/${projectId}`,

        }),

      });



      const data = await res.json();

      const output = [

        `> ${terminalInput}`,

        data?.stdout ?? "",

        data?.stderr ? `stderr:\n${data.stderr}` : "",

        data?.error ? `error: ${data.error}` : "",

      ]

        .filter(Boolean)

        .join("\n");



      setTerminalOutput(output);

      setActiveTab("console");

    } catch (err) {

      setTerminalOutput(`error: ${err instanceof Error ? err.message : "Unknown error"}`);

      setActiveTab("console");

    } finally {

      setIsRunning(false);

    }

  }



  async function publishToGitHub() {

    setIsPublishing(true);

    try {

      await new Promise((r) => setTimeout(r, 900));

      setTerminalOutput((prev) =>

        `${prev ? `${prev}\n\n` : ""}[publish] queued: ${publishMessage}`

      );

      setActiveTab("publish");

    } finally {

      setIsPublishing(false);

    }

  }



  return (

    <div

      style={{

        height: "calc(100vh - 56px)",

        background: "#0b0b0f",

        color: "#eaeaea",

        display: "grid",

        gridTemplateColumns: "220px 1fr 420px",

      }}

    >

      {/* LEFT */}

      <div style={{ borderRight: "1px solid #222", padding: 12, overflow: "auto" }}>

        <h3 style={{ marginTop: 0 }}>Files</h3>

        <div style={{ fontSize: 14, opacity: 0.9 }}>

          <div>index.js</div>

          <div>package.json</div>

          <div>README.md</div>

        </div>

      </div>



      {/* CENTER */}

      <div style={{ borderRight: "1px solid #222", display: "flex", flexDirection: "column", minWidth: 0 }}>

        <div style={{ padding: "8px 12px", borderBottom: "1px solid #222", fontSize: 13 }}>

          project/{projectId}/index.js

        </div>



        <textarea

          value={code}

          onChange={(e) => setCode(e.target.value)}

          style={{

            flex: 1,

            width: "100%",

            background: "#111218",

            color: "#d8d8d8",

            border: "none",

            outline: "none",

            padding: 12,

            fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",

            fontSize: 14,

            resize: "none",

          }}

        />



        <div style={{ display: "flex", gap: 8, padding: 10, borderTop: "1px solid #222" }}>

          <input

            value={terminalInput}

            onChange={(e) => setTerminalInput(e.target.value)}

            style={{

              flex: 1,

              background: "#0f1015",

              color: "#eee",

              border: "1px solid #2a2a2a",

              padding: "8px 10px",

              borderRadius: 6,

            }}

          />

          <button

            onClick={runCommand}

            disabled={isRunning}

            style={{

              background: "#26ff00",

              color: "#000",

              border: "none",

              borderRadius: 6,

              padding: "8px 14px",

              fontWeight: 700,

              cursor: "pointer",

            }}

          >

            {isRunning ? "Running..." : "Run"}

          </button>

        </div>

      </div>



      {/* RIGHT */}

      <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>

        <div style={{ display: "flex", borderBottom: "1px solid #222" }}>

          {(["console", "preview", "publish"] as const).map((tab) => (

            <button

              key={tab}

              onClick={() => setActiveTab(tab)}

              style={{

                flex: 1,

                padding: "10px 8px",

                textTransform: "capitalize",

                background: activeTab === tab ? "#1a1d26" : "#0f1117",

                color: "#eaeaea",

                border: "none",

                borderRight: "1px solid #222",

                cursor: "pointer",

              }}

            >

              {tab}

            </button>

          ))}

        </div>



        {activeTab === "console" && (

          <pre

            style={{

              margin: 0,

              padding: 12,

              whiteSpace: "pre-wrap",

              fontSize: 13,

              flex: 1,

              background: "#0a0a0d",

              color: "#a6f3a6",

              overflow: "auto",

            }}

          >

            {terminalOutput || "Console output will appear here..."}

          </pre>

        )}



        {activeTab === "preview" && (

          <div style={{ flex: 1, background: "#0a0a0d" }}>

            <iframe

              title="Live Preview"

              src={previewUrl}

              style={{ width: "100%", height: "100%", border: "none", background: "#fff" }}

            />

          </div>

        )}



        {activeTab === "publish" && (

          <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 10 }}>

            <label style={{ fontSize: 13 }}>Commit message</label>

            <input

              value={publishMessage}

              onChange={(e) => setPublishMessage(e.target.value)}

              style={{

                background: "#0f1015",

                color: "#eee",

                border: "1px solid #2a2a2a",

                padding: "8px 10px",

                borderRadius: 6,

              }}

            />

            <button

              onClick={publishToGitHub}

              disabled={isPublishing}

              style={{

                background: "#26ff00",

                color: "#000",

                border: "none",

                borderRadius: 6,

                padding: "10px 12px",

                fontWeight: 700,

                cursor: "pointer",

              }}

            >

              {isPublishing ? "Publishing..." : "Publish to GitHub"}

            </button>

          </div>

        )}

      </div>

    </div>

  );

}
