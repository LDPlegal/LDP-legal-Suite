import { ComingSoon } from "@/components/layout/coming-soon";
export const metadata = { title: "Facturación · LDP Legal Suite" };
export default function Page() {
  return (
    <ComingSoon
      module="Facturación"
      phase="Fase 2"
      description="Generación desde tiempos + gastos, ITBIS/ISR, doble modo (interno y fiscal NCF/e-CF), PDF."
    />
  );
}
