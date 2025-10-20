import { z } from "zod";
import { webSearch, webFetch, webExtract } from "./tools/web";

export type AgentEvent =
  | { type: "message"; data: { role: "assistant" | "user" | "tool"; content: string } }
  | { type: "replace_last"; data: { role: "assistant" | "user" | "tool"; content: string } };

const ToolSchema = z.discriminatedUnion("name", [
  z.object({ name: z.literal("web.search"), input: z.object({ query: z.string(), maxResults: z.number().optional() }) }),
  z.object({ name: z.literal("web.fetch"), input: z.object({ url: z.string().url() }) }),
  z.object({ name: z.literal("web.extract"), input: z.object({ url: z.string().url() }) })
]);

const ToolDescriptions = `
You have access to the following tools. When you need them, respond with a single JSON object matching the schema.

- web.search: Search the web. input: { query: string, maxResults?: number }
- web.fetch: Fetch a URL and return raw text. input: { url: string }
- web.extract: Fetch a URL and extract main article text. input: { url: string }

Rules:
- Prefer web.search first to find sources. Then use web.extract on promising results.
- Keep citations: when using sources, reference them as [title](url).
- If you have enough information, respond with your final answer in plain text (no JSON).
- If you need a tool, respond with ONLY the JSON. No commentary.
JSON schema: { "name": string, "input": object }
`;

const SYSTEM_PROMPT = `You are an autonomous AI agent that plans and executes steps to achieve the user's goal efficiently. You can research, write, code, analyze, and communicate. Use the provided tools when needed. Work step-by-step, be concise, and produce a high-quality final result with sources when relevant.`;

async function callOpenAI(messages: Array<{ role: "system" | "user" | "assistant"; content: string }>): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY not set");
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages,
      temperature: 0.2
    })
  });
  if (!res.ok) throw new Error(`OpenAI error: ${res.status}`);
  const data = await res.json();
  const text = data.choices?.[0]?.message?.content as string;
  return text || "";
}

export async function runAgent(goal: string, maxSteps: number, emit: (evt: AgentEvent) => void) {
  const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: `Goal: ${goal}\n\nTools:\n${ToolDescriptions}` }
  ];

  // Initial acknowledgement
  emit({ type: "message", data: { role: "assistant", content: "Thinking..." } });

  for (let step = 0; step < Math.max(1, maxSteps); step++) {
    const reply = await callOpenAI(messages);

    // Try parse as tool call JSON
    let toolCall: z.infer<typeof ToolSchema> | null = null;
    try {
      const firstLine = reply.trim().split("\n")[0];
      const maybeJson = reply.trim().startsWith("{") ? reply.trim() : firstLine;
      const parsed = JSON.parse(maybeJson);
      toolCall = ToolSchema.parse(parsed);
    } catch {
      toolCall = null;
    }

    if (toolCall) {
      // Show tool call in UI
      emit({ type: "replace_last", data: { role: "assistant", content: `Using ${toolCall.name}...` } });
      emit({ type: "message", data: { role: "tool", content: `${toolCall.name} ${JSON.stringify(toolCall.input)}` } });

      // Execute tool
      try {
        switch (toolCall.name) {
          case "web.search": {
            const { query, maxResults } = toolCall.input as any;
            const results = await webSearch(query, maxResults ?? 5);
            const summary = results.map((r, i) => `${i + 1}. ${r.title} — ${r.url}${r.snippet ? `\n   ${r.snippet}` : ""}`).join("\n");
            messages.push({ role: "assistant", content: reply });
            messages.push({ role: "user", content: `Tool result for web.search:\n${summary}` });
            emit({ type: "message", data: { role: "assistant", content: "Processing results..." } });
            break;
          }
          case "web.fetch": {
            const { url } = toolCall.input as any;
            const result = await webFetch(url);
            const text = result.text.slice(0, 4000);
            messages.push({ role: "assistant", content: reply });
            messages.push({ role: "user", content: `Tool result for web.fetch (${result.status} ${result.contentType}):\n${text}` });
            emit({ type: "message", data: { role: "assistant", content: "Fetched content." } });
            break;
          }
          case "web.extract": {
            const { url } = toolCall.input as any;
            const result = await webExtract(url);
            const text = result.text.slice(0, 4000);
            messages.push({ role: "assistant", content: reply });
            messages.push({ role: "user", content: `Tool result for web.extract from ${result.title} (${result.url}):\n${text}` });
            emit({ type: "message", data: { role: "assistant", content: "Extracted article." } });
            break;
          }
        }
      } catch (err: any) {
        messages.push({ role: "assistant", content: reply });
        messages.push({ role: "user", content: `Tool error: ${err?.message || String(err)}` });
        emit({ type: "message", data: { role: "assistant", content: "Tool failed, recovering..." } });
      }
      continue;
    }

    // No tool call: assume final answer
    emit({ type: "replace_last", data: { role: "assistant", content: reply } });
    return;
  }

  // If loop exhausted, ask model for final summary
  messages.push({ role: "user", content: "Please provide a concise final answer now." });
  const final = await callOpenAI(messages);
  emit({ type: "replace_last", data: { role: "assistant", content: final } });
}
