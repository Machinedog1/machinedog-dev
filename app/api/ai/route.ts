import { NextRequest, NextResponse } from "next/server";

import OpenAI from "openai";



export const runtime = "nodejs";



type AiRequestBody = {

  prompt?: string;

  model?: string;

};



function getOpenAIClient(): OpenAI {

  const apiKey = process.env.OPENAI_API_KEY;



  if (!apiKey) {

    throw new Error("Missing OPENAI_API_KEY");

  }



  return new OpenAI({ apiKey });

}



export async function POST(req: NextRequest): Promise<Response> {

  try {

    const body = (await req.json()) as AiRequestBody;

    const prompt = (body.prompt ?? "").trim();

    const model = (body.model ?? "gpt-4o-mini").trim();



    if (!prompt) {

      return NextResponse.json(

        { ok: false, error: "prompt is required" },

        { status: 400 }

      );

    }



    const client = getOpenAIClient();



    const response = await client.responses.create({

      model,

      input: prompt,

    });



    return NextResponse.json({

      ok: true,

      model,

      output: response.output_text ?? "",

    });

  } catch (error: unknown) {

    const message =

      error instanceof Error ? error.message : "Unknown AI route error";



    if (message.includes("Missing OPENAI_API_KEY")) {

      return NextResponse.json(

        { ok: false, error: "AI is not configured on this environment." },

        { status: 500 }

      );

    }



    return NextResponse.json({ ok: false, error: message }, { status: 500 });

  }

}
