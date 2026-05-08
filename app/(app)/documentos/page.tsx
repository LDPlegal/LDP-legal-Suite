import Link from "next/link";
import { Briefcase, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export const metadata = { title: "Documentos · LDP Legal Suite" };

export default function DocumentosPage() {
  return (
    <div className="flex h-full items-center justify-center">
      <Card className="max-w-lg">
        <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
          <span className="grid h-12 w-12 place-items-center rounded-full bg-accent text-accent-foreground">
            <FileText className="h-5 w-5" />
          </span>
          <div className="space-y-1">
            <p className="text-base font-semibold">Documentos por caso</p>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              Vista global · Fase 2.5
            </p>
          </div>
          <p className="text-sm text-muted-foreground">
            En Fase 2 los documentos viven dentro de cada caso (upload, OCR, descarga).
            Una vista global con búsqueda full-text llega en Fase 2.5. Por ahora abre un
            caso y ve a su pestaña <span className="font-medium">Documentos</span>.
          </p>
          <Button asChild variant="default" size="sm">
            <Link href="/casos">
              <Briefcase className="h-4 w-4" />
              Ir a Casos
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
