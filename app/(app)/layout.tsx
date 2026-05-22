import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";
import { ShortcutsHelp } from "@/components/layout/shortcuts-help";
import { IdleLogout } from "@/components/layout/idle-logout";
import { PageTransition } from "@/components/layout/page-transition";
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

  return (
    <TooltipProvider>
      <div className="flex min-h-screen w-full">
        <Sidebar
          firmName={firm?.name ?? "Firma"}
          user={{ name: user.name, email: user.email, role: user.role }}
        />
        <div className="flex min-w-0 flex-1 flex-col">
          <Header user={{ name: user.name, email: user.email, role: user.role }} />
          <main className="flex-1 overflow-y-auto p-6">
            <PageTransition>{children}</PageTransition>
          </main>
        </div>
      </div>
      <ShortcutsHelp />
      <IdleLogout />
    </TooltipProvider>
  );
}
