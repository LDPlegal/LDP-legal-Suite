import { ComingSoon } from "@/components/layout/coming-soon";
export const metadata = { title: "Reportes · LDP Legal Suite" };
export default function Page() {
  return (
    <ComingSoon
      module="Reportes"
      phase="Fase 3"
      description="Horas por abogado/caso/cliente, realización, utilization, aging y cubo dinámico."
    />
  );
}
