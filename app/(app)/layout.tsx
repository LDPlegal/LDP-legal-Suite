import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";
import { TooltipProvider } from "@/components/ui/tooltip";
import { getCurrentUser } from "@/lib/auth/session";
import { getCurrentFirm } from "@/lib/db/queries/firms";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const firm = await getCurrentFirm(user.firmId, user.userId);

  return (
    <TooltipProvider>
      <div className="flex min-h-screen w-full">
        <Sidebar firmName={firm?.name ?? "Firma"} />
        <div className="flex min-w-0 flex-1 flex-col">
          <Header user={{ name: user.name, email: user.email, role: user.role }} />
          <main className="flex-1 overflow-y-auto p-6">{children}</main>
        </div>
      </div>
    </TooltipProvider>
  );
}
