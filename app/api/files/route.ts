import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// GET files for a project
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const projectId = searchParams.get("projectId");

    if (!projectId) {
      return NextResponse.json({ error: "Missing projectId" }, { status: 400 });
    }

    const files = await prisma.file.findMany({
      where: { projectId },
    });

    return NextResponse.json(files);
  } catch (err) {
    console.error("GET FILES ERROR:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

// CREATE or UPDATE file
export async function POST(req: Request) {
  try {
    const { projectId, name, content } = await req.json();

    if (!projectId || !name) {
      return NextResponse.json({ error: "Missing data" }, { status: 400 });
    }

    let file = await prisma.file.findFirst({
      where: { projectId, name },
    });

    if (file) {
      file = await prisma.file.update({
        where: { id: file.id },
        data: { content },
      });
    } else {
      file = await prisma.file.create({
        data: {
          projectId,
          name,
          content: content || "",
        },
      });
    }

    return NextResponse.json(file);
  } catch (err) {
    console.error("POST FILE ERROR:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}