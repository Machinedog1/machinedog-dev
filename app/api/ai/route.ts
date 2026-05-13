import OpenAI from "openai";

import { NextResponse } from "next/server";



const client = new OpenAI({

  apiKey: process.env.OPENAI_API_KEY,

});



export async function POST(req: Request) {

  try {

    const body = await req.json();



    const completion = await client.chat.completions.create({

      model: "gpt-4.1-mini",

      messages: [

        {

          role: "system",

          content:

            "You are Machinedog AI, a powerful coding assistant inside a cloud IDE.",

        },

        {

          role: "user",

          content: body.message,

        },

      ],

    });



    return NextResponse.json({

      reply: completion.choices[0].message.content,

    });

  } catch (err) {

    console.error(err);



    return NextResponse.json(

      {

        error: "AI request failed",

      },

      { status: 500 }

    );

  }

}

