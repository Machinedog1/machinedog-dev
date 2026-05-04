import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";

export async function GET() {
  const session = await getServerSession();

  if (!session?.user?.email) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const projects = await prisma.project.findMany({
    where: { userEmail: session.user.email },
    orderBy: { createdAt: "desc" },
  });

  return Response.json(projects);
}

export async function POST(req: Request) {
  const session = await getServerSession();

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
}