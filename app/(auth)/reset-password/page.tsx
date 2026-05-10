"use client";

import { Suspense, useActionState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  resetPasswordAction,
  type ResetPasswordState,
} from "@/app/_actions/auth/forgot-password";

const initial: ResetPasswordState = { ok: true };

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<Skeleton className="h-64 w-full max-w-sm" />}>
      <ResetPasswordInner />
    </Suspense>
  );
}

function ResetPasswordInner() {
  const sp = useSearchParams();
  const token = sp.get("token") ?? "";
  const router = useRouter();
  const [state, action, pending] = useActionState<ResetPasswordState, FormData>(
    async (prev, fd) => {
      const r = await resetPasswordAction(prev, fd);
      if (r.ok) {
        toast.success("Contraseña restablecida. Inicia sesión.");
        router.push("/login");
      }
      return r;
    },
    initial,
  );

  return (
    <div className="grid min-h-screen place-items-center bg-muted/30 p-6">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Nueva contraseña</CardTitle>
        </CardHeader>
        <CardContent>
          {token ? (
            <form action={action} className="space-y-4">
              <input type="hidden" name="token" value={token} />
              <div className="space-y-1.5">
                <Label htmlFor="newPassword">Nueva contraseña</Label>
                <Input
                  id="newPassword"
                  name="newPassword"
                  type="password"
                  minLength={8}
                  maxLength={72}
                  required
                  autoComplete="new-password"
                />
                <p className="text-xs text-muted-foreground">
                  Mínimo 8 caracteres.
                </p>
              </div>
              <Button type="submit" disabled={pending} className="w-full">
                {pending ? <Loader2 className="animate-spin" /> : null}
                Restablecer
              </Button>
              {!state.ok ? (
                <p className="text-sm text-destructive">{state.error}</p>
              ) : null}
            </form>
          ) : (
            <p className="text-sm text-muted-foreground">
              Falta el token en la URL. Solicita un nuevo link desde &quot;Recuperar
              contraseña&quot;.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
