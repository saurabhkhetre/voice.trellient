import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { MessageSquare, Search } from "lucide-react";

import { EmptyState, PageHeader, Panel, Pill } from "@/components/dashboard/Shell";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/dashboard/chat-history")({
  component: ChatHistoryPage,
});

// Demo data to make the page functional
const DEMO_CHATS = [
  { id: "1", contact: "Rajesh Kumar", channel: "WhatsApp", messages: 12, lastMessage: "Thank you, the quote looks good!", time: "2 hours ago", status: "resolved" },
  { id: "2", contact: "Priya Sharma", channel: "Web Chat", messages: 8, lastMessage: "Can I get a callback about this?", time: "5 hours ago", status: "pending" },
  { id: "3", contact: "Amit Patel", channel: "SMS", messages: 4, lastMessage: "What are your business hours?", time: "1 day ago", status: "resolved" },
  { id: "4", contact: "Sunita Verma", channel: "WhatsApp", messages: 15, lastMessage: "I need to reschedule my appointment.", time: "2 days ago", status: "escalated" },
];

function ChatHistoryPage() {
  const [selected, setSelected] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const filtered = DEMO_CHATS.filter(
    (c) =>
      c.contact.toLowerCase().includes(search.toLowerCase()) ||
      c.lastMessage.toLowerCase().includes(search.toLowerCase()),
  );

  const current = DEMO_CHATS.find((c) => c.id === selected);

  return (
    <div>
      <PageHeader title="Chat History" description="Logs of text-based interactions from web chat, WhatsApp, and SMS channels." />

      <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <div>
          {/* Search */}
          <div className="mb-4 flex items-center gap-2 rounded-[10px] border border-line bg-card px-3 py-2">
            <Search className="size-4 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search conversations…"
              className="min-w-0 flex-1 bg-transparent text-[0.88rem] outline-none"
            />
          </div>

          <Panel>
            {filtered.length === 0 ? (
              <EmptyState>No chats found.</EmptyState>
            ) : (
              <ul className="divide-y divide-line/70">
                {filtered.map((chat) => (
                  <li key={chat.id}>
                    <button
                      type="button"
                      onClick={() => setSelected(chat.id)}
                      className={cn(
                        "flex w-full flex-wrap items-center justify-between gap-3 px-5 py-4 text-left transition-colors hover:bg-secondary",
                        selected === chat.id && "bg-secondary",
                      )}
                    >
                      <div className="min-w-0">
                        <p className="text-[0.92rem] text-ink">{chat.contact}</p>
                        <p className="mt-0.5 text-[0.8rem] text-muted-foreground">
                          {chat.channel} · {chat.messages} messages · {chat.time}
                        </p>
                        <p className="mt-1 truncate text-[0.82rem] text-muted-foreground">{chat.lastMessage}</p>
                      </div>
                      <Pill
                        tone={chat.status === "resolved" ? "good" : chat.status === "escalated" ? "warn" : "neutral"}
                      >
                        {chat.status}
                      </Pill>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>

        <Panel className="min-h-[20rem]">
          {!current ? (
            <EmptyState>Select a conversation to view the chat log.</EmptyState>
          ) : (
            <div>
              <header className="border-b border-line px-5 py-4">
                <div className="flex items-center gap-2">
                  <MessageSquare className="size-4 text-muted-foreground" />
                  <p className="text-[0.72rem] uppercase tracking-[0.22em] text-muted-foreground">{current.channel}</p>
                </div>
                <h2 className="font-display mt-2 text-[1.25rem] tracking-tight text-ink">{current.contact}</h2>
                <p className="mt-1 text-[0.82rem] text-muted-foreground">
                  {current.messages} messages · Last active {current.time}
                </p>
              </header>
              <div className="space-y-4 px-5 py-5">
                {/* Simulated chat messages */}
                <div>
                  <p className="text-[0.7rem] uppercase tracking-[0.2em] text-muted-foreground">Contact</p>
                  <p className="mt-1 text-[0.94rem] leading-relaxed text-ink">Hi, I'd like to inquire about your services.</p>
                </div>
                <div>
                  <p className="text-[0.7rem] uppercase tracking-[0.2em] text-muted-foreground">Agent</p>
                  <p className="mt-1 text-[0.94rem] leading-relaxed text-ink">Hello! I'd be happy to help. What are you looking for?</p>
                </div>
                <div>
                  <p className="text-[0.7rem] uppercase tracking-[0.2em] text-muted-foreground">Contact</p>
                  <p className="mt-1 text-[0.94rem] leading-relaxed text-ink">{current.lastMessage}</p>
                </div>
              </div>
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}
