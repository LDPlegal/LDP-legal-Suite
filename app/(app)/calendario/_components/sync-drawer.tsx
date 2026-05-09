"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  Copy,
  Loader2,
  Plus,
  RefreshCw,
  Trash2,
  Link as LinkIcon,
  AlertCircle,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  regenerarIcalTokenAction,
  revocarIcalTokenAction,
} from "@/app/_actions/calendario/ical-token";
import {
  crearSuscripcionAction,
  eliminarSuscripcionAction,
  sincronizarSuscripcionAction,
} from "@/app/_actions/calendario/subscriptions";

type Subscription = {
  id: string;
  name: string;
  url: string;
  active: boolean;
  lastSyncedAt: Date | null;
  lastError: string | null;
  lastEventCount: number | null;
};

export function CalendarSyncDrawer({
  trigger,
  initialToken,
  baseUrl,
  subscriptions,
}: {
  trigger: ReactNode;
  initialToken: string | null;
  baseUrl: string;
  subscriptions: Subscription[];
}) {
  const [open, setOpen] = useState(false);
  const [token, setToken] = useState<string | null>(initialToken);
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  const feedUrl = token ? `${baseUrl}/api/calendario/feed/${token}.ics` : "";

  async function handleRegenerate() {
    setBusy(true);
    try {
      const { token: t } = await regenerarIcalTokenAction();
      setToken(t);
      toast.success("Token regenerado", {
        description: "Las suscripciones anteriores quedaron inválidas.",
      });
    } finally {
      setBusy(false);
    }
  }

  async function handleRevoke() {
    setBusy(true);
    try {
      await revocarIcalTokenAction();
      setToken(null);
      toast.success("Acceso al feed deshabilitado");
    } finally {
      setBusy(false);
    }
  }

  async function copyFeed() {
    if (!feedUrl) return;
    try {
      await navigator.clipboard.writeText(feedUrl);
      toast.success("URL copiada");
    } catch {
      toast.error("No se pudo copiar");
    }
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>{trigger}</SheetTrigger>
      <SheetContent className="sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>Sincronizar calendarios</SheetTitle>
          <SheetDescription>
            Comparte tu agenda con clientes externos (Outlook, Google) o
            importa eventos desde otros calendarios.
          </SheetDescription>
        </SheetHeader>

        <SheetBody className="space-y-6">
          <section className="space-y-2">
            <h3 className="text-sm font-medium">
              Mi feed (otros se suscriben a esto)
            </h3>
            {token ? (
              <>
                <div className="flex items-center gap-2">
                  <Input value={feedUrl} readOnly className="font-mono text-xs" />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={copyFeed}
                    aria-label="Copiar URL"
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Pega esta URL en Outlook → Agregar calendario → Suscribirse
                  desde la web, o en Google Calendar → Otros calendarios → Desde URL.
                </p>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleRegenerate}
                    disabled={busy}
                  >
                    {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                    Regenerar
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-destructive"
                    onClick={handleRevoke}
                    disabled={busy}
                  >
                    Revocar
                  </Button>
                </div>
              </>
            ) : (
              <div className="rounded-md border border-dashed p-3">
                <p className="text-xs text-muted-foreground">
                  Aún no has habilitado el feed. Genera un token para que otros
                  calendarios puedan suscribirse.
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-2"
                  onClick={handleRegenerate}
                  disabled={busy}
                >
                  {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <LinkIcon className="h-3.5 w-3.5" />}
                  Generar token
                </Button>
              </div>
            )}
          </section>

          <Separator />

          <section className="space-y-3">
            <h3 className="text-sm font-medium">
              Importar de calendarios externos
            </h3>
            <SubscriptionForm onCreated={() => router.refresh()} />

            <ul className="space-y-2">
              {subscriptions.length === 0 ? (
                <li className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
                  Sin suscripciones todavía.
                </li>
              ) : (
                subscriptions.map((s) => (
                  <SubscriptionRow key={s.id} sub={s} onChanged={() => router.refresh()} />
                ))
              )}
            </ul>
          </section>
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}

function SubscriptionForm({ onCreated }: { onCreated: () => void }) {
  const [pending, setPending] = useState(false);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    try {
      const fd = new FormData();
      fd.set("name", name);
      fd.set("url", url);
      const result = await crearSuscripcionAction(undefined, fd);
      if (result.ok) {
        toast.success("Suscripción agregada");
        setName("");
        setUrl("");
        onCreated();
      } else {
        toast.error(result.error);
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-2 rounded-md border p-3">
      <div className="grid gap-2 sm:grid-cols-[1fr_2fr]">
        <div className="space-y-1">
          <Label className="text-xs">Nombre</Label>
          <Input
            value={name}
            onChange={(e) => setName(e.currentTarget.value)}
            placeholder="Audiencias 2026"
            required
            maxLength={80}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">URL .ics</Label>
          <Input
            value={url}
            onChange={(e) => setUrl(e.currentTarget.value)}
            placeholder="https://outlook.office.com/.../calendar.ics"
            required
            type="url"
          />
        </div>
      </div>
      <Button type="submit" size="sm" disabled={pending}>
        {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
        Agregar
      </Button>
    </form>
  );
}

function SubscriptionRow({
  sub,
  onChanged,
}: {
  sub: Subscription;
  onChanged: () => void;
}) {
  const [syncing, setSyncing] = useState(false);

  async function sync() {
    setSyncing(true);
    try {
      const fd = new FormData();
      fd.set("subscriptionId", sub.id);
      const result = await sincronizarSuscripcionAction(undefined, fd);
      if (result.ok) {
        toast.success(`Sincronizado: ${result.count} eventos`);
      } else {
        toast.error(result.error);
      }
      onChanged();
    } finally {
      setSyncing(false);
    }
  }

  async function remove() {
    const fd = new FormData();
    fd.set("subscriptionId", sub.id);
    await eliminarSuscripcionAction(fd);
    toast.success("Suscripción eliminada");
    onChanged();
  }

  return (
    <li className="flex flex-col gap-2 rounded-md border p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">{sub.name}</p>
          <p className="truncate font-mono text-[10px] text-muted-foreground">
            {sub.url}
          </p>
        </div>
        <div className="flex gap-1">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={sync}
            disabled={syncing}
          >
            {syncing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            Sincronizar
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-destructive"
            onClick={remove}
            aria-label="Eliminar suscripción"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-[11px]">
        {sub.lastSyncedAt ? (
          <Badge variant="outline">
            Última sync: {new Date(sub.lastSyncedAt).toLocaleString("es-DO")}
          </Badge>
        ) : (
          <Badge variant="secondary">Nunca sincronizada</Badge>
        )}
        {sub.lastEventCount !== null ? (
          <Badge variant="outline">{sub.lastEventCount} eventos</Badge>
        ) : null}
        {sub.lastError ? (
          <span className="inline-flex items-center gap-1 text-destructive">
            <AlertCircle className="h-3 w-3" />
            {sub.lastError}
          </span>
        ) : null}
      </div>
    </li>
  );
}
