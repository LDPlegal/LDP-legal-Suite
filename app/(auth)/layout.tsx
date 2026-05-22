import type { ReactNode } from "react";
import { Scale } from "lucide-react";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-screen w-full md:grid-cols-2">
      <div className="hidden flex-col justify-between bg-[var(--color-brand-600)] p-10 text-white md:flex">
        <div className="flex items-center gap-2 text-base font-semibold">
          <span className="grid h-9 w-9 place-items-center rounded-lg bg-white/15 backdrop-blur-sm">
            <Scale className="h-4.5 w-4.5" />
          </span>
          LDP Legal Suite
        </div>
        <div className="space-y-3">
          <h1 className="text-4xl font-semibold leading-tight tracking-tight">
            Tu firma, en orden.
          </h1>
          <p className="max-w-md text-sm text-white/80 leading-relaxed">
            Casos, clientes, tiempos y facturación con un asistente de IA que
            conoce cada expediente. Hecho para firmas boutique en República
            Dominicana.
          </p>
        </div>
        <p className="text-xs text-white/60">
          © {new Date().getFullYear()} LDP Legal Suite
        </p>
      </div>
      <main className="flex items-center justify-center bg-background p-6">
        <div className="w-full max-w-sm">{children}</div>
      </main>
    </div>
  );
}
