import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const { code } = await req.json();

    let output = "";
    const consoleLog = console.log;

    console.log = (...args) => {
      output += args.join(" ") + "\n";
    };

    try {
      eval(code);
    } catch (err: any) {
      output += "Error: " + err.message;
    }

    console.log = consoleLog;

    return NextResponse.json({ output });
  } catch (err) {
    return NextResponse.json({ error: "Run failed" }, { status: 500 });
  }
}