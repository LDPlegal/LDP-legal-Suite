"use client";

// Editor del módulo de publicaciones.
//
// Estado de la página:
//   - templateId: qué plantilla está activa.
//   - values: el dict de tweaks específicos a esa plantilla.
//
// Cuando el usuario cambia de plantilla, cargamos los defaults de la
// nueva plantilla y reseteamos values. Si quiere preservar el copy
// entre plantillas puede copy-paste; por ahora cada plantilla vive
// independiente.
//
// Preview: render del template a tamaño real (e.g. 1080×1350) dentro de
// un wrapper que aplica scale(factor) para que entre en la pantalla.
// El export usa html-to-image con pixelRatio basado en el factor inverso
// para que el PNG salga con la resolución original.

import { useMemo, useRef, useState } from "react";
import { Download, Image as ImageIcon, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { toPng } from "html-to-image";
import { Button } from "@/components/ui/button";
import { TEMPLATES, type TemplateDef } from "@/lib/marketing/templates";
import { TEMPLATE_COMPONENTS } from "./registry";
import {
  TweakColor,
  TweakPhotoPicker,
  TweakSelect,
  TweakSlider,
  TweakText,
} from "./tweak-controls";

export function Editor() {
  const [templateId, setTemplateId] = useState<string>(TEMPLATES[0]?.id ?? "p1");
  const template = TEMPLATES.find((t) => t.id === templateId) ?? TEMPLATES[0];

  // values por template — se reinicia cuando cambia de template
  const [valuesByTemplate, setValuesByTemplate] = useState<
    Record<string, Record<string, string | number>>
  >(() => {
    const init: Record<string, Record<string, string | number>> = {};
    for (const t of TEMPLATES) {
      init[t.id] = { ...t.defaults };
    }
    return init;
  });

  const values = template ? valuesByTemplate[template.id] ?? template.defaults : {};

  function setValue(key: string, v: string | number) {
    if (!template) return;
    setValuesByTemplate((prev) => ({
      ...prev,
      [template.id]: { ...(prev[template.id] ?? template.defaults), [key]: v },
    }));
  }

  function resetTemplate() {
    if (!template) return;
    setValuesByTemplate((prev) => ({ ...prev, [template.id]: { ...template.defaults } }));
    toast.success("Plantilla reiniciada a valores por defecto.");
  }

  const Component = template ? TEMPLATE_COMPONENTS[template.id] : null;

  if (!template) return null;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      {/* Preview */}
      <div className="space-y-4">
        <TemplateTabs templates={TEMPLATES} active={templateId} onChange={setTemplateId} />
        <PreviewFrame template={template}>
          {Component ? <Component values={values} /> : null}
        </PreviewFrame>
      </div>

      {/* Tweaks */}
      <div className="space-y-4">
        <TweaksPanel
          template={template}
          values={values}
          onChange={setValue}
          onReset={resetTemplate}
        />
      </div>
    </div>
  );
}

// =============================================================================
// Template tabs (header del editor)
// =============================================================================

