"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "@/lib/auth/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Icon } from "@/components/ui/icon";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { SignInSchema } from "@/lib/schemas/auth";

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("redirectTo") ?? "/dashboard";
  const [pending, setPending] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  // useRef da un guard SINCRÓNICO. useState es asíncrono — entre múltiples
  // submits rápidos (Enter spam, doble click) el react schedule no aplica
  // setPending(true) entre uno y otro y se disparan N requests al server.
  // Ref bloquea al primer submit.
  const submittingRef = useRef(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submittingRef.current) return;
    submittingRef.current = true;
    setPending(true);
    const fd = new FormData(e.currentTarget);
    const parsed = SignInSchema.safeParse({
      email: fd.get("email"),
      password: fd.get("password"),
    });
    if (!parsed.success) {
      const first = Object.values(parsed.error.flatten().fieldErrors).flat()[0];
      toast.error(first ?? "Datos inválidos");
      submittingRef.current = false;
      setPending(false);
      return;
    }

    // "Mantener la sesión abierta" (handoff 3b) — better-auth lo traduce a
    // una sesión persistente en vez de una de navegador.
    const rememberMe = fd.get("rememberMe") !== null;

    try {
      const res = await signIn.email({
        email: parsed.data.email,
        password: parsed.data.password,
        callbackURL: redirectTo,
        rememberMe,
      });
      if (res.error) {
        toast.error(res.error.message ?? "Credenciales inválidas");
        submittingRef.current = false;
        setPending(false);
        return;
      }
      // Éxito → navegamos. Dejamos pending=true para que el botón siga
      // bloqueado durante la transición (el unmount limpia el ref).
      router.push(redirectTo);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo iniciar sesión");
      submittingRef.current = false;
      setPending(false);
    }
  }

  return (
    // Campos con microetiqueta arriba y copy final del handoff 3b
    // (CORREO / CONTRASEÑA, botón "Entrar").
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="email" className="microlabel">
          Correo
        </Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          className="h-auto py-[11px]"
        />
      </div>
      <div className="space-y-1.5">
        {/* El enlace de recuperación va en línea con la etiqueta, alineado
            a la derecha por baseline (diseño 3b). */}
        <div className="flex items-baseline justify-between gap-3">
          <Label htmlFor="password" className="microlabel">
            Contraseña
          </Label>
          <Link
            href="/forgot-password"
            className="text-[12.5px] text-action underline-offset-4 transition-colors hover:text-action-hover hover:underline"
          >
            ¿Olvidó su contraseña?
          </Link>
        </div>
        <div className="relative">
          <Input
            id="password"
            name="password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            required
            className="h-auto py-[11px] pr-10"
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
            className="absolute right-2.5 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center text-subtle transition-colors hover:text-foreground"
          >
            <Icon name={showPassword ? "visibility_off" : "visibility"} size={19} />
          </button>
        </div>
      </div>
      <label className="flex items-center gap-[9px] text-[13px] text-foreground">
        <input
          type="checkbox"
          name="rememberMe"
          defaultChecked
          className="h-[15px] w-[15px] flex-none rounded-none border border-[#9FA39B] accent-[#0B2239]"
        />
        Mantener la sesión abierta
      </label>
      <Button type="submit" className="h-auto w-full py-[13px]" disabled={pending}>
        {pending ? <Loader2 className="animate-spin" /> : null}
        Entrar
      </Button>
    </form>
  );
}
