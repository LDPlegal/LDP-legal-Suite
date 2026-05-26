"use client";

// Editor del módulo de publicaciones.
//
// Estado de la página:
//   - templateId: qué plantilla está activa.
//   - values: el dict de tweaks específicos a esa plantilla.
//   - customPhotos: fotos custom del firm cargadas desde la DB.
//   - customAuthorPhotos: subset de las anteriores que se usa como autor.
//   - presets: presets guardados del firm para la plantilla activa.
//   - currentPresetId: si el state actual corresponde a un preset cargado,
//     se puede "Sobrescribir" en vez de "Guardar como nuevo".
//
// CRUD:
//   - Subir foto: server action uploadMarketingPhotoAction → refresh list.
//   - Borrar foto: deleteMarketingPhotoAction → refresh.
//   - Guardar preset: savePresetAction.
//   - Cargar preset: simple setState con sus values.
//   - Sobrescribir preset: updatePresetAction.
//   - Borrar preset: deletePresetAction.

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Bookmark, Check, Download, Loader2, MoreHorizontal, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { toPng } from "html-to-image";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  TEMPLATES,
  AUTHOR_PHOTOS,
  type TemplateDef,
} from "@/lib/marketing/templates";
import { TEMPLATE_COMPONENTS } from "./registry";
import {
  TweakColor,
  TweakPhotoPicker,
  TweakSelect,
  TweakSlider,
  TweakText,
} from "./tweak-controls";
import {
  uploadMarketingPhotoAction,
  deleteMarketingPhotoAction,
} from "@/app/_actions/marketing/photos";
import {
  savePresetAction,
  updatePresetAction,
  deletePresetAction,
} from "@/app/_actions/marketing/presets";

// Tipos de los datos que llegan del server desde page.tsx
export type ServerPhoto = { id: string; label: string; url: string };
export type ServerPreset = {
  id: string;
  templateId: string;
  name: string;
  values: Record<string, string | number>;
  updatedAt: string;
};

export function Editor({
  initialPhotos,
  initialPresets,
}: {
  initialPhotos: ServerPhoto[];
  initialPresets: ServerPreset[];
}) {
  const router = useRouter();
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

  // Si state actual corresponde a un preset cargado (para enable "Sobrescribir")
  const [currentPresetId, setCurrentPresetId] = useState<string | null>(null);

  const [uploading, setUploading] = useState(false);
  const [pending, startTransition] = useTransition();

  const values = template ? valuesByTemplate[template.id] ?? template.defaults : {};

  function setValue(key: string, v: string | number) {
    if (!template) return;
    setValuesByTemplate((prev) => ({
      ...prev,
      [template.id]: { ...(prev[template.id] ?? template.defaults), [key]: v },
    }));
    // Cualquier cambio implica que el state ya no coincide con un preset cargado.
    setCurrentPresetId(null);
  }

  function resetTemplate() {
    if (!template) return;
    setValuesByTemplate((prev) => ({ ...prev, [template.id]: { ...template.defaults } }));
    setCurrentPresetId(null);
    toast.success("Plantilla reiniciada a valores por defecto.");
  }

  function loadPreset(p: ServerPreset) {
    if (!template) return;
    if (p.templateId !== template.id) {
      // Cambiar primero al template del preset
      setTemplateId(p.templateId);
    }
    setValuesByTemplate((prev) => ({ ...prev, [p.templateId]: { ...p.values } }));
    setCurrentPresetId(p.id);
    toast.success(`Cargado: ${p.name}`);
  }

  async function handleUploadPhoto(file: File) {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.set("file", file);
      // El label inicial viene del nombre del archivo sin extensión
      fd.set("label", file.name.replace(/\.[^.]+$/, ""));
      const r = await uploadMarketingPhotoAction(fd);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success("Foto subida.");
      // Auto-seleccionar la foto recién subida
      setValue("photo", r.photo.url);
      router.refresh();
    } finally {
      setUploading(false);
    }
  }

  function handleDeletePhoto(photoUrl: string) {
    // Buscar el id por la URL
    const photo = initialPhotos.find((p) => p.url === photoUrl);
    if (!photo) {
      toast.error("Foto no encontrada.");
      return;
    }
    startTransition(async () => {
      const fd = new FormData();
      fd.set("id", photo.id);
      const r = await deleteMarketingPhotoAction(fd);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      // Si la foto borrada era la seleccionada, volvé al default
      if (values.photo === photoUrl) {
        setValue("photo", String(template?.defaults.photo ?? ""));
      }
      toast.success("Foto eliminada.");
      router.refresh();
    });
  }

  function handleSavePresetAsNew() {
    if (!template) return;
    const name = window.prompt(
      "Nombre del preset:",
      `${template.label} · ${new Date().toLocaleDateString("es-DO", { day: "numeric", month: "short", year: "numeric" })}`,
    );
    if (!name || !name.trim()) return;
    startTransition(async () => {
      const r = await savePresetAction({
        templateId: template.id,
        name: name.trim(),
        values,
      });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success("Preset guardado.");
      setCurrentPresetId(r.preset.id);
      router.refresh();
    });
  }

  function handleOverwritePreset() {
    if (!currentPresetId) return;
    startTransition(async () => {
      const r = await updatePresetAction({ id: currentPresetId, values });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success("Preset actualizado.");
      router.refresh();
    });
  }

  function handleRenamePreset(p: ServerPreset) {
    const name = window.prompt("Nuevo nombre:", p.name);
    if (!name || !name.trim() || name === p.name) return;
    startTransition(async () => {
      const r = await updatePresetAction({ id: p.id, name: name.trim() });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success("Preset renombrado.");
      router.refresh();
    });
  }

  function handleDeletePreset(p: ServerPreset) {
    if (!confirm(`¿Borrar "${p.name}"? Esta acción no se puede deshacer.`)) return;
    startTransition(async () => {
      const r = await deletePresetAction({ id: p.id });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      if (currentPresetId === p.id) setCurrentPresetId(null);
      toast.success("Preset borrado.");
      router.refresh();
    });
  }

  const Component = template ? TEMPLATE_COMPONENTS[template.id] : null;
  const presetsForCurrent = initialPresets.filter((p) => p.templateId === template?.id);

  if (!template) return null;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
      {/* Preview */}
      <div className="space-y-4">
        <TemplateTabs templates={TEMPLATES} active={templateId} onChange={(id) => {
          setTemplateId(id);
          setCurrentPresetId(null);
        }} />

        <PresetsBar
          presets={presetsForCurrent}
          currentPresetId={currentPresetId}
          onLoad={loadPreset}
          onSaveNew={handleSavePresetAsNew}
          onOverwrite={handleOverwritePreset}
          onRename={handleRenamePreset}
          onDelete={handleDeletePreset}
          pending={pending}
        />

        <PreviewFrame template={template}>
          {Component ? <Component values={values} /> : null}
        </PreviewFrame>
      </div>

      {/* Tweaks */}
      <div className="space-y-4">
        <TweaksPanel
          template={template}
          values={values}
          customPhotos={initialPhotos}
          onChange={setValue}
          onReset={resetTemplate}
          onUploadPhoto={handleUploadPhoto}
          onDeletePhoto={handleDeletePhoto}
          uploading={uploading}
        />
      </div>
    </div>
  );
}

