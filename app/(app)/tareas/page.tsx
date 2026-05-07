import { ComingSoon } from "@/components/layout/coming-soon";
export const metadata = { title: "Tareas · LDP Legal Suite" };
export default function Page() {
  return (
    <ComingSoon
      module="Tareas"
      phase="Fase 1"
      description="Lista, kanban y calendario; asignación, dependencias y recordatorios."
    />
  );
}
