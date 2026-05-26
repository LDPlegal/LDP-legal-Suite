"use client";

// Controles atómicos del panel de tweaks. Cada uno recibe value + onChange
// y emite cambios al state del editor.

import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export function TweakText({
  label,
  value,
  onChange,
  multiline,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  multiline?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        {label}
      </label>
      {multiline ? (
        <Textarea
          value={value}
          onChange={(e) => onChange(e.currentTarget.value)}
          rows={3}
          className="text-sm"
        />
      ) : (
        <Input
          value={value}
          onChange={(e) => onChange(e.currentTarget.value)}
          className="text-sm"
        />
      )}
    </div>
  );
}

export function TweakSlider({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <label className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          {label}
        </label>
        <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
          {value}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.currentTarget.value))}
        className="w-full accent-primary"
      />
    </div>
  );
}

export function TweakSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        {label}
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.currentTarget.value)}
        className="h-9 w-full rounded-lg border border-input bg-[var(--glass-bg-subtle)] backdrop-blur-sm px-3 text-sm"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export function TweakColor({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        {label}
      </label>
      <div className="grid grid-cols-7 gap-1.5">
        {options.map((o) => (
          <button
            type="button"
            key={o}
            onClick={() => onChange(o)}
            title={o}
            className={cn(
              "h-7 rounded-md border transition-all press",
              value === o
                ? "border-primary ring-2 ring-primary/30"
                : "border-border hover:border-primary/40",
            )}
            style={{ background: o }}
          />
        ))}
      </div>
    </div>
  );
}

export function TweakPhotoPicker({
  label,
  value,
  options,
  onChange,
  onUpload,
  onDelete,
  uploading,
}: {
  label: string;
  value: string;
  options: Array<{ value: string; label: string; deletable?: boolean }>;
  onChange: (v: string) => void;
  onUpload?: (file: File, label?: string) => void;
  onDelete?: (photoUrl: string) => void;
  uploading?: boolean;
}) {
  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.currentTarget.files?.[0];
    if (file && onUpload) onUpload(file);
    // limpiá el input para que el mismo archivo se pueda re-seleccionar
    e.currentTarget.value = "";
  }

  return (
    <div className="space-y-1.5">
      <label className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        {label}
      </label>
      <div className="grid grid-cols-4 gap-1.5">
        {options.map((o) => {
          const isSelected = o.value === value;
          const isEmpty = !o.value;
          return (
            <div key={o.value || "_none"} className="relative group">
              <button
                type="button"
                title={o.label}
                onClick={() => onChange(o.value)}
                className={cn(
                  "relative overflow-hidden rounded-md border transition-all press w-full",
                  isSelected
                    ? "border-primary ring-2 ring-primary/30"
                    : "border-border hover:border-primary/40",
                )}
                style={{
                  aspectRatio: "4 / 5",
                  background: isEmpty
                    ? "rgba(0,0,0,0.04)"
                    : `url(${o.value}) center/cover`,
                }}
              >
                {isEmpty ? (
                  <span className="absolute inset-0 flex items-center justify-center text-[9px] uppercase tracking-[0.10em] text-muted-foreground">
                    Ninguna
                  </span>
                ) : null}
              </button>
              {o.deletable && onDelete ? (
                <button
                  type="button"
                  title={`Borrar "${o.label}"`}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (confirm(`¿Borrar "${o.label}"? Esta acción no se puede deshacer.`)) {
                      onDelete(o.value);
                    }
                  }}
                  className="absolute right-0.5 top-0.5 grid h-5 w-5 place-items-center rounded-full bg-destructive/85 text-destructive-foreground opacity-0 transition-opacity group-hover:opacity-100"
                  aria-label={`Borrar ${o.label}`}
                >
                  <span className="text-[10px] leading-none">×</span>
                </button>
              ) : null}
            </div>
          );
        })}
        {onUpload ? (
          <label
            className={cn(
              "relative flex cursor-pointer flex-col items-center justify-center rounded-md border-2 border-dashed transition-colors",
              uploading
                ? "border-primary/40 bg-primary/5 cursor-wait"
                : "border-border hover:border-primary/40 hover:bg-accent/30",
            )}
            style={{ aspectRatio: "4 / 5" }}
          >
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              onChange={handleFileInput}
              disabled={uploading}
              className="sr-only"
            />
            <span className="text-2xl leading-none text-muted-foreground">+</span>
            <span className="mt-1 text-[9px] uppercase tracking-[0.10em] text-muted-foreground">
              {uploading ? "Subiendo…" : "Subir"}
            </span>
          </label>
        ) : null}
      </div>
    </div>
  );
}
