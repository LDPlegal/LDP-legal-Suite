import { ComingSoon } from "@/components/layout/coming-soon";
export const metadata = { title: "Calendario · LDP Legal Suite" };
export default function Page() {
  return (
    <ComingSoon
      module="Calendario"
      phase="Fase 1"
      description="Vista mes/semana/día, export .ics, integración con casos y detección de conflictos."
    />
  );
}
