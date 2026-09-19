"use client";

// F7+ Bloque 4 — Switch para marcar un caso como confidencial o ultra
// confidencial. Solo admin/partner ven el control habilitado.
//
// 'ultra_confidential' activa el cifrado app-layer sobre TODOS los
// documentos subidos a partir de ese momento. Los documentos previos se
// quedan sin cifrar — bajar y re-subir manualmente queda al criterio del
// admin (el costo de re-encrypt automático para una funcionalidad poco
// usada no se justifica en V1).

import { useState, useTransition } from "react";
import { Lock, ShieldAlert, Shield, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { setCaseConfidentialTierAction } from "@/app/_actions/casos/set-confidential-tier";

type Tier = "normal" | "confidential" | "ultra_confidential";

const TIER_LABELS: Record<Tier, { label: string; color: string; icon: typeof Shield }> = {
  normal: { label: "Normal", color: "secondary", icon: Shield },
  confidential: {
    label: "Confidencial",
    color: "warning",
    icon: ShieldAlert,
  },
  ultra_confidential: {
    label: "Ultra confidencial",
    color: "destructive",
    icon: Lock,
  },
};

export function ConfidentialTierBadge({ tier }: { tier: Tier }) {
  const cfg = TIER_LABELS[tier];
  const Icon = cfg.icon;
  return (
    <Badge variant={cfg.color as "secondary" | "warning" | "destructive"}>
      <Icon className="h-3 w-3" />
      {cfg.label}
    </Badge>
  );
}

export function ConfidentialTierSwitch({
  caseId,
  currentTier,
  canEdit,
}: {
  caseId: string;
  currentTier: Tier;
  canEdit: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [pendingTier, setPendingTier] = useState<Tier | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  if (!canEdit) {
    return <ConfidentialTierBadge tier={currentTier} />;
  }

  function onChange(newTier: Tier) {
    if (newTier === currentTier) return;
    // 'ultra_confidential' requires explicit confirm.
    if (newTier === "ultra_confidential") {
      setPendingTier(newTier);
      setDialogOpen(true);
      return;
    }
    apply(newTier);
  }

  function apply(tier: Tier) {
    startTransition(async () => {
      const r = await setCaseConfidentialTierAction({ caseId, tier });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(`Tier actualizado a "${TIER_LABELS[tier].label}".`);
    });
  }

  return (
    <>
      <div className="inline-flex items-center gap-2">
        <Select
          value={currentTier}
          onValueChange={(v) => onChange(v as Tier)}
          disabled={pending}
        >
          <SelectTrigger className="h-7 w-auto gap-1.5 px-2 text-xs">
            {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="normal">
              <span className="inline-flex items-center gap-1.5">
                <Shield className="h-3 w-3" /> Normal
              </span>
            </SelectItem>
            <SelectItem value="confidential">
              <span className="inline-flex items-center gap-1.5 text-warning dark:text-warning">
                <ShieldAlert className="h-3 w-3" /> Confidencial
              </span>
            </SelectItem>
            <SelectItem value="ultra_confidential">
              <span className="inline-flex items-center gap-1.5 text-destructive dark:text-destructive">
                <Lock className="h-3 w-3" /> Ultra confidencial
              </span>
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Marcar caso como ULTRA confidencial</DialogTitle>
            <DialogDescription className="space-y-2">
              <span className="block">
                Desde este momento, todos los documentos que se suban a este caso van a
                ser cifrados con AES-256-GCM antes de salir hacia el storage.
              </span>
              <span className="block">
                <strong>Importante:</strong> los documentos ya cargados se quedan sin
                cifrar (no se re-procesan automáticamente). Si necesitás que también
                queden cifrados, descargálos y re-subílos después del cambio.
              </span>
              <span className="block text-warning">
                Sólo admins y partners pueden ver los documentos cifrados descifrados.
              </span>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setPendingTier(null);
                setDialogOpen(false);
              }}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={() => {
                if (pendingTier) apply(pendingTier);
                setDialogOpen(false);
                setPendingTier(null);
              }}
            >
              Confirmar y activar cifrado
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
