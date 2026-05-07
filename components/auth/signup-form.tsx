"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { signUpAction, type SignUpState } from "@/app/_actions/auth/signup";

const initial: SignUpState = { ok: true };

export function SignupForm() {
  const [state, action, pending] = useActionState<SignUpState, FormData>(
    signUpAction,
    initial,
  );

  return (
    <form action={action} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="firmName">Nombre de la firma</Label>
        <Input id="firmName" name="firmName" required />
        <FieldError state={state} field="firmName" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="rnc">RNC (opcional)</Label>
        <Input id="rnc" name="rnc" placeholder="XXX-XXXXX-X" />
        <FieldError state={state} field="rnc" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="name">Tu nombre</Label>
        <Input id="name" name="name" required />
        <FieldError state={state} field="name" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" required />
        <FieldError state={state} field="email" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">Contraseña</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
        />
        <FieldError state={state} field="password" />
      </div>
      {!state.ok && state.error ? (
        <p className="text-sm text-destructive">{state.error}</p>
      ) : null}
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? <Loader2 className="animate-spin" /> : null}
        Crear firma y entrar
      </Button>
    </form>
  );
}

function FieldError({
  state,
  field,
}: {
  state: SignUpState;
  field: "firmName" | "rnc" | "name" | "email" | "password";
}) {
  if (state.ok) return null;
  const errs = state.fieldErrors?.[field];
  if (!errs?.length) return null;
  return <p className="text-xs text-destructive">{errs[0]}</p>;
}
