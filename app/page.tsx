"use client";
import { useState, useRef } from "react";

interface ChatMessage {
  role: "user" | "assistant" | "tool";
  content: string;
}

export default function Page() {
  const [goal, setGoal] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [running, setRunning] = useState(false);
  const [steps, setSteps] = useState(6);
  const logsRef = useRef<HTMLDivElement>(null);

  async function run() {
    setRunning(true);
    setMessages([]);
    const res = await fetch("/api/agent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ goal, steps })
    });
    if (!res.ok) {
      setMessages([{ role: "assistant", content: `Error: ${res.status}` }]);
      setRunning(false);
      return;
    }
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    const newMessages: ChatMessage[] = [];
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let idx;
      while ((idx = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 1);
        if (!line) continue;
        try {
          const evt = JSON.parse(line);
          if (evt.type === "message") newMessages.push(evt.data);
          if (evt.type === "replace_last") newMessages[newMessages.length - 1] = evt.data;
          setMessages([...newMessages]);
          logsRef.current?.scrollTo({ top: logsRef.current.scrollHeight });
        } catch {}
      }
    }
    setRunning(false);
  }

  return (
    <div className="container">
      <h1>Agentic Assistant</h1>
      <p className="badge">Autonomous agent: research, write, code, analyze, communicate</p>
      <div className="card" style={{ marginTop: 12 }}>
        <div className="row">
          <input className="input" placeholder="Enter your goal..."
            value={goal} onChange={e => setGoal(e.target.value)} />
          <input className="input" style={{ maxWidth: 110 }} type="number" min={1} max={20}
            value={steps} onChange={e => setSteps(parseInt(e.target.value || "6", 10))} />
          <button className="button" onClick={run} disabled={!goal || running}>{running ? "Running..." : "Run"}</button>
        </div>
      </div>

      <div className="card" style={{ marginTop: 12 }}>
        <h3>Conversation</h3>
        <div className="row" style={{ flexDirection: "column", gap: 10 }}>
          {messages.map((m, i) => (
            <div key={i} className={`message ${m.role}`}>{m.content}</div>
          ))}
        </div>
      </div>

      <div className="card" style={{ marginTop: 12 }}>
        <h3>Run log</h3>
        <div ref={logsRef} className="logs" style={{ maxHeight: 240, overflow: "auto" }}>
          {messages.filter(m => m.role === "tool").map((m, i) => (
            <div key={i} className="tool">{m.content}</div>
          ))}
        </div>
      </div>
    </div>
  );
}
