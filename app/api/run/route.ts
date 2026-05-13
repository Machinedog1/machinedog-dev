import { NextRequest, NextResponse } from "next/server";

import { exec } from "node:child_process";

import { promisify } from "node:util";



const execAsync = promisify(exec);



export const runtime = "nodejs";



type RunRequestBody = {

  command?: string;

  cwd?: string;

  timeoutMs?: number;

};



function normalizeError(error: unknown): string {

  if (error instanceof Error) return error.message;

  return "Unknown error";

}



function isSafeCommand(command: string): boolean {

  const allowedPrefixes = [

    "npm ",

    "node ",

    "npx ",

    "pnpm ",

    "yarn ",

    "ls",

    "pwd",

    "cat ",

    "echo ",

  ];



  return allowedPrefixes.some(

    (prefix) => command === prefix.trim() || command.startsWith(prefix)

  );

}



export async function POST(req: NextRequest): Promise<Response> {

  try {

    const body = (await req.json()) as RunRequestBody;



    const command = (body.command ?? "").trim();

    const cwd = (body.cwd ?? process.cwd()).trim();

    const timeoutMs = Number.isFinite(body.timeoutMs)

      ? Number(body.timeoutMs)

      : 30_000;



    if (!command) {

      return NextResponse.json(

        { ok: false, error: "Missing command" },

        { status: 400 }

      );

    }



    if (!isSafeCommand(command)) {

      return NextResponse.json(

        { ok: false, error: "Command not allowed" },

        { status: 403 }

      );

    }



    const { stdout, stderr } = await execAsync(command, {

      cwd,

      timeout: timeoutMs,

      maxBuffer: 1024 * 1024 * 4,

      env: process.env,

    });



    return NextResponse.json({

      ok: true,

      command,

      cwd,

      stdout: stdout ?? "",

      stderr: stderr ?? "",

      exitCode: 0,

    });

  } catch (error: unknown) {

    return NextResponse.json(

      {

        ok: false,

        error: normalizeError(error),

      },

      { status: 500 }

    );

  }

}
