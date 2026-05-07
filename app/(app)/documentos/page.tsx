import { ComingSoon } from "@/components/layout/coming-soon";
export const metadata = { title: "Documentos · LDP Legal Suite" };
export default function Page() {
  return (
    <ComingSoon
      module="Documentos"
      phase="Fase 2"
      description="Upload con tags, vista de árbol por caso, OCR real (Tesseract) y versionado."
    />
  );
}
