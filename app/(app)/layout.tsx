import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";
import { ShortcutsHelp } from "@/components/layout/shortcuts-help";
import { IdleLogout } from "@/components/layout/idle-logout";
import { PageTransition } from "@/components/layout/page-transition";
import { SidebarStateProvider } from "@/components/layout/sidebar-state-context";
import { TooltipProvider } from "@/components/ui/tooltip";
import { getCurrentUser } from "@/lib/auth/session";
import { getCurrentFirm } from "@/lib/db/queries/firms";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  // Portal-cliente users land here only by typing /casos etc. directly —
  // route them to their own area instead of the internal app.
  if (user.role === "client") redirect("/portal/dashboard");
  const firm = await getCurrentFirm(user.firmId, user.userId);

  // IMPORTANTE — layout de altura:
  // El outer container es `h-screen` (no min-h-screen) + `overflow-hidden`.
  // Eso fija la altura total a 100vh y previene que el BODY scrollee.
  // El scroll vive en <main>, que tiene su propia altura constrained vía
  // flex-1 dentro de un flex-col de altura 100vh.
  // Resultado: el sidebar es flex item con h-screen y NUNCA se mueve,
  // porque su parent tampoco crece. No depende de `position: sticky` —
  // simplemente está fuera del scroll container.
  return (
    <TooltipProvider>
      <SidebarStateProvider>
        <div className="flex h-screen w-full overflow-hidden">
          <Sidebar
            firmName={firm?.name ?? "Firma"}
            user={{ name: user.name, email: user.email, role: user.role }}
          />
          <div className="flex min-w-0 flex-1 flex-col h-full">
            <Header user={{ name: user.name, email: user.email, role: user.role }} />
            {/* overflow-x-hidden: red de seguridad para que ningún hijo apenas
                más ancho que el viewport (charts, fondos, sticky bars) vuelva
                paneable toda la página en mobile. El scroll horizontal real
                que SÍ queremos (tablas anchas) vive en wrappers internos con
                su propio overflow-x-auto. */}
            <main className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden p-4 md:p-6">
              <PageTransition>{children}</PageTransition>
            </main>
          </div>
        </div>
        <ShortcutsHelp />
        <IdleLogout />
      </SidebarStateProvider>
    </TooltipProvider>
  );
}
