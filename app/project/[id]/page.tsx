"use client";



import { useEffect, useState } from "react";

import { useParams } from "next/navigation";

import Editor from "@monaco-editor/react";

import WebTerminal from "@/components/Terminal";

export default function ProjectPage() {

  const params = useParams();



  const projectId = params.id as string;



  const [code, setCode] = useState("");

  const [output, setOutput] = useState("");

  const [fileName, setFileName] = useState("index.js");



  // LOAD FILES

  async function loadFile() {

    try {

      const res = await fetch(

        `/api/files?projectId=${projectId}`

      );



      const files = await res.json();



      if (files.length > 0) {

        setCode(files[0].content);

        setFileName(files[0].name);

      }

    } catch (err) {

      console.error(err);

    }

  }



  // SAVE FILE

  async function saveFile(newCode: string) {

    try {

      await fetch("/api/files", {

        method: "POST",

        headers: {

          "Content-Type": "application/json",

        },

        body: JSON.stringify({

          projectId,

          name: fileName,

          content: newCode,

        }),

      });

    } catch (err) {

      console.error(err);

    }

  }



  // AUTO SAVE

  useEffect(() => {

    const timeout = setTimeout(() => {

      saveFile(code);

    }, 1000);



    return () => clearTimeout(timeout);

  }, [code]);



  useEffect(() => {

    loadFile();

  }, []);



  function runCode() {

    try {

      const logs: string[] = [];



      const originalLog = console.log;



      console.log = (...args) => {

        logs.push(args.join(" "));

      };



      eval(code);



      console.log = originalLog;



      setOutput(logs.join("\n"));

    } catch (err: any) {

      setOutput(err.toString());

    }

  }



  return (

    <div

      style={{

        display: "flex",

        height: "100vh",

        background: "#111",

      }}

    >

      {/* SIDEBAR */}

      <div

        style={{

          width: 180,

          borderRight: "1px solid #222",

          padding: 10,

          color: "white",

        }}

      >

        <h3>Files</h3>



        <div

          style={{

            marginTop: 10,

            padding: 8,

            background: "#1a1a1a",

            cursor: "pointer",

          }}

        >

          {fileName}

        </div>

      </div>



      {/* EDITOR */}

      <div

        style={{

          flex: 1,

          display: "flex",

          flexDirection: "column",

        }}

      >

        <Editor

          height="100%"

          theme="vs-dark"

          defaultLanguage="javascript"

          value={code}

          onChange={(value) => setCode(value || "")}

        />



        <button

          onClick={runCode}

          style={{

            height: 50,

            background: "#39ff14",

            border: "none",

            cursor: "pointer",

            fontWeight: "bold",

          }}

        >

          ▶ Run

        </button>

      </div>



      {/* OUTPUT */}

      <div

        style={{

          width: 400,

          borderLeft: "1px solid #222",

          padding: 10,

          background: "black",

          color: "white",

          overflow: "auto",

        }}

      >

        <h3>Output</h3>



        <pre>{output}</pre>

      </div>

<div style={{ marginTop: 20 }}>

  <WebTerminal />

</div>
    </div>

  );

}
