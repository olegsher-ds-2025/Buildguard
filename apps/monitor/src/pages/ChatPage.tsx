import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { api } from "../api";

export function ChatPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const queryClient = useQueryClient();
  const [question, setQuestion] = useState("");

  const messages = useQuery({
    queryKey: ["chat-messages", projectId],
    queryFn: () => api.listChatMessages(projectId!),
    enabled: !!projectId,
  });

  const send = useMutation({
    mutationFn: (content: string) => api.sendChatMessage(projectId!, { content }),
    onSuccess: () => {
      setQuestion("");
      queryClient.invalidateQueries({ queryKey: ["chat-messages", projectId] });
    },
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!question.trim()) return;
    send.mutate(question.trim());
  }

  if (messages.isLoading) return <div className="page-loading">Loading chat…</div>;
  if (messages.isError) return <div className="page-error">Could not load the chat.</div>;

  return (
    <div className="wrap">
      <h1>Ask about this project</h1>
      <p className="sub">
        Answers are grounded in this project's real data (budget, milestones, findings) with citations — not a
        general-purpose assistant. Try "how much contingency is left?" or "what's the next milestone?".
      </p>

      <section className="section">
        <div className="card" style={{ display: "flex", flexDirection: "column", gap: ".75rem" }}>
          {messages.data?.length === 0 && <p className="hint">No messages yet — ask a question below.</p>}
          {messages.data?.map((m) => (
            <div
              key={m.id}
              style={{
                alignSelf: m.role === "user" ? "flex-end" : "flex-start",
                maxWidth: "75%",
                background: m.role === "user" ? "var(--primary, #2d6cdf)" : "#f1f1f1",
                color: m.role === "user" ? "#fff" : "#222",
                borderRadius: "0.75rem",
                padding: ".6rem .9rem",
              }}
            >
              <div>{m.content}</div>
              {m.citations.length > 0 && (
                <div style={{ marginTop: ".4rem", fontSize: ".8rem", opacity: 0.75 }}>
                  {m.citations.map((c, i) => (
                    <div key={i}>
                      📎 {c.documentTitle ?? "Source"}: {c.snippet}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>

        <form onSubmit={onSubmit} style={{ display: "flex", gap: ".6rem", marginTop: "1rem" }}>
          <input
            type="text"
            placeholder="Ask a question…"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            style={{ flex: 1 }}
          />
          <button type="submit" className="primary" disabled={send.isPending || !question.trim()}>
            {send.isPending ? "Asking…" : "Ask"}
          </button>
        </form>
      </section>
    </div>
  );
}
