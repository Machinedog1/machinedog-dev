import { anthropic } from "@workspace/integrations-anthropic-ai";

export const DEFAULT_MODEL = "claude-sonnet-4-5";

const SYSTEM_PROMPT = `You are Machinedog — a precise, senior-engineer AI assistant helping a vetted client.

Your output is consumed primarily by software developers. Optimize for:
- Clear, working code with proper imports.
- Concrete, actionable answers — no vague qualifiers.
- Code blocks fenced with the language tag.
- Brief explanations only where they aid understanding; otherwise lead with code.

When a request is ambiguous, make reasonable assumptions and state them.`;

export type RunPromptResult = {
  output: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  model: string;
};

export async function runClaudePrompt(prompt: string): Promise<RunPromptResult> {
  const response = await anthropic.messages.create({
    model: DEFAULT_MODEL,
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: prompt }],
  });

  const textBlocks = response.content.filter((c) => c.type === "text");
  const output = textBlocks.map((c) => (c.type === "text" ? c.text : "")).join("\n");

  const inputTokens = response.usage.input_tokens ?? 0;
  const outputTokens = response.usage.output_tokens ?? 0;
  const totalTokens = inputTokens + outputTokens;

  return {
    output,
    inputTokens,
    outputTokens,
    totalTokens,
    model: response.model,
  };
}
