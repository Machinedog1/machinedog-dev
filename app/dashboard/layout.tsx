"use client";



import { useEffect, useState } from "react";

import { useRouter } from "next/navigation";

import { signOut } from "next-auth/react";



import WebTerminal from "@/components/Terminal";



export default function DashboardLayout({

  children,

}: {

  children: React.ReactNode;

}) {

  const [projects, setProjects] = useState<any[]>([]);

  const router = useRouter();



  async function loadProjects() {

    try {

      const res = await fetch("/api/projects");



      const data = await res.json();



      if (Array.isArray(data)) {

        setProjects(data);

      } else {

        console.error("Projects API error:", data);

        setProjects([]);

      }

    } catch (err) {

      console.error("Failed to load projects:", err);

      setProjects([]);

    }

  }



  async function createProject() {

    const name = prompt("Project name?");



    if (!name) return;



    try {

      const res = await fetch("/api/projects", {

        method: "POST",

        headers: {

          "Content-Type": "application/json",

        },

        body: JSON.stringify({ name }),

      });



      const project = await res.json();



      if (project?.id) {

        router.push(`/project/${project.id}`);

      } else {

        console.error("Project creation failed:", project);

      }

    } catch (err) {

      console.error("Create project error:", err);

    }

  }



  useEffect(() => {

    loadProjects();

  }, []);



  return (

    <div

      style={{

        display: "flex",

        height: "100vh",

        background: "#111",

        color: "white",

      }}

    >

      <div

        style={{

          width: "250px",

          background: "#000",

          padding: "20px",

          overflowY: "auto",

          borderRight: "1px solid #222",

        }}

      >

        <h2>Projects</h2>



        <button

          onClick={createProject}

          style={{

            marginTop: 10,

            padding: 10,

            width: "100%",

            background: "#00ff00",

            color: "#000",

            border: "none",

            cursor: "pointer",

            fontWeight: "bold",

          }}

        >

          + New Project

        </button>



        <button

          onClick={() => signOut()}

          style={{

            marginTop: 10,

            padding: 10,

            width: "100%",

            background: "#222",

            color: "#fff",

            border: "none",

            cursor: "pointer",

          }}

        >

          Logout

        </button>



        <div style={{ marginTop: 20 }}>

          {projects.map((p) => (

            <div

              key={p.id}

              style={{

                cursor: "pointer",

                marginTop: 10,

                padding: 10,

                background: "#111",

                border: "1px solid #222",

              }}

              onClick={() => router.push(`/project/${p.id}`)}

            >

              {p.name}

            </div>

          ))}

        </div>

      </div>



      <div

        style={{

          flex: 1,

          padding: 20,

          overflow: "auto",

        }}

      >

        {children}



        <div style={{ marginTop: 20 }}>

          <WebTerminal />

        </div>

      </div>

    </div>

  );

}
