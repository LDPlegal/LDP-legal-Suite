"use client";

// F7+ Bloque 5 — Firma profesional por usuario. Se anexa automáticamente
// al final de cada correo enviado desde el chat IA. HTML básico permitido.

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Save, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { saveEmailSignatureAction } from "@/app/_actions/users/email-signature";

export function EmailSignaturePanel({ initial }: { initial: string }) {
  const [value, setValue] = useState(initial);
  const [pending, startTransition] = useTransition();

  function save() {
    startTransition(async () => {
      const fd = new FormData();
      fd.set("signature", value);
      const r = await saveEmailSignatureAction(fd);
      if (!r.ok) {
        toast.error(r.error ?? "No se pudo guardar.");
        return;
      }
      toast.success("Firma actualizada.");
    });
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Se anexa automáticamente al final de cada correo que mandés desde el chat.
        HTML básico permitido (saltos con &lt;br&gt;, negrita con &lt;b&gt;, etc.).
      </p>
      <Textarea
        value={value}
        onChange={(e) => setValue(e.currentTarget.value)}
        rows={6}
        placeholder="<b>Lic. Gendrick Alvarez</b><br>LDP Legal Advisors<br>gendrick@ldplegal.com.do · +1 809 555 0100"
        className="font-mono text-xs"
        maxLength={2000}
      />
      <div className="flex items-center justify-between">
        <p className="text-[11px] text-muted-foreground">
          {value.length}/2000 caracteres
        </p>
        <Button type="button" size="sm" onClick={save} disabled={pending}>
          {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
          Guardar
        </Button>
      </div>
      {value ? (
        <details className="rounded-md border bg-muted/30 p-2">
          <summary className="cursor-pointer text-xs font-medium">Vista previa</summary>
          <div
            className="prose prose-sm dark:prose-invert mt-2 max-w-none text-xs"
            dangerouslySetInnerHTML={{ __html: value }}
          />
        </details>
      ) : null}
    </div>
  );
}
