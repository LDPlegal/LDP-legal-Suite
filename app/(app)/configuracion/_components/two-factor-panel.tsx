"use client";

// F7 bloque 4, Panel de 2FA (TOTP).
//
// Flujo de activación:
//   1. Usuario hace clic "Activar 2FA".
//   2. Ingresa su password (better-auth lo exige para enable).
//   3. authClient.twoFactor.enable({ password }) → devuelve { totpURI, backupCodes }.
//   4. Renderizamos QR del totpURI + lista de backup codes.
//   5. Usuario escanea con Google Authenticator / 1Password / Authy.
//   6. Ingresa el código de 6 dígitos → verifyTotp({ code }) → 2FA queda activo.
//
// Flujo de desactivación: enter password → twoFactor.disable({ password }).

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { ShieldCheck, ShieldOff, Loader2, Copy, Check } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { authClient } from "@/lib/auth/client";

type Stage =
  | { kind: "idle" }
  | { kind: "askPasswordToEnable" }
  | { kind: "showSetup"; totpURI: string; backupCodes: string[]; qrDataUrl: string }
  | { kind: "askPasswordToDisable" };

export function TwoFactorPanel({ enabled }: { enabled: boolean }) {
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState<Stage>({ kind: "idle" });
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [copied, setCopied] = useState(false);

  async function startEnable() {
    setStage({ kind: "askPasswordToEnable" });
    setPassword("");
  }

  async function submitEnable() {
    if (!password) {
      toast.error("Ingresá tu contraseña.");
      return;
    }
    setBusy(true);
    try {
      // better-auth devuelve { data: { totpURI, backupCodes } }.
      const res = await authClient.twoFactor.enable({ password });
      const data = (res as { data?: { totpURI?: string; backupCodes?: string[] } }).data;
      if (!data?.totpURI || !Array.isArray(data.backupCodes)) {
        toast.error("No se pudo iniciar la configuración de 2FA.");
        return;
      }
      const qrDataUrl = await QRCode.toDataURL(data.totpURI, { width: 220, margin: 1 });
      setStage({
        kind: "showSetup",
        totpURI: data.totpURI,
        backupCodes: data.backupCodes,
        qrDataUrl,
      });
      setPassword("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al activar 2FA.");
    } finally {
      setBusy(false);
    }
  }

  async function submitVerify() {
    if (!/^\d{6}$/.test(code)) {
      toast.error("El código debe tener 6 dígitos.");
      return;
    }
    setBusy(true);
    try {
      await authClient.twoFactor.verifyTotp({ code });
      toast.success("2FA activado", {
        description: "Guardá tus códigos de respaldo en un lugar seguro.",
      });
      setStage({ kind: "idle" });
      setCode("");
      // Refrescamos para que el badge se actualice.
      window.location.reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Código inválido.");
    } finally {
      setBusy(false);
    }
  }

  async function startDisable() {
    setStage({ kind: "askPasswordToDisable" });
    setPassword("");
  }

  async function submitDisable() {
    if (!password) {
      toast.error("Ingresá tu contraseña.");
      return;
    }
    setBusy(true);
    try {
      await authClient.twoFactor.disable({ password });
      toast.success("2FA desactivado.");
      setStage({ kind: "idle" });
      window.location.reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo desactivar.");
    } finally {
      setBusy(false);
    }
  }

  function copyBackup(codes: string[]) {
    navigator.clipboard.writeText(codes.join("\n")).then(
      () => {
        setCopied(true);
        toast.success("Códigos copiados al portapapeles.");
      },
      () => toast.error("No se pudo copiar."),
    );
  }

  // Reset "copied" flag when leaving the setup screen.
  useEffect(() => {
    if (stage.kind !== "showSetup") setCopied(false);
  }, [stage.kind]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Badge variant={enabled ? "success" : "secondary"}>
          {enabled ? "Activo" : "No configurado"}
        </Badge>
        <span className="text-sm text-muted-foreground">
          {enabled
            ? "Tu cuenta requiere un código de 6 dígitos al iniciar sesión."
            : "Añade un segundo factor (Google Authenticator, 1Password, Authy)."}
        </span>
      </div>

      {stage.kind === "idle" ? (
        enabled ? (
          <Button type="button" variant="outline" onClick={startDisable} disabled={busy}>
            <ShieldOff className="h-4 w-4" /> Desactivar 2FA
          </Button>
        ) : (
          <Button type="button" onClick={startEnable} disabled={busy}>
            <ShieldCheck className="h-4 w-4" /> Activar 2FA
          </Button>
        )
      ) : null}

      {stage.kind === "askPasswordToEnable" || stage.kind === "askPasswordToDisable" ? (
        <div className="rounded-md border bg-muted/30 p-4">
          <Label htmlFor="2fa-pwd" className="text-xs">
            Confirmá tu contraseña
          </Label>
          <Input
            id="2fa-pwd"
            type="password"
            autoComplete="current-password"
            className="mt-1 max-w-sm"
            value={password}
            onChange={(e) => setPassword(e.currentTarget.value)}
            disabled={busy}
          />
          <div className="mt-3 flex items-center gap-2">
            <Button
              type="button"
              onClick={stage.kind === "askPasswordToEnable" ? submitEnable : submitDisable}
              disabled={busy || !password}
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Continuar
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setStage({ kind: "idle" })}
              disabled={busy}
            >
              Cancelar
            </Button>
          </div>
        </div>
      ) : null}

      {stage.kind === "showSetup" ? (
        <div className="space-y-4 rounded-md border bg-muted/30 p-4">
          <div>
            <p className="text-sm font-medium">Escaneá el QR</p>
            <p className="text-xs text-muted-foreground">
              Abrí tu app de autenticación y escaneá esta imagen.
            </p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={stage.qrDataUrl}
              alt="QR para 2FA"
              className="mt-2 rounded-md border bg-white"
              width={220}
              height={220}
            />
            <details className="mt-2">
              <summary className="cursor-pointer text-[11px] text-muted-foreground">
                No puedo escanear · ver URI manual
              </summary>
              <code className="mt-1 block break-all rounded bg-background p-2 text-[11px]">
                {stage.totpURI}
              </code>
            </details>
          </div>

          <div>
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">Códigos de respaldo</p>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => copyBackup(stage.backupCodes)}
              >
                {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                {copied ? "Copiado" : "Copiar"}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Guardá estos códigos en un lugar seguro. Cada uno funciona una sola vez si
              perdés acceso a tu app.
            </p>
            <ul className="mt-2 grid grid-cols-2 gap-1 font-mono text-xs">
              {stage.backupCodes.map((c) => (
                <li key={c} className="rounded bg-background px-2 py-1">
                  {c}
                </li>
              ))}
            </ul>
          </div>

          <div>
            <Label htmlFor="2fa-code" className="text-xs">
              Confirmá con un código de tu app
            </Label>
            <Input
              id="2fa-code"
              inputMode="numeric"
              pattern="\d{6}"
              maxLength={6}
              className="mt-1 max-w-[8rem] font-mono tracking-widest"
              value={code}
              onChange={(e) => setCode(e.currentTarget.value.replace(/\D/g, ""))}
              disabled={busy}
              placeholder="123456"
            />
            <div className="mt-3 flex items-center gap-2">
              <Button type="button" onClick={submitVerify} disabled={busy || code.length !== 6}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Verificar y activar
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setStage({ kind: "idle" })}
                disabled={busy}
              >
                Cancelar
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
