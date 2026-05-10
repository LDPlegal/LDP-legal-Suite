"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  forgotPasswordAction,
  type ForgotPasswordState,
} from "@/app/_actions/auth/forgot-password";

const initial: ForgotPasswordState = { ok: true };

export default function ForgotPasswordPage() {
  const [state, action, pending] = useActionState<ForgotPasswordState, FormData>(
    forgotPasswordAction,
    initial,
  );

  return (
    <div className="grid min-h-screen place-items-center bg-muted/30 p-6">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Recuperar contraseña</CardTitle>
        </CardHeader>
        <CardContent>
          {state.ok ? (
            <form action={action} className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Te enviaremos un link para restablecer tu contraseña. Si el
                email existe, recibirás el correo en unos minutos.
              </p>
              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  required
                  autoComplete="email"
                />
              </div>
              <Button type="submit" disabled={pending} className="w-full">
                {pending ? <Loader2 className="animate-spin" /> : null}
                Enviar link de recuperación
              </Button>
              <p className="text-center text-xs text-muted-foreground">
                <Link href="/login" className="hover:underline">
                  Volver al inicio de sesión
                </Link>
              </p>
            </form>
          ) : (
            <p className="text-sm text-destructive">{state.error}</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
