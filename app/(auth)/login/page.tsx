import { Suspense } from "react";
import Link from "next/link";
import { LoginForm } from "@/components/auth/login-form";
import { Skeleton } from "@/components/ui/skeleton";

// Login — handoff 3b. Sin citas ni texto de marketing: titular "Acceder",
// el formulario, y la nota de acceso restringido al pie.
export default function LoginPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-[28px] leading-tight">Acceder</h1>

      <Suspense fallback={<Skeleton className="h-44 w-full" />}>
        <LoginForm />
      </Suspense>

      <div className="space-y-3 text-center">
        <p className="text-[13px]">
          <Link
            href="/forgot-password"
            className="text-[#0F4C81] underline-offset-4 transition-colors hover:text-[#0A3A63] hover:underline"
          >
            ¿Olvidó su contraseña?
          </Link>
        </p>
        <p className="text-[12.5px] text-[#8E8F89]">
          Acceso restringido al personal de la firma.
        </p>
        <p className="text-[12.5px] text-[#8E8F89]">
          ¿No tienes una firma registrada?{" "}
          <Link
            href="/signup"
            className="font-medium text-[#0F4C81] underline-offset-4 transition-colors hover:text-[#0A3A63] hover:underline"
          >
            Crear cuenta
          </Link>
        </p>
      </div>
    </div>
  );
}
