"use client";

// Matter chat panel — opens as a right-side sheet from the case detail.
// Persistent: whatever Marc wrote yesterday, Gabriel sees today.
//
// Shortcut: Cmd+J (or Ctrl+J on Windows) from anywhere inside /casos/[id]
// opens the panel. The Cmd+K shortcut stays for the global command palette.
//
// Streaming: the v1 returns the full assistant response after Anthropic
// finishes. Streaming will come in a follow-up — for now the wait is
// typically 2-6 seconds with Sonnet, acceptable.

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  Bot,
  Copy,
  Loader2,
  Send,
  Sparkles,
  User,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,

  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import {
  loadChatHistory,
  sendChatMessageAction,
} from "@/app/_actions/matter-chat/send";
import { generateDocFromChatAction } from "@/app/_actions/matter-chat/generate-doc";

type ToolUse = {
  id: string;
  name: string;
  input: unknown;
  // Generated document state (after the user clicks "Generar").
  generated?: { documentId: string; downloadUrl: string };
  generating?: boolean;
};

type ChatMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  createdAt: Date;
  toolUses?: ToolUse[];
};

export function MatterChatPanel({
  caseId,
  caseCode,
  caseTitle,
  aiEnabled,
  initialStats,
  trigger,
}: {
  caseId: string;
  caseCode: string;
  caseTitle: string;
  aiEnabled: boolean;
  initialStats: {
    docCount: number;
    eventCount: number;
    noteCount: number;
    timeEntryCount: number;
  };
  trigger?: ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Cmd+J / Ctrl+J anywhere inside the page opens the panel.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "j") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Load history once when the panel opens. Subsequent opens reuse what's
  // already in state (refreshed manually with the Reload button or after
  // sending a message).
  useEffect(() => {
    if (!open || historyLoaded) return;
    let cancelled = false;
    setLoading(true);
    loadChatHistory(caseId)
      .then((rows) => {
        if (cancelled) return;
        setMessages(
          rows.map((r) => ({
            id: r.id,
            role: r.role,
            content: r.content,
            createdAt: new Date(r.createdAt),
          })),
        );
        setHistoryLoaded(true);
      })
      .catch(() => {
        toast.error("No se pudo cargar el historial del chat.");
      })
      .finally(() => setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [open, historyLoaded, caseId]);

  // Auto-scroll to bottom when messages change or panel opens.
  useEffect(() => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, sending, open]);

  // Auto-focus input when panel opens.
  useEffect(() => {
    if (open) {
      setTimeout(() => textareaRef.current?.focus(), 100);
    }
  }, [open]);

  async function handleSend() {
    const text = input.trim();
    if (!text || sending) return;
    if (!aiEnabled) {
      toast.error("La IA no está configurada en este firm.");
      return;
    }
    setSending(true);
    // Optimistic: muestra el mensaje del usuario inmediatamente.
    const userMsg: ChatMessage = {
      id: `tmp-${Date.now()}`,
      role: "user",
      content: text,
      createdAt: new Date(),
    };
    setMessages((cur) => [...cur, userMsg]);
    setInput("");

    try {
      const result = await sendChatMessageAction({ caseId, message: text });
      if (!result.ok) {
        toast.error(result.error);
        // Roll back the optimistic user message.
        setMessages((cur) => cur.filter((m) => m.id !== userMsg.id));
        return;
      }
      // Replace optimistic + append assistant with its tool uses (so the
      // chat can render generate_document / create_event cards inline).
      setMessages((cur) => {
        const withoutTmp = cur.filter((m) => m.id !== userMsg.id);
        return [
          ...withoutTmp,
          {
            id: `user-${result.assistantMessageId}-prev`,
            role: "user",
            content: text,
            createdAt: new Date(),
          },
          {
            id: result.assistantMessageId,
            role: "assistant",
            content: result.assistantText,
            createdAt: new Date(),
            toolUses: result.toolUses,
          },
        ];
      });
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error inesperado.");
      setMessages((cur) => cur.filter((m) => m.id !== userMsg.id));
    } finally {
      setSending(false);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // Enter to send. Shift+Enter for newline.
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  // Confirm "Generate" click on a generate_document tool card.
  async function handleGenerateDoc(messageId: string, toolUseId: string) {
    const msg = messages.find((m) => m.id === messageId);
    const use = msg?.toolUses?.find((t) => t.id === toolUseId);
    if (!msg || !use) return;
    const inp = use.input as {
      documentType?: string;
      title?: string;
      bodyMarkdown?: string;
    };
    if (!inp.documentType || !inp.title || !inp.bodyMarkdown) {
      toast.error("La IA no proporcionó datos completos. Pídele que vuelva a intentar.");
      return;
    }
    // Mark "generating" in state.
    setMessages((cur) =>
      cur.map((m) =>
        m.id === messageId
          ? {
              ...m,
              toolUses: m.toolUses?.map((t) =>
                t.id === toolUseId ? { ...t, generating: true } : t,
              ),
            }
          : m,
      ),
    );
    try {
      const r = await generateDocFromChatAction({
        caseId,
        chatMessageId: messageId.startsWith("user-") ? undefined : messageId,
        documentType: inp.documentType,
        title: inp.title,
        bodyMarkdown: inp.bodyMarkdown,
        originalPrompt: msg.content,
      });
      if (!r.ok) {
        toast.error(r.error);
        setMessages((cur) =>
          cur.map((m) =>
            m.id === messageId
              ? {
                  ...m,
                  toolUses: m.toolUses?.map((t) =>
                    t.id === toolUseId ? { ...t, generating: false } : t,
                  ),
                }
              : m,
          ),
        );
        return;
      }
      // Mark generated.
      setMessages((cur) =>
        cur.map((m) =>
          m.id === messageId
            ? {
                ...m,
                toolUses: m.toolUses?.map((t) =>
                  t.id === toolUseId
                    ? {
                        ...t,
                        generating: false,
                        generated: { documentId: r.documentId, downloadUrl: r.downloadUrl },
                      }
                    : t,
                ),
              }
            : m,
        ),
      );
      toast.success("Documento generado y guardado en el expediente", {
        description: "Estado: pendiente de revisión humana.",
      });
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error inesperado.");
    }
  }

  const knownItems = [
    `${initialStats.docCount} ${initialStats.docCount === 1 ? "documento" : "documentos"}`,
    `${initialStats.eventCount} ${initialStats.eventCount === 1 ? "evento" : "eventos"}`,
    `${initialStats.noteCount} ${initialStats.noteCount === 1 ? "nota" : "notas"}`,
    `${initialStats.timeEntryCount} ${initialStats.timeEntryCount === 1 ? "tiempo" : "tiempos"}`,
  ].join(" · ");

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        {trigger ?? (
          <Button variant="outline" size="sm">
            <Sparkles className="h-4 w-4" />
            Asistente IA
          </Button>
        )}
      </SheetTrigger>
      <SheetContent className="flex w-full flex-col p-0 sm:max-w-xl">
        <SheetHeader className="border-b p-4">
          <SheetTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            Asistente del expediente
          </SheetTitle>
          <SheetDescription className="space-y-1">
            <span className="font-mono text-xs">{caseCode}</span>
            <span className="block text-xs">{caseTitle}</span>
            <span className="block pt-1 text-[11px]">
              La IA conoce: {knownItems}
            </span>
          </SheetDescription>
          {!aiEnabled ? (
            <Badge variant="warning" className="mt-2 self-start">
              IA no configurada
            </Badge>
          ) : null}
        </SheetHeader>

        {/* Messages */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Cargando historial…
            </div>
          ) : messages.length === 0 ? (
            <EmptyState aiEnabled={aiEnabled} />
          ) : (
            <ul className="space-y-3">
              {messages.map((m) => (
                <ChatBubble key={m.id} message={m} onGenerate={handleGenerateDoc} />
              ))}
              {sending ? (
                <li className="flex items-start gap-2">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10">
                    <Bot className="h-3.5 w-3.5 text-primary" />
                  </div>
                  <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm">
                    <Loader2 className="inline h-3 w-3 animate-spin" /> Pensando…
                  </div>
                </li>
              ) : null}
            </ul>
          )}
        </div>

        {/* Composer */}
        <div className="border-t bg-background p-3">
          <div className="flex items-end gap-2">
            <Textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.currentTarget.value)}
              onKeyDown={onKeyDown}
              disabled={!aiEnabled || sending}
              placeholder={
                aiEnabled
                  ? "Pregúntale sobre el expediente o pídele que prepare un documento…"
                  : "Configura ANTHROPIC_API_KEY para activar el asistente."
              }
              rows={3}
              className="resize-none"
              maxLength={8000}
            />
            <Button
              type="button"
              onClick={handleSend}
              disabled={!aiEnabled || sending || !input.trim()}
              size="icon"
              className="h-9 w-9 shrink-0"
              aria-label="Enviar"
            >
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>
          <p className="mt-2 text-[10px] text-muted-foreground">
            Enter envía · Shift+Enter nueva línea · Cmd/Ctrl+J para abrir/cerrar
          </p>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function ChatBubble({
  message,
  onGenerate,
}: {
  message: ChatMessage;
  onGenerate?: (messageId: string, toolUseId: string) => void;
}) {
  const isUser = message.role === "user";
  const isAssistant = message.role === "assistant";

  function copyContent() {
    navigator.clipboard.writeText(message.content).then(
      () => toast.success("Copiado al portapapeles"),
      () => toast.error("No se pudo copiar"),
    );
  }

  return (
    <li className={`flex items-start gap-2 ${isUser ? "flex-row-reverse" : ""}`}>
      <div
        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
          isUser ? "bg-primary text-primary-foreground" : "bg-primary/10"
        }`}
      >
        {isUser ? (
          <User className="h-3.5 w-3.5" />
        ) : (
          <Bot className="h-3.5 w-3.5 text-primary" />
        )}
      </div>
      <div
        className={`group max-w-[80%] rounded-md border px-3 py-2 text-sm ${
          isUser ? "bg-primary/5" : "bg-muted/30"
        }`}
      >
        {message.content ? (
          <div className="whitespace-pre-wrap leading-relaxed">{message.content}</div>
        ) : null}
        {message.toolUses?.map((tu) => (
          <ToolUseCard
            key={tu.id}
            messageId={message.id}
            use={tu}
            onGenerate={onGenerate}
          />
        ))}
        {isAssistant ? (
          <div className="mt-2 flex items-center gap-2 opacity-0 transition-opacity group-hover:opacity-100">
            <button
              type="button"
              onClick={copyContent}
              className="inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground"
              aria-label="Copiar mensaje"
            >
              <Copy className="h-3 w-3" />
              Copiar
            </button>
            <span className="text-[10px] text-muted-foreground">
              {message.createdAt.toLocaleTimeString("es-DO", { hour: "2-digit", minute: "2-digit" })}
            </span>
          </div>
        ) : null}
      </div>
    </li>
  );
}

function ToolUseCard({
  messageId,
  use,
  onGenerate,
}: {
  messageId: string;
  use: ToolUse;
  onGenerate?: (messageId: string, toolUseId: string) => void;
}) {
  if (use.name === "generate_document") {
    const inp = use.input as {
      documentType?: string;
      title?: string;
      bodyMarkdown?: string;
      summary?: string;
    };
    const wordCount = inp.bodyMarkdown ? inp.bodyMarkdown.split(/\s+/).length : 0;
    return (
      <div className="mt-3 rounded-md border bg-background p-3">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="rounded bg-primary/10 px-1.5 py-0.5 font-medium text-primary">
            📄 Documento propuesto
          </span>
          <span>{inp.documentType ?? "desconocido"}</span>
          <span className="ml-auto">~{wordCount} palabras</span>
        </div>
        <p className="mt-2 text-sm font-medium">{inp.title ?? "(sin título)"}</p>
        {inp.summary ? (
          <p className="mt-1 text-xs text-muted-foreground">{inp.summary}</p>
        ) : null}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {use.generated ? (
            <>
              <a
                href={use.generated.downloadUrl}
                target="_blank"
                rel="noopener"
                className="inline-flex h-7 items-center gap-1 rounded-md border bg-primary px-2 text-xs font-medium text-primary-foreground hover:bg-primary/90"
              >
                Descargar .docx
              </a>
              <span className="text-[11px] text-muted-foreground">
                Guardado en pestaña Documentos como “pendiente de revisión”.
              </span>
            </>
          ) : use.generating ? (
            <div className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" /> Generando .docx…
            </div>
          ) : (
            <Button
              type="button"
              size="sm"
              onClick={() => onGenerate?.(messageId, use.id)}
            >
              Generar .docx
            </Button>
          )}
        </div>
      </div>
    );
  }

  // create_event card — Bloque 3 wires the action. For now we show the
  // proposed event so the user knows what the assistant intends to do.
  if (use.name === "create_event") {
    const inp = use.input as {
      eventType?: string;
      title?: string;
      startAtIso?: string;
      durationMinutes?: number;
      location?: string;
    };
    return (
      <div className="mt-3 rounded-md border bg-background p-3">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="rounded bg-amber-500/10 px-1.5 py-0.5 font-medium text-amber-700 dark:text-amber-400">
            📅 Evento propuesto
          </span>
          <span>{inp.eventType ?? "evento"}</span>
        </div>
        <p className="mt-2 text-sm font-medium">{inp.title ?? "(sin título)"}</p>
        <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
          {inp.startAtIso ? (
            <li>📆 {new Date(inp.startAtIso).toLocaleString("es-DO")}</li>
          ) : null}
          {inp.durationMinutes ? <li>⏱ {inp.durationMinutes} minutos</li> : null}
          {inp.location ? <li>📍 {inp.location}</li> : null}
        </ul>
        <p className="mt-2 text-[11px] text-muted-foreground">
          Confirmá en el chat para crearlo en el calendario.
        </p>
      </div>
    );
  }

  // Fallback for unknown tools — keeps the UI from breaking when we add
  // new tools server-side before the client supports them.
  return (
    <div className="mt-3 rounded-md border bg-muted/40 p-2 text-[11px] text-muted-foreground">
      Acción solicitada: <code>{use.name}</code>
    </div>
  );
}

function EmptyState({ aiEnabled }: { aiEnabled: boolean }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
      <div className="grid h-12 w-12 place-items-center rounded-full bg-primary/10">
        <Sparkles className="h-5 w-5 text-primary" />
      </div>
      <p className="text-sm font-medium">
        {aiEnabled ? "Asistente del expediente" : "IA no disponible"}
      </p>
      <p className="max-w-sm text-xs text-muted-foreground">
        {aiEnabled
          ? "La IA ya conoce todo lo del expediente: cliente, partes, documentos, eventos, tiempos. Pregúntale lo que necesites."
          : "Configura ANTHROPIC_API_KEY en el servidor para habilitar el asistente. La app sigue funcionando normal sin esto."}
      </p>
      {aiEnabled ? (
        <div className="mt-2 grid w-full gap-2 sm:grid-cols-2">
          <SampleQuestion label="¿Cuál es el estado actual del caso?" />
          <SampleQuestion label="Resume las últimas actuaciones." />
          <SampleQuestion label="¿Hay documentos pendientes de revisión?" />
          <SampleQuestion label="¿Cuándo es la próxima audiencia?" />
        </div>
      ) : null}
    </div>
  );
}

function SampleQuestion({ label }: { label: string }) {
  return (
    <div className="rounded-md border bg-muted/20 px-2 py-2 text-left text-[11px] text-muted-foreground">
      &ldquo;{label}&rdquo;
    </div>
  );
}
