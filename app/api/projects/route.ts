import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../auth/[...nextauth]/route";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.email) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const projects = await prisma.project.findMany({
      where: { userEmail: session.user.email },
      orderBy: { createdAt: "desc" },
    });

    return Response.json(projects);
  } catch (error) {
    console.error("GET /api/projects error:", error);
    return Response.json({ error: "Server error" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.email) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();

    const project = await prisma.project.create({
      data: {
        name: body.name,
        userEmail: session.user.email,
      },
    });

    return Response.json(project);
  } catch (error) {
    console.error("POST /api/projects error:", error);
    return Response.json({ error: "Server error" }, { status: 500 });
  }
}