function TemplateTabs({
  templates,
  active,
  onChange,
}: {
  templates: TemplateDef[];
  active: string;
  onChange: (id: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5 rounded-xl border border-border bg-card backdrop-blur-xl p-1.5">
      {templates.map((t) => {
        const isActive = t.id === active;
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => onChange(t.id)}
            className={
              isActive
                ? "rounded-lg bg-[var(--glass-bg-strong)] px-3 py-1.5 text-xs font-medium text-foreground shadow-[0_1px_2px_rgba(11,25,41,0.06),inset_0_1px_0_rgba(255,255,255,0.5)]"
                : "rounded-lg px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
            }
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

// =============================================================================
// Preview frame con scale + export
// =============================================================================

function PreviewFrame({
  template,
  children,
}: {
  template: TemplateDef;
  children: React.ReactNode;
}) {
  const cardRef = useRef<HTMLDivElement | null>(null);
  const [exporting, setExporting] = useState(false);

  // Scale factor para que el preview entre en pantalla.
  // Asumimos que el contenedor disponible tiene ~620px de ancho útil en
  // monitores típicos. Para un canvas de 1080 → 620/1080 ≈ 0.57.
  // Lo dejamos fijo por simplicidad — el usuario puede zoom-out del browser
  // si quiere ver más detalle.
  const PREVIEW_WIDTH = 620;
  const scale = PREVIEW_WIDTH / template.size.w;
  const scaledH = template.size.h * scale;

  async function exportPng() {
    if (!cardRef.current || exporting) return;
    setExporting(true);
    try {
      const node = cardRef.current;
      // pixelRatio = 1/scale para que el output sea a resolución completa.
      // html-to-image multiplica las dimensiones del node × pixelRatio.
      const dataUrl = await toPng(node, {
        pixelRatio: 1 / scale,
        cacheBust: true,
        width: template.size.w * scale,
        height: template.size.h * scale,
        canvasWidth: template.size.w,
        canvasHeight: template.size.h,
        style: {
          margin: "0",
        },
      });
      const link = document.createElement("a");
      link.download = `LDP-${template.id}-${template.label.replace(/[^a-z0-9]+/gi, "-")}.png`;
      link.href = dataUrl;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      toast.success("Descargado.", {
        description: `${template.size.w}×${template.size.h} PNG`,
      });
    } catch (err) {
      toast.error("No se pudo exportar.", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="rounded-2xl border border-border bg-card/40 backdrop-blur-sm p-6">
        <div
          className="mx-auto overflow-hidden rounded-lg shadow-[0_8px_30px_-8px_rgba(11,25,41,0.30)] ring-1 ring-black/5"
          style={{ width: PREVIEW_WIDTH, height: scaledH }}
        >
          <div
            ref={cardRef}
            style={{
              width: template.size.w,
              height: template.size.h,
              transform: `scale(${scale})`,
              transformOrigin: "top left",
            }}
          >
            {children}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[11px] text-muted-foreground">
          Tamaño export: <span className="font-mono">{template.size.w}×{template.size.h}</span>{" "}
          <span className="opacity-50">·</span> preview escalado al{" "}
          <span className="font-mono">{Math.round(scale * 100)}%</span>
        </p>
        <Button type="button" onClick={exportPng} disabled={exporting}>
          {exporting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Download className="h-4 w-4" />
          )}
          {exporting ? "Generando…" : "Descargar PNG"}
        </Button>
      </div>
    </div>
  );
}

// =============================================================================
// Tweaks panel
// =============================================================================

function TweaksPanel({
  template,
  values,
  onChange,
  onReset,
}: {
  template: TemplateDef;
  values: Record<string, string | number>;
  onChange: (key: string, v: string | number) => void;
  onReset: () => void;
}) {
  return (
    <div className="space-y-4 rounded-2xl border border-border bg-card backdrop-blur-xl p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Editar
          </p>
          <h2 className="text-base font-semibold tracking-tight">{template.label}</h2>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onReset}
          title="Volver a valores por defecto"
        >
          Reiniciar
        </Button>
      </div>

      <div className="rounded-md border border-dashed border-border bg-muted/30 p-2.5 text-[11px] leading-relaxed text-muted-foreground">
        <ImageIcon className="mr-1 inline h-3 w-3 align-text-bottom" />
        Envolvé palabras en{" "}
        <code className="rounded bg-muted px-1 font-mono text-[10px]">*asteriscos*</code>{" "}
        para que salgan en <em className="font-serif text-primary">cursiva azul</em>.
      </div>

      <div className="space-y-4">
        {template.controls.map((ctrl) => {
          const val = values[ctrl.key];
          switch (ctrl.kind) {
            case "text":
              return (
                <TweakText
                  key={ctrl.key}
                  label={ctrl.label}
                  value={String(val ?? "")}
                  onChange={(v) => onChange(ctrl.key, v)}
                  multiline={ctrl.multiline}
                />
              );
            case "slider":
              return (
                <TweakSlider
                  key={ctrl.key}
                  label={ctrl.label}
                  value={Number(val ?? ctrl.min)}
                  min={ctrl.min}
                  max={ctrl.max}
                  step={ctrl.step}
                  onChange={(v) => onChange(ctrl.key, v)}
                />
              );
            case "select":
              return (
                <TweakSelect
                  key={ctrl.key}
                  label={ctrl.label}
                  value={String(val ?? "")}
                  options={ctrl.options}
                  onChange={(v) => onChange(ctrl.key, v)}
                />
              );
            case "color":
              return (
                <TweakColor
                  key={ctrl.key}
                  label={ctrl.label}
                  value={String(val ?? "")}
                  options={ctrl.options}
                  onChange={(v) => onChange(ctrl.key, v)}
                />
              );
            case "photo":
              return (
                <TweakPhotoPicker
                  key={ctrl.key}
                  label={ctrl.label}
                  value={String(val ?? "")}
                  options={ctrl.options}
                  onChange={(v) => onChange(ctrl.key, v)}
                />
              );
          }
        })}
      </div>
    </div>
  );
}

// suppress unused warning del useMemo (lo dejé importado por si lo necesitamos pronto)
void useMemo;
