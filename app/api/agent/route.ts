import { NextRequest } from "next/server";
import { runAgent, type AgentEvent } from "../../../lib/agent";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const { goal, steps } = await req.json();
    if (!goal || typeof goal !== "string") {
      return new Response("Bad Request", { status: 400 });
    }
    const maxSteps = typeof steps === "number" ? Math.max(1, Math.min(steps, 20)) : 6;

    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const send = (evt: AgentEvent) => {
          controller.enqueue(encoder.encode(JSON.stringify(evt) + "\n"));
        };
        await runAgent(goal, maxSteps, send);
        controller.close();
      }
    });
    return new Response(stream, { headers: { "Content-Type": "application/x-ndjson" } });
  } catch (err: any) {
    return new Response(`Error: ${err?.message || String(err)}` as string, { status: 500 });
  }
}
