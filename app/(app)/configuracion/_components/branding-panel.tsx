"use client";

import { useActionState, useRef, useState } from "react";
import { Loader2, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  subirLogoFirmAction,
  quitarLogoFirmAction,
  actualizarBrandingFacturaAction,
  type LogoState,
  type BrandingState,
} from "@/app/_actions/configuracion/branding";

const initialLogo: LogoState = { ok: true };
const initialBranding: BrandingState = { ok: true };

export function BrandingPanel({
  initialLogoUrl,
  initialHeader,
  initialFooter,
  canEdit,
}: {
  initialLogoUrl: string | null;
  initialHeader: string;
  initialFooter: string;
  canEdit: boolean;
}) {
  const [preview, setPreview] = useState<string | null>(initialLogoUrl);
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const [logoState, logoAction] = useActionState<LogoState, FormData>(
    async (prev, fd) => {
      const r = await subirLogoFirmAction(prev, fd);
      if (r.ok) toast.success("Logo actualizado");
      else toast.error(r.error);
      return r;
    },
    initialLogo,
  );

  async function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.currentTarget.files?.[0];
    if (!file) return;
    if (file.size > 100 * 1024) {
      toast.error("La imagen excede 100 KB. Comprime o reduce dimensiones.");
      return;
    }
    setUploading(true);
    try {
      const dataUrl = await fileToDataUrl(file);
      setPreview(dataUrl);
      const fd = new FormData();
      fd.set("logoBase64", dataUrl);
      logoAction(fd);
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function removeLogo() {
    setPreview(null);
    await quitarLogoFirmAction();
    toast.success("Logo eliminado");
  }

  const [brandingState, brandingAction, brandingPending] = useActionState<
    BrandingState,
    FormData
  >(
    async (prev, fd) => {
      const r = await actualizarBrandingFacturaAction(prev, fd);
      if (r.ok) toast.success("Branding actualizado");
      else toast.error(r.error);
      return r;
    },
    initialBranding,
  );

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <div>
          <Label>Logo del firm</Label>
          <p className="text-xs text-muted-foreground">
            Aparece en el encabezado del PDF de cada factura. PNG/SVG, máx
            100&nbsp;KB.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-4 rounded-md border p-4">
          {preview ? (
            // The logo is stored as a data URL; next/image can't optimise
            // those, so plain <img> is the right choice here.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={preview}
              alt="Logo del firm"
              className="h-20 w-20 rounded-md border bg-white object-contain p-1"
            />
          ) : (
            <div className="grid h-20 w-20 place-items-center rounded-md border border-dashed bg-muted/30 text-xs text-muted-foreground">
              Sin logo
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!canEdit || uploading}
              onClick={() => inputRef.current?.click()}
            >
              {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
              {preview ? "Reemplazar" : "Subir logo"}
            </Button>
            {preview ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={!canEdit}
                onClick={removeLogo}
              >
                <X className="h-3.5 w-3.5" />
                Quitar
              </Button>
            ) : null}
            <input
              ref={inputRef}
              type="file"
              accept="image/png,image/jpeg,image/svg+xml,image/webp"
              className="hidden"
              onChange={onFileChange}
              disabled={!canEdit}
            />
          </div>
        </div>
        {!logoState.ok ? (
          <p className="text-sm text-destructive">{logoState.error}</p>
        ) : null}
      </section>

      <section className="space-y-3 border-t pt-6">
        <div>
          <Label>Texto del header de la factura</Label>
          <p className="text-xs text-muted-foreground">
            Línea opcional debajo del logo. Útil para slogan, web, contacto.
          </p>
        </div>
        <form action={brandingAction} className="space-y-3">
          <fieldset disabled={!canEdit || brandingPending} className="space-y-3">
            <Textarea
              name="invoiceHeader"
              rows={2}
              maxLength={500}
              defaultValue={initialHeader}
              placeholder="Ej. www.firma.com.do · +1 809 555 0100"
            />
            <div>
              <Label>Texto del footer de la factura</Label>
              <p className="text-xs text-muted-foreground">
                Aparece al pie, antes del disclaimer fiscal. Para condiciones
                generales, datos bancarios para pago, etc.
              </p>
            </div>
            <Textarea
              name="invoiceFooter"
              rows={3}
              maxLength={500}
              defaultValue={initialFooter}
              placeholder="Ej. Banco BHD, cuenta 0123456789, beneficiario: LDP Legal Advisors, S.R.L."
            />
            {!brandingState.ok ? (
              <p className="text-sm text-destructive">{brandingState.error}</p>
            ) : null}
            <div className="flex justify-end">
              <Button type="submit" disabled={brandingPending}>
                {brandingPending ? <Loader2 className="animate-spin" /> : null}
                Guardar branding
              </Button>
            </div>
          </fieldset>
        </form>
      </section>
    </div>
  );
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error("read failed"));
    reader.readAsDataURL(file);
  });
}