// =============================================================================
// Template tabs
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
  const groups: Array<{ label: string; kind: "post" | "story" | "cover" }> = [
    { label: "Posts (4:5)", kind: "post" },
    { label: "Stories (9:16)", kind: "story" },
    { label: "LinkedIn", kind: "cover" },
  ];

  return (
    <div className="space-y-2 rounded-xl border border-border bg-card backdrop-blur-xl p-3">
      {groups.map((g) => {
        const items = templates.filter((t) => t.kind === g.kind);
        if (items.length === 0) return null;
        return (
          <div key={g.kind} className="space-y-1.5">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/80">
              {g.label}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {items.map((t) => {
                const isActive = t.id === active;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => onChange(t.id)}
                    className={
                      isActive
                        ? "rounded-lg bg-[var(--glass-bg-strong)] px-3 py-1.5 text-xs font-medium text-foreground shadow-[0_1px_2px_rgba(11,25,41,0.06),inset_0_1px_0_rgba(255,255,255,0.5)]"
                        : "rounded-lg px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors hover:bg-accent/30"
                    }
                  >
                    {t.label}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// =============================================================================
// Presets bar
// =============================================================================

function PresetsBar({
  presets,
  currentPresetId,
  onLoad,
  onSaveNew,
  onOverwrite,
  onRename,
  onDelete,
  pending,
}: {
  presets: ServerPreset[];
  currentPresetId: string | null;
  onLoad: (p: ServerPreset) => void;
  onSaveNew: () => void;
  onOverwrite: () => void;
  onRename: (p: ServerPreset) => void;
  onDelete: (p: ServerPreset) => void;
  pending: boolean;
}) {
  const currentPreset = presets.find((p) => p.id === currentPresetId);
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card backdrop-blur-xl p-2.5">
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        Mis presets
      </p>
      {presets.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          Aún no guardaste ningún preset para esta plantilla.
        </p>
      ) : (
        <div className="flex flex-wrap items-center gap-1.5">
          {presets.map((p) => {
            const isCurrent = p.id === currentPresetId;
            return (
              <div key={p.id} className="flex items-center">
                <button
                  type="button"
                  onClick={() => onLoad(p)}
                  className={
                    isCurrent
                      ? "rounded-l-md bg-primary px-2.5 py-1 text-[11px] font-medium text-primary-foreground"
                      : "rounded-l-md bg-muted/50 px-2.5 py-1 text-[11px] font-medium text-foreground hover:bg-muted transition-colors"
                  }
                >
                  {isCurrent ? (
                    <Check className="mr-1 inline h-3 w-3" />
                  ) : (
                    <Bookmark className="mr-1 inline h-3 w-3" />
                  )}
                  {p.name}
                </button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      className={
                        isCurrent
                          ? "rounded-r-md bg-primary/85 px-1.5 py-1 text-primary-foreground hover:bg-primary"
                          : "rounded-r-md bg-muted/40 px-1.5 py-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                      }
                      aria-label={`Acciones de ${p.name}`}
                    >
                      <MoreHorizontal className="h-3 w-3" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => onLoad(p)}>
                      <Bookmark className="h-3 w-3" /> Cargar
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onRename(p)}>
                      Renombrar…
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() => onDelete(p)}
                      className="text-destructive focus:bg-destructive/10 focus:text-destructive"
                    >
                      <Trash2 className="h-3 w-3" /> Borrar
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            );
          })}
        </div>
      )}
      <div className="ml-auto flex items-center gap-1.5">
        {currentPresetId ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={onOverwrite}
            disabled={pending}
            title="Sobrescribir el preset actual"
          >
            {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
            Sobrescribir{currentPreset ? ` "${currentPreset.name}"` : ""}
          </Button>
        ) : null}
        <Button
          type="button"
          size="sm"
          onClick={onSaveNew}
          disabled={pending}
        >
          {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Bookmark className="h-3 w-3" />}
          Guardar como preset
        </Button>
      </div>
    </div>
  );
}

// =============================================================================
// Preview frame
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

  let PREVIEW_WIDTH = 620;
  if (template.kind === "story") PREVIEW_WIDTH = 350;
  if (template.kind === "cover") PREVIEW_WIDTH = 720;
  const scale = PREVIEW_WIDTH / template.size.w;
  const scaledH = template.size.h * scale;

  async function exportPng() {
    if (!cardRef.current || exporting) return;
    setExporting(true);
    try {
      const node = cardRef.current;
      const dataUrl = await toPng(node, {
        pixelRatio: 1 / scale,
        cacheBust: true,
        width: template.size.w * scale,
        height: template.size.h * scale,
        canvasWidth: template.size.w,
        canvasHeight: template.size.h,
        style: { margin: "0" },
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
  customPhotos,
  onChange,
  onReset,
  onUploadPhoto,
  onDeletePhoto,
  uploading,
}: {
  template: TemplateDef;
  values: Record<string, string | number>;
  customPhotos: ServerPhoto[];
  onChange: (key: string, v: string | number) => void;
  onReset: () => void;
  onUploadPhoto: (file: File) => void;
  onDeletePhoto: (url: string) => void;
  uploading: boolean;
}) {
  // Para photo pickers: combinamos built-in (de templates.ts) + custom (de DB)
  function getPhotoOptions(key: string) {
    const ctrl = template.controls.find(
      (c) => c.kind === "photo" && c.key === key,
    );
    if (!ctrl || ctrl.kind !== "photo") return [];
    const builtin = ctrl.options.map((o) => ({ ...o, deletable: false }));
    const isAuthor = ctrl.options === AUTHOR_PHOTOS;
    // Mostramos las custom solo en el picker de foto principal (no en autor),
    // o sea cuando NO es AUTHOR_PHOTOS (porque AUTHOR son rostros del equipo).
    if (isAuthor) return builtin;
    const custom = customPhotos.map((p) => ({
      value: p.url,
      label: p.label,
      deletable: true,
    }));
    return [...builtin, ...custom];
  }

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
            case "photo": {
              const options = getPhotoOptions(ctrl.key);
              const isMainPhotoPicker = ctrl.key === "photo";
              return (
                <TweakPhotoPicker
                  key={ctrl.key}
                  label={ctrl.label}
                  value={String(val ?? "")}
                  options={options}
                  onChange={(v) => onChange(ctrl.key, v)}
                  onUpload={isMainPhotoPicker ? onUploadPhoto : undefined}
                  onDelete={isMainPhotoPicker ? onDeletePhoto : undefined}
                  uploading={uploading}
                />
              );
            }
          }
        })}
      </div>
    </div>
  );
}

void useEffect;
