"use client";

import { useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "@/lib/auth/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { SignInSchema } from "@/lib/schemas/auth";

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("redirectTo") ?? "/dashboard";
  const [pending, setPending] = useState(false);
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
        <Label htmlFor="password" className="microlabel">
          Contraseña
        </Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="h-auto py-[11px]"
        />
      </div>
      <label className="flex items-center gap-2 text-[13px] text-[#3D4038]">
        <input
          type="checkbox"
          name="rememberMe"
          defaultChecked
          className="h-[15px] w-[15px] rounded-none border-[#C9CCC5] accent-[#0B2239]"
        />
        Mantener la sesión abierta
      </label>
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? <Loader2 className="animate-spin" /> : null}
        Entrar
      </Button>
    </form>
  );
}
