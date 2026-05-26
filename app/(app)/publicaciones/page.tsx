import { PageHeader } from "@/components/layout/page-header";
import { Editor, type ServerPhoto, type ServerPreset } from "./_components/editor";
import { requireUser } from "@/lib/auth/session";
import { listMarketingPhotosForFirm } from "@/app/_actions/marketing/photos";
import { listPresetsForFirm } from "@/app/_actions/marketing/presets";

export const metadata = { title: "Publicaciones · LDP Legal Suite" };

export default async function PublicacionesPage() {
  const user = await requireUser();

  const [photos, presets] = await Promise.all([
    listMarketingPhotosForFirm(user.firmId),
    listPresetsForFirm(user.firmId),
  ]);

  const initialPhotos: ServerPhoto[] = photos.map((p) => ({
    id: p.id,
    label: p.label,
    url: p.url,
  }));

  const initialPresets: ServerPreset[] = presets.map((p) => ({
    id: p.id,
    templateId: p.templateId,
    name: p.name,
    values: p.values,
    updatedAt: p.updatedAt.toISOString(),
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Marca"
        title="Publicaciones"
        description="Plantillas de Instagram y LinkedIn con el estilo editorial de LDP. Subí tus propias fotos, guardá presets reutilizables y exportá PNG listo para postear."
      />
      <Editor initialPhotos={initialPhotos} initialPresets={initialPresets} />
    </div>
  );
}
