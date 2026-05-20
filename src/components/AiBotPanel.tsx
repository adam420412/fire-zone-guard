import { useState, useRef, useEffect } from "react";
import { useLocation } from "react-router-dom";
import { Bot, X, Send, Trash2, ChevronDown, Loader2, CheckCircle2, XCircle, Zap, Sparkles } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useAiAgent, SUGGESTIONS_BY_PAGE, QUICK_AUTOMATIONS, type ChatMessage, type ProposedAction } from "@/hooks/useAiAgent";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";

// ─── Permission Modal ────────────────────────────────────────────────────────

function PermissionModal({
  action,
  onApprove,
  onReject,
}: {
  action: ProposedAction;
  onApprove: () => void;
  onReject: () => void;
}) {
  return (
    <Dialog open onOpenChange={(open) => { if (!open) onReject(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-primary" />
            Bot chce wykonać akcję
          </DialogTitle>
          <DialogDescription>
            Sprawdź szczegóły i zatwierdź lub odrzuć.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div className="rounded-lg border bg-muted/50 p-4 space-y-2">
            <p className="font-semibold text-sm">{action.label}</p>
            <p className="text-sm text-muted-foreground">{action.description}</p>
          </div>

          {Object.keys(action.data).length > 0 && (
            <div className="rounded-lg border p-3">
              <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide">Dane akcji</p>
              <div className="space-y-1">
                {Object.entries(action.data).map(([k, v]) => (
                  <div key={k} className="flex gap-2 text-sm">
                    <span className="text-muted-foreground min-w-[100px]">{k}:</span>
                    <span className="font-medium truncate">{String(v)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onReject} className="gap-2">
            <XCircle className="h-4 w-4" /> Anuluj
          </Button>
          <Button onClick={onApprove} className="gap-2">
            <CheckCircle2 className="h-4 w-4" /> Zatwierdź
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Message Bubble ──────────────────────────────────────────────────────────

function MessageBubble({
  msg,
  onApprove,
  onReject,
}: {
  msg: ChatMessage;
  onApprove: (id: string, action: ProposedAction) => void;
  onReject: (id: string) => void;
}) {
  const [showModal, setShowModal] = useState(false);
  const isUser = msg.role === "user";

  return (
    <div className={cn("flex flex-col gap-1", isUser ? "items-end" : "items-start")}>
      <div
        className={cn(
          "max-w-[88%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed",
          isUser
            ? "bg-primary text-primary-foreground rounded-br-sm"
            : "bg-muted text-foreground rounded-bl-sm",
        )}
      >
        {isUser ? (
          msg.content
        ) : (
          <div className="prose prose-sm dark:prose-invert max-w-none prose-p:my-1 prose-ul:my-1 prose-ol:my-1 prose-li:my-0 prose-headings:my-2 prose-headings:text-foreground prose-strong:text-foreground prose-a:text-primary">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
          </div>
        )}
      </div>

      {/* Action proposal */}
      {msg.action && msg.actionState === "pending" && (
        <div className="max-w-[85%] rounded-xl border-2 border-primary/20 bg-primary/5 p-3 space-y-2">
          <p className="text-xs font-semibold text-primary uppercase tracking-wide">Propozycja akcji</p>
          <p className="text-sm font-medium">{msg.action.label}</p>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => onReject(msg.id)} className="gap-1 h-7 text-xs">
              <XCircle className="h-3.5 w-3.5" /> Odrzuć
            </Button>
            <Button size="sm" onClick={() => {
              if (msg.action!.confirmationLevel === "hard") {
                setShowModal(true);
              } else {
                onApprove(msg.id, msg.action!);
              }
            }} className="gap-1 h-7 text-xs">
              <CheckCircle2 className="h-3.5 w-3.5" /> Zatwierdź
            </Button>
          </div>
        </div>
      )}

      {msg.action && msg.actionState === "approved" && (
        <p className="text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
          <CheckCircle2 className="h-3 w-3" /> Wykonano
        </p>
      )}
      {msg.action && msg.actionState === "rejected" && (
        <p className="text-xs text-muted-foreground flex items-center gap-1">
          <XCircle className="h-3 w-3" /> Odrzucono
        </p>
      )}

      {showModal && msg.action && (
        <PermissionModal
          action={msg.action}
          onApprove={() => { setShowModal(false); onApprove(msg.id, msg.action!); }}
          onReject={() => setShowModal(false)}
        />
      )}

      <span className="text-[10px] text-muted-foreground px-1">
        {msg.timestamp.toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" })}
      </span>
    </div>
  );
}

// ─── Main Panel ──────────────────────────────────────────────────────────────

export default function AiBotPanel() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const location = useLocation();

  const { messages, isLoading, sendMessage, approveAction, rejectAction, clearHistory } = useAiAgent();

  const suggestions = SUGGESTIONS_BY_PAGE[location.pathname] ?? SUGGESTIONS_BY_PAGE["/"];

  useEffect(() => {
    if (open) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open, messages]);

  const handleSend = () => {
    const text = input.trim();
    if (!text || isLoading) return;
    setInput("");
    sendMessage(text);
  };

  return (
    <>
      {/* Floating Button (left side) */}
      <button
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "fixed bottom-6 left-6 z-50 flex h-14 w-14 items-center justify-center rounded-full shadow-lg transition-all duration-300",
          "bg-primary text-primary-foreground hover:scale-110 active:scale-95",
          open && "rotate-12 scale-110",
        )}
        aria-label="Asystent AI"
      >
        {open ? <X className="h-6 w-6" /> : <Bot className="h-6 w-6" />}
        {/* Pulse ring when closed */}
        {!open && (
          <span className="absolute inset-0 rounded-full bg-primary animate-ping opacity-20" />
        )}
      </button>

      {/* Chat Panel (left side) */}
      <div
        className={cn(
          "fixed bottom-24 left-6 z-50 flex flex-col overflow-hidden rounded-2xl border bg-background shadow-2xl transition-all duration-300",
          "w-[360px] sm:w-[400px]",
          open ? "h-[560px] opacity-100 translate-y-0" : "h-0 opacity-0 translate-y-4 pointer-events-none",
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b bg-primary/5 px-4 py-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10">
              <Bot className="h-4 w-4 text-primary" />
            </div>
            <div>
              <p className="text-sm font-semibold">Asystent Fire Zone</p>
              <p className="text-[10px] text-muted-foreground">Pyta przed każdą akcją</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={clearHistory} title="Wyczyść historię">
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setOpen(false)}>
              <ChevronDown className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {messages.map((msg) => (
            <MessageBubble
              key={msg.id}
              msg={msg}
              onApprove={approveAction}
              onReject={rejectAction}
            />
          ))}

          {isLoading && (
            <div className="flex items-start">
              <div className="rounded-2xl rounded-bl-sm bg-muted px-4 py-3">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Suggestions */}
        {messages.length <= 1 && (
          <div className="border-t px-3 py-2 flex flex-wrap gap-1.5">
            {suggestions.map((s) => (
              <button
                key={s}
                onClick={() => sendMessage(s)}
                disabled={isLoading}
                className="rounded-full border bg-background px-2.5 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition-colors disabled:opacity-50"
              >
                {s}
              </button>
            ))}
          </div>
        )}

        {/* Input */}
        <div className="border-t p-3 flex gap-2">
          <Input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
            placeholder="Napisz wiadomość..."
            disabled={isLoading}
            className="text-sm"
          />
          <Button size="icon" onClick={handleSend} disabled={!input.trim() || isLoading} className="shrink-0">
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </>
  );
}
