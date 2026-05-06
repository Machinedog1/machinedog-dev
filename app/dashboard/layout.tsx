"use client";



import { useEffect, useState } from "react";

import { useRouter } from "next/navigation";

import { signOut } from "next-auth/react";



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

      console.error("Create project failed:", err);

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

        background: "#0d0d0d",

        color: "white",

      }}

    >

      {/* SIDEBAR */}

      <div

        style={{

          width: 250,

          borderRight: "1px solid #222",

          padding: 20,

          overflowY: "auto",

        }}

      >

        <h2>Projects</h2>



        <button

          onClick={createProject}

          style={{

            width: "100%",

            padding: 10,

            marginTop: 10,

            background: "#111",

            color: "white",

            border: "1px solid #333",

            cursor: "pointer",

          }}

        >

          + New Project

        </button>



        <div style={{ marginTop: 20 }}>

          {projects.map((p) => (

            <div

              key={p.id}

              onClick={() => router.push(`/project/${p.id}`)}

              style={{

                padding: 10,

                marginTop: 10,

                background: "#151515",

                border: "1px solid #222",

                cursor: "pointer",

              }}

            >

              {p.name}

            </div>

          ))}

        </div>



        <button

          onClick={() => signOut()}

          style={{

            width: "100%",

            padding: 10,

            marginTop: 20,

            background: "#550000",

            color: "white",

            border: "none",

            cursor: "pointer",

          }}

        >

          Logout

        </button>

      </div>



      {/* MAIN */}

      <div

        style={{

          flex: 1,

          overflow: "auto",

        }}

      >

        {children}

      </div>

    </div>

  );

}
