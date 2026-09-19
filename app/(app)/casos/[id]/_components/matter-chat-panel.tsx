"use client";

// Matter chat panel, opens as a right-side sheet from the case detail.
// Persistent: whatever Marc wrote yesterday, Gabriel sees today.
//
// Shortcut: Cmd+J (or Ctrl+J on Windows) from anywhere inside /casos/[id]
// opens the panel. The Cmd+K shortcut stays for the global command palette.
//
// Streaming: the v1 returns the full assistant response after Anthropic
// finishes. Streaming will come in a follow-up, for now the wait is
// typically 2-6 seconds with Sonnet, acceptable.

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
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
import { createEventFromChatAction } from "@/app/_actions/matter-chat/create-event";
import {
  cancelEventFromChatAction,
  updateEventFromChatAction,
} from "@/app/_actions/matter-chat/update-event";
import { sendEmailFromChatAction } from "@/app/_actions/matter-chat/send-email";
import { useModKey } from "@/lib/hooks/use-platform";

type ToolUse = {
  id: string;
  name: string;
  input: unknown;
  // Generated document state (after the user clicks "Generar").
  generated?: { documentId: string; downloadUrl: string };
  generating?: boolean;
  // Event creation state (after the user clicks "Crear evento").
  eventCreated?: { eventId: string; alertCount: number };
  creating?: boolean;
  // update_event / cancel_event / send_email: one-shot success flag.
  done?: boolean;
  // send_email: id del registro en sent_emails.
  sentEmailId?: string;
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
  const mod = useModKey();
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

  // Confirm "Crear evento" click on a create_event tool card.
  async function handleCreateEvent(messageId: string, toolUseId: string) {
    const msg = messages.find((m) => m.id === messageId);
    const use = msg?.toolUses?.find((t) => t.id === toolUseId);
    if (!msg || !use) return;
    const inp = use.input as {
      eventType?: string;
      title?: string;
      description?: string;
      startAtIso?: string;
      durationMinutes?: number;
      location?: string;
    };
    if (!inp.eventType || !inp.title || !inp.startAtIso) {
      toast.error("La IA no proporcionó datos completos. Pídele que vuelva a intentar.");
      return;
    }
    setMessages((cur) =>
      cur.map((m) =>
        m.id === messageId
          ? {
              ...m,
              toolUses: m.toolUses?.map((t) =>
                t.id === toolUseId ? { ...t, creating: true } : t,
              ),
            }
          : m,
      ),
    );
    try {
      const r = await createEventFromChatAction({
        caseId,
        chatMessageId: messageId.startsWith("user-") ? undefined : messageId,
        eventType: inp.eventType as
          | "audiencia"
          | "plazo_procesal"
          | "reunion_cliente"
          | "reunion_interna"
          | "vencimiento_administrativo"
          | "recordatorio",
        title: inp.title,
        description: inp.description,
        startAtIso: inp.startAtIso,
        durationMinutes: inp.durationMinutes,
        location: inp.location,
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
                    t.id === toolUseId ? { ...t, creating: false } : t,
                  ),
                }
              : m,
          ),
        );
        return;
      }
      setMessages((cur) =>
        cur.map((m) =>
          m.id === messageId
            ? {
                ...m,
                toolUses: m.toolUses?.map((t) =>
                  t.id === toolUseId
                    ? {
                        ...t,
                        creating: false,
                        eventCreated: { eventId: r.eventId, alertCount: r.alertCount },
                      }
                    : t,
                ),
              }
            : m,
        ),
      );
      toast.success("Evento creado", {
        description: `${r.alertCount} alerta(s) programada(s).`,
      });
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error inesperado.");
    }
  }

  // Confirm "Enviar" click on a send_email tool card.
  async function handleSendEmail(messageId: string, toolUseId: string) {
    const msg = messages.find((m) => m.id === messageId);
    const use = msg?.toolUses?.find((t) => t.id === toolUseId);
    if (!msg || !use) return;
    const inp = use.input as {
      to?: Array<{ email: string; name?: string }>;
      cc?: Array<{ email: string; name?: string }>;
      subject?: string;
      bodyHtml?: string;
      attachDocumentIds?: string[];
    };
    if (!inp.to || inp.to.length === 0 || !inp.subject || !inp.bodyHtml) {
      toast.error("La IA no proporcionó destinatarios/asunto/cuerpo. Pedile que reintente.");
      return;
    }
    setMessages((cur) =>
      cur.map((m) =>
        m.id === messageId
          ? { ...m, toolUses: m.toolUses?.map((t) => (t.id === toolUseId ? { ...t, creating: true } : t)) }
          : m,
      ),
    );
    try {
      const r = await sendEmailFromChatAction({
        caseId,
        chatMessageId: messageId.startsWith("user-") ? undefined : messageId,
        to: inp.to,
        cc: inp.cc,
        subject: inp.subject,
        bodyHtml: inp.bodyHtml,
        originalPrompt: msg.content,
        attachDocumentIds: inp.attachDocumentIds,
      });
      if (!r.ok) {
        toast.error(r.error);
        setMessages((cur) =>
          cur.map((m) =>
            m.id === messageId
              ? { ...m, toolUses: m.toolUses?.map((t) => (t.id === toolUseId ? { ...t, creating: false } : t)) }
              : m,
          ),
        );
        return;
      }
      setMessages((cur) =>
        cur.map((m) =>
          m.id === messageId
            ? {
                ...m,
                toolUses: m.toolUses?.map((t) =>
                  t.id === toolUseId
                    ? { ...t, creating: false, done: true, sentEmailId: r.sentEmailId }
                    : t,
                ),
              }
            : m,
        ),
      );
      toast.success("Correo enviado", {
        description: `${inp.to.length} destinatario(s), copia guardada en Outlook.`,
      });
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error inesperado.");
    }
  }

  // Confirm "Reagendar" click on an update_event tool card.
  async function handleUpdateEvent(messageId: string, toolUseId: string) {
    const msg = messages.find((m) => m.id === messageId);
    const use = msg?.toolUses?.find((t) => t.id === toolUseId);
    if (!msg || !use) return;
    const inp = use.input as {
      eventId?: string;
      startAtIso?: string;
      durationMinutes?: number;
      title?: string;
      location?: string;
      reason?: string;
    };
    if (!inp.eventId) {
      toast.error("Falta el ID del evento.");
      return;
    }
    setMessages((cur) =>
      cur.map((m) =>
        m.id === messageId
          ? { ...m, toolUses: m.toolUses?.map((t) => (t.id === toolUseId ? { ...t, creating: true } : t)) }
          : m,
      ),
    );
    try {
      const r = await updateEventFromChatAction({
        caseId,
        chatMessageId: messageId.startsWith("user-") ? undefined : messageId,
        eventId: inp.eventId,
        startAtIso: inp.startAtIso,
        durationMinutes: inp.durationMinutes,
        title: inp.title,
        location: inp.location,
        reason: inp.reason,
      });
      if (!r.ok) {
        toast.error(r.error);
        setMessages((cur) =>
          cur.map((m) =>
            m.id === messageId
              ? { ...m, toolUses: m.toolUses?.map((t) => (t.id === toolUseId ? { ...t, creating: false } : t)) }
              : m,
          ),
        );
        return;
      }
      setMessages((cur) =>
        cur.map((m) =>
          m.id === messageId
            ? { ...m, toolUses: m.toolUses?.map((t) => (t.id === toolUseId ? { ...t, creating: false, done: true } : t)) }
            : m,
        ),
      );
      toast.success("Evento actualizado.");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error inesperado.");
    }
  }

  // Confirm "Cancelar" click on a cancel_event tool card.
  async function handleCancelEvent(messageId: string, toolUseId: string) {
    const msg = messages.find((m) => m.id === messageId);
    const use = msg?.toolUses?.find((t) => t.id === toolUseId);
    if (!msg || !use) return;
    const inp = use.input as { eventId?: string; reason?: string };
    if (!inp.eventId || !inp.reason) {
      toast.error("La IA no proporcionó motivo de cancelación. Pedí que vuelva a intentar.");
      return;
    }
    setMessages((cur) =>
      cur.map((m) =>
        m.id === messageId
          ? { ...m, toolUses: m.toolUses?.map((t) => (t.id === toolUseId ? { ...t, creating: true } : t)) }
          : m,
      ),
    );
    try {
      const r = await cancelEventFromChatAction({
        caseId,
        chatMessageId: messageId.startsWith("user-") ? undefined : messageId,
        eventId: inp.eventId,
        reason: inp.reason,
      });
      if (!r.ok) {
        toast.error(r.error);
        setMessages((cur) =>
          cur.map((m) =>
            m.id === messageId
              ? { ...m, toolUses: m.toolUses?.map((t) => (t.id === toolUseId ? { ...t, creating: false } : t)) }
              : m,
          ),
        );
        return;
      }
      setMessages((cur) =>
        cur.map((m) =>
          m.id === messageId
            ? { ...m, toolUses: m.toolUses?.map((t) => (t.id === toolUseId ? { ...t, creating: false, done: true } : t)) }
            : m,
        ),
      );
      toast.success("Evento cancelado.");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error inesperado.");
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
    `${initialStats.noteCount} ${initialStats.noteCount === 1 ? "gestión" : "gestiones"}`,
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
            <span className="block text-[11px] text-muted-foreground">
              Este chat es privado, solo vos ves tu conversación.
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
                <ChatBubble
                  key={m.id}
                  message={m}
                  onGenerate={handleGenerateDoc}
                  onCreateEvent={handleCreateEvent}
                  onUpdateEvent={handleUpdateEvent}
                  onCancelEvent={handleCancelEvent}
                  onSendEmail={handleSendEmail}
                />
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
            Enter envía · Shift+Enter nueva línea · {mod}+J para abrir/cerrar
          </p>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function ChatBubble({
  message,
  onGenerate,
  onCreateEvent,
  onUpdateEvent,
  onCancelEvent,
  onSendEmail,
}: {
  message: ChatMessage;
  onGenerate?: (messageId: string, toolUseId: string) => void;
  onCreateEvent?: (messageId: string, toolUseId: string) => void;
  onUpdateEvent?: (messageId: string, toolUseId: string) => void;
  onCancelEvent?: (messageId: string, toolUseId: string) => void;
  onSendEmail?: (messageId: string, toolUseId: string) => void;
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
          isUser ? (
            <div className="whitespace-pre-wrap leading-relaxed">{message.content}</div>
          ) : (
            <div className="prose prose-sm dark:prose-invert max-w-none prose-p:my-2 prose-headings:mb-2 prose-headings:mt-3 prose-ul:my-2 prose-ol:my-2 prose-li:my-0.5 prose-table:my-2 prose-th:px-2 prose-th:py-1 prose-td:px-2 prose-td:py-1 prose-table:text-xs prose-code:before:hidden prose-code:after:hidden prose-code:rounded prose-code:bg-muted prose-code:px-1 prose-code:py-0.5 prose-code:text-[0.85em]">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {message.content}
              </ReactMarkdown>
            </div>
          )
        ) : null}
        {message.toolUses?.map((tu) => (
          <ToolUseCard
            key={tu.id}
            messageId={message.id}
            use={tu}
            onGenerate={onGenerate}
            onCreateEvent={onCreateEvent}
            onUpdateEvent={onUpdateEvent}
            onCancelEvent={onCancelEvent}
            onSendEmail={onSendEmail}
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
  onCreateEvent,
  onUpdateEvent,
  onCancelEvent,
  onSendEmail,
}: {
  messageId: string;
  use: ToolUse;
  onGenerate?: (messageId: string, toolUseId: string) => void;
  onCreateEvent?: (messageId: string, toolUseId: string) => void;
  onUpdateEvent?: (messageId: string, toolUseId: string) => void;
  onCancelEvent?: (messageId: string, toolUseId: string) => void;
  onSendEmail?: (messageId: string, toolUseId: string) => void;
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

  // create_event card, assistant proposed an event. The user confirms by
  // clicking "Crear evento", which calls createEventFromChatAction and
  // schedules alerts per the policy for that event type.
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
          <span className="rounded bg-warning/10 px-1.5 py-0.5 font-medium text-warning dark:text-warning">
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
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {use.eventCreated ? (
            <span className="text-[11px] text-action dark:text-action">
              ✓ Evento creado · {use.eventCreated.alertCount}{" "}
              {use.eventCreated.alertCount === 1 ? "alerta programada" : "alertas programadas"}
            </span>
          ) : use.creating ? (
            <div className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" /> Creando evento…
            </div>
          ) : (
            <Button
              type="button"
              size="sm"
              onClick={() => onCreateEvent?.(messageId, use.id)}
            >
              Crear evento
            </Button>
          )}
        </div>
      </div>
    );
  }

  // update_event card, la IA propuso mover/editar un evento existente.
  if (use.name === "update_event") {
    const inp = use.input as {
      eventId?: string;
      startAtIso?: string;
      durationMinutes?: number;
      title?: string;
      location?: string;
      reason?: string;
    };
    return (
      <div className="mt-3 rounded-md border bg-background p-3">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="rounded bg-action/10 px-1.5 py-0.5 font-medium text-action dark:text-action">
            ✏️ Reagendar evento
          </span>
          {inp.reason ? <span className="truncate">{inp.reason}</span> : null}
        </div>
        <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
          {inp.title ? <li>📝 Nuevo título: {inp.title}</li> : null}
          {inp.startAtIso ? (
            <li>📆 Nueva fecha: {new Date(inp.startAtIso).toLocaleString("es-DO")}</li>
          ) : null}
          {typeof inp.durationMinutes === "number" ? (
            <li>⏱ Nueva duración: {inp.durationMinutes} min</li>
          ) : null}
          {inp.location ? <li>📍 Nueva ubicación: {inp.location}</li> : null}
        </ul>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {use.done ? (
            <span className="text-[11px] text-action">✓ Evento actualizado</span>
          ) : use.creating ? (
            <div className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" /> Actualizando…
            </div>
          ) : (
            <Button type="button" size="sm" onClick={() => onUpdateEvent?.(messageId, use.id)}>
              Confirmar cambio
            </Button>
          )}
        </div>
      </div>
    );
  }

  // cancel_event card, la IA propuso cancelar un evento.
  if (use.name === "cancel_event") {
    const inp = use.input as { eventId?: string; reason?: string };
    return (
      <div className="mt-3 rounded-md border bg-background p-3">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="rounded bg-destructive/10 px-1.5 py-0.5 font-medium text-destructive dark:text-destructive">
            ❌ Cancelar evento
          </span>
        </div>
        {inp.reason ? (
          <p className="mt-2 text-sm">Motivo: {inp.reason}</p>
        ) : null}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {use.done ? (
            <span className="text-[11px] text-action">✓ Evento cancelado</span>
          ) : use.creating ? (
            <div className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" /> Cancelando…
            </div>
          ) : (
            <Button
              type="button"
              size="sm"
              variant="destructive"
              onClick={() => onCancelEvent?.(messageId, use.id)}
            >
              Confirmar cancelación
            </Button>
          )}
        </div>
      </div>
    );
  }

  // send_email card, la IA propone enviar un correo. El usuario revisa
  // destinatarios + asunto + cuerpo y confirma con click. Por seguridad
  // siempre requiere confirmación (no autosend).
  if (use.name === "send_email") {
    const inp = use.input as {
      to?: Array<{ email: string; name?: string }>;
      cc?: Array<{ email: string; name?: string }>;
      subject?: string;
      bodyHtml?: string;
    };
    const recipients = (inp.to ?? [])
      .map((r) => (r.name ? `${r.name} <${r.email}>` : r.email))
      .join(", ");
    const ccList = (inp.cc ?? [])
      .map((r) => (r.name ? `${r.name} <${r.email}>` : r.email))
      .join(", ");
    return (
      <div className="mt-3 rounded-md border bg-background p-3">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="rounded bg-action/10 px-1.5 py-0.5 font-medium text-action dark:text-action">
            ✉️ Correo propuesto
          </span>
        </div>
        <div className="mt-2 space-y-1 text-xs">
          <p>
            <span className="text-muted-foreground">Para:</span> {recipients || "(sin destinatarios)"}
          </p>
          {ccList ? (
            <p>
              <span className="text-muted-foreground">CC:</span> {ccList}
            </p>
          ) : null}
          <p>
            <span className="text-muted-foreground">Asunto:</span>{" "}
            <span className="font-medium">{inp.subject ?? "(sin asunto)"}</span>
          </p>
        </div>
        {inp.bodyHtml ? (
          <details className="mt-2">
            <summary className="cursor-pointer text-[11px] text-muted-foreground">
              Ver cuerpo del correo
            </summary>
            <div
              className="prose prose-sm dark:prose-invert mt-1 max-h-60 max-w-none overflow-auto rounded border bg-muted/30 p-2 text-xs"
              dangerouslySetInnerHTML={{ __html: inp.bodyHtml }}
            />
          </details>
        ) : null}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {use.done ? (
            <span className="text-[11px] text-action">
              ✓ Correo enviado · copia en tu carpeta Sent
            </span>
          ) : use.creating ? (
            <div className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" /> Enviando…
            </div>
          ) : (
            <Button
              type="button"
              size="sm"
              onClick={() => onSendEmail?.(messageId, use.id)}
            >
              Enviar correo
            </Button>
          )}
        </div>
      </div>
    );
  }

  // read_document is auto-resolved server-side; if it reaches the UI it
  // means the model emitted it but we exited the loop. Show a passive note.
  if (use.name === "read_document") {
    const inp = use.input as { documentId?: string; reason?: string };
    return (
      <div className="mt-3 rounded-md border bg-muted/40 p-2 text-[11px] text-muted-foreground">
        📖 Leyó documento {inp.documentId ? <code>{inp.documentId.slice(0, 8)}</code> : ""}
        {inp.reason ? `, ${inp.reason}` : ""}
      </div>
    );
  }

  // Fallback for unknown tools, keeps the UI from breaking when we add
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
