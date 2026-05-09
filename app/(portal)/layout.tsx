import type { ReactNode } from "react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { PortalHeader } from "@/components/layout/portal-header";
import { PortalSidebar } from "@/components/layout/portal-sidebar";
import { requirePortalUser } from "@/lib/auth/session";
import { getClientById } from "@/lib/db/queries/clients";
import { getCurrentFirm } from "@/lib/db/queries/firms";

// Layout for the entire /portal/* tree. Enforces role='client' before any
// child page renders. Staff users hitting /portal are bounced to /dashboard
// by requirePortalUser(); anonymous users are sent to /login.
export default async function PortalLayout({ children }: { children: ReactNode }) {
  const user = await requirePortalUser();
  const [firm, client] = await Promise.all([
    getCurrentFirm(user.firmId, user.userId),
    getClientById(user.firmId, user.userId, user.clientId),
  ]);

  return (
    <TooltipProvider>
      <div className="flex min-h-screen w-full">
        <PortalSidebar
          firmName={firm?.name ?? "Firma"}
          clientName={client?.displayName ?? user.name}
        />
        <div className="flex min-w-0 flex-1 flex-col">
          <PortalHeader user={{ name: user.name, email: user.email }} />
          <main className="flex-1 overflow-y-auto p-6">{children}</main>
        </div>
      </div>
    </TooltipProvider>
  );
}
