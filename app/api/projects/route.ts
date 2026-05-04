import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";

export async function GET() {
  try {
    const session = await getServerSession();

    console.log("SESSION:", session);

    if (!session?.user?.email) {
      return NextResponse.json([]);
    }

    const projects = await prisma.project.findMany({
      where: {
        userEmail: session.user.email,
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    return NextResponse.json(projects);
  } catch (error) {
    console.error("GET PROJECTS ERROR:", error);
    return NextResponse.json([]);
  }
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession();

    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();

    if (!body.name) {
      return NextResponse.json({ error: "Missing name" }, { status: 400 });
    }

    const project = await prisma.project.create({
      data: {
        name: body.name,
        userEmail: session.user.email,
      },
    });

    return NextResponse.json(project);
  } catch (error) {
    console.error("CREATE PROJECT ERROR:", error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}