import Link from "next/link";
import { SignupForm } from "@/components/auth/signup-form";

export default function SignupPage() {
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold">Crear cuenta</h1>
        <p className="text-sm text-muted-foreground">
          Registra tu firma y crea el primer usuario administrador.
        </p>
      </div>
      <SignupForm />
      <p className="text-center text-sm text-muted-foreground">
        ¿Ya tienes una cuenta?{" "}
        <Link href="/login" className="font-medium text-primary hover:underline">
          Inicia sesión
        </Link>
      </p>
    </div>
  );
}
