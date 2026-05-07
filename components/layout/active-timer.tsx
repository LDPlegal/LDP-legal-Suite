"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Loader2, Pause, Play, TimerReset } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { stopTimerAction } from "@/app/_actions/timer/stop";
import { discardTimerAction } from "@/app/_actions/timer/discard";

type ActiveTimerData = {
  caseId: string;
  caseCode: string | null;
  caseTitle: string | null;
  description: string | null;
  startedAt: string;
  lastHeartbeatAt: string;
  stale: boolean;
} | null;

const HEARTBEAT_MS = 30_000;
const POLL_MS = 60_000;

function formatElapsed(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const pad = (n: number) => n.toString().padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

export function ActiveTimerWidget() {
  const [active, setActive] = useState<ActiveTimerData>(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);
  const [pending, startTransition] = useTransition();
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Tick once per second to update the elapsed display
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  async function refresh() {
    try {
      const res = await fetch("/api/timer/active", { cache: "no-store" });
      if (!res.ok) {
        setActive(null);
      } else {
        const json = (await res.json()) as { active: ActiveTimerData };
        setActive(json.active);
      }
    } catch {
      setActive(null);
    } finally {
      setLoading(false);
    }
  }

  // Initial load + polling so other tabs / actions reflect here too
  useEffect(() => {
    refresh();
    const id = setInterval(refresh, POLL_MS);
    return () => clearInterval(id);
  }, []);

  // Heartbeat while a timer is active. Re-arm whenever the active case
  // changes (effectively: timer started, stopped, or switched cases).
  const activeCaseId = active?.caseId;
  useEffect(() => {
    if (!activeCaseId) {
      if (heartbeatRef.current) {
        clearInterval(heartbeatRef.current);
        heartbeatRef.current = null;
      }
      return;
    }
    heartbeatRef.current = setInterval(() => {
      void fetch("/api/timer/heartbeat", { method: "POST" });
    }, HEARTBEAT_MS);
    return () => {
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
    };
  }, [activeCaseId]);

  if (loading) {
    return (
      <div className="hidden h-9 items-center gap-2 rounded-md border border-dashed border-border px-3 text-xs text-muted-foreground sm:flex">
        <Loader2 className="h-3 w-3 animate-spin" />
        Timer
      </div>
    );
  }

  if (!active) return null;

  const startedMs = new Date(active.startedAt).getTime();
  const elapsedSec = Math.max(0, Math.floor((Date.now() - startedMs) / 1000));
  // Use the tick value to make the dependency on time explicit
  void tick;

  return (
    <div
      className={
        "hidden h-9 items-center gap-2 rounded-md border px-3 text-xs sm:flex " +
        (active.stale
          ? "border-warning bg-warning/10 text-warning-foreground"
          : "border-success bg-success/10 text-success-foreground")
      }
      aria-live="polite"
    >
      {active.stale ? (
        <TimerReset className="h-3.5 w-3.5" />
      ) : (
        <Play className="h-3.5 w-3.5 fill-current" />
      )}
      <span className="font-mono tabular-nums font-semibold">
        {formatElapsed(elapsedSec)}
      </span>
      <span className="font-mono text-[10px] opacity-80">
        {active.caseCode ?? "—"}
      </span>
      {active.stale ? (
        <span className="hidden text-[10px] md:inline">inactivo &gt;15min</span>
      ) : null}
      <form
        action={(fd) => {
          startTransition(async () => {
            await stopTimerAction(fd);
            await refresh();
            toast.success("Timer detenido y registrado");
          });
        }}
      >
        <Button
          type="submit"
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          aria-label="Detener timer"
          disabled={pending}
        >
          <Pause className="h-3 w-3" />
        </Button>
      </form>
      {active.stale ? (
        <form
          action={() => {
            startTransition(async () => {
              await discardTimerAction();
              await refresh();
              toast.info("Timer descartado");
            });
          }}
        >
          <Button
            type="submit"
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-[10px]"
            disabled={pending}
          >
            Descartar
          </Button>
        </form>
      ) : null}
    </div>
  );
}
