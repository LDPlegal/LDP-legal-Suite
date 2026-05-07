import { Suspense } from "react";
import Link from "next/link";
import { LoginForm } from "@/components/auth/login-form";
import { Skeleton } from "@/components/ui/skeleton";

export default function LoginPage() {
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold">Iniciar sesión</h1>
        <p className="text-sm text-muted-foreground">
          Accede a tu firma para continuar.
        </p>
      </div>
      <Suspense fallback={<Skeleton className="h-44 w-full" />}>
        <LoginForm />
      </Suspense>
      <p className="text-center text-sm text-muted-foreground">
        ¿No tienes una firma registrada?{" "}
        <Link href="/signup" className="font-medium text-primary hover:underline">
          Crear cuenta
        </Link>
      </p>
    </div>
  );
}
