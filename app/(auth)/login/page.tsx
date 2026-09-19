import { Suspense } from "react";
import Link from "next/link";
import { LoginForm } from "@/components/auth/login-form";
import { Skeleton } from "@/components/ui/skeleton";

// Login — handoff 3b. Sin citas ni texto de marketing: titular "Acceder",
// el formulario, y la nota de acceso restringido al pie.
//
// El enlace "¿Olvidó su contraseña?" vive dentro del formulario, en línea
// con la etiqueta CONTRASEÑA, tal como el diseño.
export default function LoginPage() {
  return (
    <div className="flex flex-col gap-[26px]">
      <h1 className="text-[29px] leading-tight">Acceder</h1>

      <Suspense fallback={<Skeleton className="h-52 w-full" />}>
        <LoginForm />
      </Suspense>

      <div className="space-y-2">
        <p className="text-[12px] text-faint">
          Acceso restringido al personal de la firma.
        </p>
        <p className="text-[12px] text-faint">
          ¿No tienes una firma registrada?{" "}
          <Link
            href="/signup"
            className="font-medium text-action underline-offset-4 transition-colors hover:text-action-hover hover:underline"
          >
            Crear cuenta
          </Link>
        </p>
      </div>
    </div>
  );
}
