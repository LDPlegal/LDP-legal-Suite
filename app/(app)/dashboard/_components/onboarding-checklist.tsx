"use client";

// Checklist de primeros pasos para firms nuevos.
//
// Aparece arriba del dashboard SOLO cuando faltan los hitos core (cliente +
// caso) y el usuario no lo descartó. Se auto-oculta cuando coreDone, así
// que un firm establecido nunca lo ve.
//
// El dismiss se guarda en localStorage (no en DB) — es una preferencia de
// UI puramente local, no hace falta persistirla cross-device.

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Building2,
  Check,
  ChevronRight,
  FileText,
  FolderOpen,
  Users,
  UserPlus,
  X,
  Sparkles,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { IconButton } from "@/components/ui/icon-button";
import type { OnboardingProgress } from "@/lib/db/queries/onboarding";

const DISMISS_KEY = "ldp:onboarding-dismissed";

type Step = {
  key: string;
  label: string;
  description: string;
  href: string;
  cta: string;
  icon: typeof Users;
  done: boolean;
  /** Los pasos opcionales no cuentan para "todo listo". */
  optional?: boolean;
};

export function OnboardingChecklist({
  progress,
  firmName,
}: {
  progress: OnboardingProgress;
  firmName: string;
}) {
  // Evitar hydration mismatch: no leemos localStorage hasta montar.
  const [mounted, setMounted] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    setMounted(true);
    try {
      setDismissed(localStorage.getItem(DISMISS_KEY) === "1");
    } catch {
      // localStorage no disponible (modo privado raro) — mostramos igual.
    }
  }, []);

  function dismiss() {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // ignore
    }
  }

  const steps: Step[] = [
    {
      key: "firm",
      label: "Creá tu firma",
      description: "Tu espacio de trabajo ya está listo.",
      href: "/configuracion",
      cta: "Ver configuración",
      icon: Building2,
      done: true,
    },
    {
      key: "client",
      label: "Registrá tu primer cliente",
      description: "Persona física o jurídica — la base de todo caso.",
      href: "/clientes",
      cta: "Crear cliente",
      icon: Users,
      done: progress.clients > 0,
    },
    {
      key: "case",
      label: "Abrí tu primer caso",
      description: "Asociá un cliente y empezá a registrar la gestión.",
      href: "/casos",
      cta: "Crear caso",
      icon: FolderOpen,
      done: progress.cases > 0,
    },
    {
      key: "document",
      label: "Subí tu primer documento",
      description: "Contratos, sentencias, pruebas — con OCR y búsqueda.",
      href: "/documentos",
      cta: "Subir documento",
      icon: FileText,
      done: progress.documents > 0,
      optional: true,
    },
    {
      key: "team",
      label: "Invitá a tu equipo",
      description: "Sumá abogados y paralegales a la firma.",
      href: "/configuracion",
      cta: "Invitar equipo",
      icon: UserPlus,
      done: progress.teammates > 0,
      optional: true,
    },
  ];

  const requiredSteps = steps.filter((s) => !s.optional);
  const doneCount = steps.filter((s) => s.done).length;
  const totalCount = steps.length;
  const pct = Math.round((doneCount / totalCount) * 100);
  const allRequiredDone = requiredSteps.every((s) => s.done);

  // No renderizar nada hasta montar (SSR safe) o si fue descartado o si ya
  // terminó lo esencial.
  if (!mounted || dismissed || allRequiredDone) return null;

  // Primer paso pendiente — lo destacamos como "siguiente".
  const nextStep = steps.find((s) => !s.done);

  return (
    <Card className="relative overflow-hidden border-primary/20 bg-gradient-to-br from-primary/[0.04] to-transparent p-5">
      <div className="absolute right-3 top-3">
        <IconButton
          label="Ocultar guía de primeros pasos"
          className="h-7 w-7 text-muted-foreground"
          onClick={dismiss}
        >
          <X className="h-4 w-4" />
        </IconButton>
      </div>

      <div className="mb-4 flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[3px] bg-primary/10">
          <Sparkles className="h-5 w-5 text-primary" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold tracking-tight">
            Bienvenido a {firmName}
          </h2>
          <p className="text-sm text-muted-foreground">
            Configurá lo esencial en unos minutos. Completá los pasos para
            sacarle el jugo al sistema.
          </p>
        </div>
      </div>

      {/* Barra de progreso */}
      <div className="mb-4 flex items-center gap-3">
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-all duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className="shrink-0 text-xs font-medium tabular-nums text-muted-foreground">
          {doneCount}/{totalCount}
        </span>
      </div>

      <ul className="space-y-1.5">
        {steps.map((step) => {
          const Icon = step.icon;
          const isNext = step === nextStep;
          return (
            <li key={step.key}>
              <Link
                href={step.href}
                className={[
                  "group flex items-center gap-3 rounded-[3px] border p-3 transition-all",
                  step.done
                    ? "border-transparent bg-emerald-500/[0.06]"
                    : isNext
                      ? "border-primary/30 bg-primary/[0.04] hover:border-primary/50"
                      : "border-transparent hover:border-border hover:bg-accent/40",
                ].join(" ")}
              >
                <span
                  className={[
                    "grid h-8 w-8 shrink-0 place-items-center rounded-lg",
                    step.done
                      ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                      : "bg-muted text-muted-foreground",
                  ].join(" ")}
                >
                  {step.done ? <Check className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
                </span>
                <div className="min-w-0 flex-1">
                  <p
                    className={[
                      "text-sm font-medium leading-tight",
                      step.done ? "text-muted-foreground line-through" : "",
                    ].join(" ")}
                  >
                    {step.label}
                    {step.optional ? (
                      <span className="ml-1.5 text-[10px] font-normal uppercase tracking-wide text-muted-foreground/70">
                        opcional
                      </span>
                    ) : null}
                  </p>
                  {!step.done ? (
                    <p className="truncate text-xs text-muted-foreground">
                      {step.description}
                    </p>
                  ) : null}
                </div>
                {!step.done ? (
                  <span className="flex shrink-0 items-center gap-1 text-xs font-medium text-primary opacity-0 transition-opacity group-hover:opacity-100">
                    {step.cta}
                    <ChevronRight className="h-3.5 w-3.5" />
                  </span>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
