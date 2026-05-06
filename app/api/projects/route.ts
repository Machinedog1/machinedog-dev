import { NextResponse } from "next/server";

import { PrismaClient } from "@prisma/client";



const prisma = new PrismaClient();



export async function GET() {

  try {

    const projects = await prisma.project.findMany({

      orderBy: {

        createdAt: "desc",

      },

    });



    return NextResponse.json(projects);

  } catch (err) {

    console.error("GET PROJECTS ERROR:", err);



    return NextResponse.json([], {

      status: 500,

    });

  }

}



export async function POST(req: Request) {

  try {

    const body = await req.json();



    const project = await prisma.project.create({

      data: {

        name: body.name || "Untitled Project",

        userEmail: "demo@machinedog.dev",

      },

    });



    return NextResponse.json(project);

  } catch (err) {

    console.error("CREATE PROJECT ERROR:", err);



    return NextResponse.json(

      { error: "Failed to create project" },

      { status: 500 }

    );

  }

}
