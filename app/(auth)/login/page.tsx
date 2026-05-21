import { Suspense } from "react";
import Link from "next/link";
import { LoginForm } from "@/components/auth/login-form";
import { Skeleton } from "@/components/ui/skeleton";

export default function LoginPage() {
  return (
    <div className="space-y-7">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Bienvenido</h1>
        <p className="text-sm text-muted-foreground">
          Ingresá a tu firma para continuar.
        </p>
      </div>
      <Suspense fallback={<Skeleton className="h-44 w-full" />}>
        <LoginForm />
      </Suspense>
      <div className="space-y-3 text-center text-sm text-muted-foreground">
        <p>
          <Link
            href="/forgot-password"
            className="font-medium text-primary hover:underline underline-offset-4"
          >
            Olvidé mi contraseña
          </Link>
        </p>
        <p className="text-xs text-muted-foreground/80">
          ¿No tenés una firma registrada?{" "}
          <Link
            href="/signup"
            className="font-medium text-primary hover:underline underline-offset-4"
          >
            Crear cuenta
          </Link>
        </p>
      </div>
    </div>
  );
}
