import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export async function POST(req: Request) {
  try {
    const body = await req.json();
    console.log("RUN BODY:", body);

    const { projectId } = body;

    if (!projectId) {
      return NextResponse.json({ error: "Missing projectId" }, { status: 400 });
    }

    const files = await prisma.file.findMany({
      where: { projectId },
    });

    console.log("FILES:", files);

    if (!files.length) {
      return NextResponse.json({ error: "No files found" });
    }

    const fileMap: Record<string, string> = {};

    files.forEach((f) => {
      fileMap[f.name] = f.content;
    });

    let output = "";

    const fakeConsole = {
      log: (...args: any[]) => {
        output += args.join(" ") + "\n";
      },
    };

    function customRequire(filename: string) {
      const code = fileMap[filename];

      if (!code) {
        throw new Error(`File not found: ${filename}`);
      }

      const module = { exports: {} };

      const func = new Function(
        "require",
        "module",
        "exports",
        "console",
        code
      );

      func(customRequire, module, module.exports, fakeConsole);

      return module.exports;
    }

    if (!fileMap["index.js"]) {
      return NextResponse.json({ error: "index.js not found" });
    }

    customRequire("index.js");

    return NextResponse.json({ output });

  } catch (err: any) {
    console.error("RUN ERROR:", err);
    return NextResponse.json({ error: err.message });
  }
}