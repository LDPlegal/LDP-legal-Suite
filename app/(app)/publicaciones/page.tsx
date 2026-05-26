import { PageHeader } from "@/components/layout/page-header";
import { Editor } from "./_components/editor";

export const metadata = { title: "Publicaciones · LDP Legal Suite" };

export default function PublicacionesPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Marca"
        title="Publicaciones"
        description="Plantillas de Instagram y LinkedIn con el estilo editorial de LDP. Editá el texto, elegí una foto y descargá el PNG listo para postear."
      />
      <Editor />
    </div>
  );
}
