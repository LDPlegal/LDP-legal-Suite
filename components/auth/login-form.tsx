"use client";

import { useState } from "react";
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

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    const fd = new FormData(e.currentTarget);
    const parsed = SignInSchema.safeParse({
      email: fd.get("email"),
      password: fd.get("password"),
    });
    if (!parsed.success) {
      const first = Object.values(parsed.error.flatten().fieldErrors).flat()[0];
      toast.error(first ?? "Datos inválidos");
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
        setPending(false);
        return;
      }
      router.push(redirectTo);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo iniciar sesión");
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
