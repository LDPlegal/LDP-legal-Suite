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

    try {
      const res = await signIn.email({
        email: parsed.data.email,
        password: parsed.data.password,
        callbackURL: redirectTo,
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
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" autoComplete="email" required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">Contraseña</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />
      </div>
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? <Loader2 className="animate-spin" /> : null}
        Iniciar sesión
      </Button>
    </form>
  );
}
