import type { ReactNode } from "react";
import { Scale, Sparkles, ShieldCheck, FileText } from "lucide-react";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="relative grid min-h-screen w-full md:grid-cols-[1.1fr_1fr] overflow-hidden">
      {/* Hero side — navy con orbes de luz tipo Apple Glass */}
      <div className="relative hidden flex-col justify-between p-12 text-white md:flex overflow-hidden">
        {/* Base gradient navy */}
        <div
          className="absolute inset-0 -z-10"
          style={{
            background:
              "linear-gradient(135deg, #051D33 0%, #072A48 35%, #0F4C81 100%)",
          }}
        />
        {/* Orbe 1 — luz teal arriba derecha */}
        <div
          className="absolute -right-32 -top-32 -z-10 h-[480px] w-[480px] rounded-full opacity-50 blur-3xl"
          style={{
            background:
              "radial-gradient(circle, rgba(20,184,166,0.55), transparent 70%)",
          }}
        />
        {/* Orbe 2 — luz brand azul brillante abajo izquierda */}
        <div
          className="absolute -bottom-40 -left-32 -z-10 h-[520px] w-[520px] rounded-full opacity-60 blur-3xl"
          style={{
            background:
              "radial-gradient(circle, rgba(30,111,186,0.55), transparent 70%)",
          }}
        />
        {/* Grain noise sutil para textura "glass" */}
        <div
          className="absolute inset-0 -z-10 opacity-[0.04] mix-blend-overlay"
          style={{
            backgroundImage:
              "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' /%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' /%3E%3C/svg%3E\")",
          }}
        />

        <div className="flex items-center gap-2.5">
          <span
            className="grid h-10 w-10 place-items-center rounded-xl"
            style={{
              background: "linear-gradient(135deg, #1E6FBA, #0F4C81)",
              boxShadow:
                "0 4px 16px rgba(15,76,129,0.4), inset 0 1px 0 rgba(255,255,255,0.25)",
            }}
          >
            <Scale className="h-5 w-5" />
          </span>
          <div>
            <p className="text-base font-semibold tracking-tight">LDP Legal Suite</p>
            <p className="text-[10px] uppercase tracking-[0.18em] text-white/55">
              Legal Operations Platform
            </p>
          </div>
        </div>

        <div className="space-y-6 max-w-md">
          <h1 className="text-4xl font-semibold leading-[1.1] tracking-tight">
            Tu firma,
            <br />
            <span className="bg-gradient-to-r from-white to-white/70 bg-clip-text text-transparent">
              en orden.
            </span>
          </h1>
          <p className="text-sm text-white/75 leading-relaxed">
            Casos, clientes, tiempos y facturación con un asistente de IA que
            conoce cada expediente. Hecho para firmas boutique en República
            Dominicana.
          </p>

          {/* Pillars */}
          <div className="space-y-3 pt-2">
            <Pillar
              icon={<Sparkles className="h-3.5 w-3.5" />}
              label="Asistente IA por expediente"
              sub="Cmd+J en cualquier caso"
            />
            <Pillar
              icon={<ShieldCheck className="h-3.5 w-3.5" />}
              label="Auditoría inmutable"
              sub="Cada acción queda registrada"
            />
            <Pillar
              icon={<FileText className="h-3.5 w-3.5" />}
              label="Generación de documentos"
              sub="Actas, contratos, demandas en formato LDP"
            />
          </div>
        </div>

        <p className="text-[11px] text-white/45 tracking-wide">
          © {new Date().getFullYear()} LDP Legal Advisors · Construido en
          República Dominicana.
        </p>
      </div>

      {/* Form side */}
      <main className="relative flex items-center justify-center p-6 md:p-10">
        <div className="w-full max-w-sm">{children}</div>
      </main>
    </div>
  );
}

function Pillar({
  icon,
  label,
  sub,
}: {
  icon: React.ReactNode;
  label: string;
  sub: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <span
        className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-md"
        style={{
          background: "rgba(255,255,255,0.10)",
          backdropFilter: "blur(8px)",
          border: "1px solid rgba(255,255,255,0.15)",
        }}
      >
        {icon}
      </span>
      <div className="leading-tight">
        <p className="text-sm font-medium">{label}</p>
        <p className="text-[11px] text-white/55">{sub}</p>
      </div>
    </div>
  );
}
