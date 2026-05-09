import { eq } from "drizzle-orm";
import { Download, Plus, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { listEventsInRange } from "@/lib/db/queries/events";
import { listCases } from "@/lib/db/queries/cases";
import { listFirmUsers } from "@/lib/db/queries/users";
import { listSubscriptionsForUser } from "@/lib/db/queries/subscriptions";
import { requireUser } from "@/lib/auth/session";
import { adminDb } from "@/lib/db/admin";
import { users } from "@/lib/db/schema";
import { CalendarView } from "./_components/calendar-view";
import { EventoFormDrawer } from "./_components/evento-form-drawer";
import { CalendarSyncDrawer } from "./_components/sync-drawer";

export const metadata = { title: "Calendario · LDP Legal Suite" };

export default async function CalendarioPage() {
  const user = await requireUser();

  // Fetch a generous window so navigation between months doesn't refetch
  // for typical browsing. FullCalendar handles in-memory display.
  const start = new Date();
  start.setUTCDate(start.getUTCDate() - 60);
  const end = new Date();
  end.setUTCDate(end.getUTCDate() + 180);

  const [eventos, casos, usuarios, subscriptions, [me]] = await Promise.all([
    listEventsInRange(user.firmId, user.userId, { start, end }),
    listCases(user.firmId, user.userId, { limit: 200, status: "open" }),
    listFirmUsers(user.firmId, user.userId),
    listSubscriptionsForUser(user.firmId, user.userId),
    adminDb
      .select({ icalToken: users.icalToken })
      .from(users)
      .where(eq(users.id, user.userId))
      .limit(1),
  ]);

  // Public base URL for the iCal feed. Falls back to localhost in dev.
  const baseUrl = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Calendario</h1>
          <p className="text-sm text-muted-foreground">
            {eventos.length} {eventos.length === 1 ? "evento" : "eventos"} próximos
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <a href="/api/calendario/export.ics" download>
              <Download className="h-4 w-4" />
              Exportar .ics
            </a>
          </Button>
          <CalendarSyncDrawer
            initialToken={me?.icalToken ?? null}
            baseUrl={baseUrl}
            subscriptions={subscriptions.map((s) => ({
              id: s.id,
              name: s.name,
              url: s.url,
              active: s.active,
              lastSyncedAt: s.lastSyncedAt,
              lastError: s.lastError,
              lastEventCount: s.lastEventCount,
            }))}
            trigger={
              <Button variant="outline">
                <RefreshCw className="h-4 w-4" />
                Sincronizar
              </Button>
            }
          />
          <EventoFormDrawer
            casos={casos.rows.map((c) => ({ id: c.id, code: c.code, title: c.title }))}
            users={usuarios.map((u) => ({ id: u.id, name: u.name }))}
            currentUserId={user.userId}
            trigger={
              <Button>
                <Plus className="h-4 w-4" />
                Nuevo evento
              </Button>
            }
          />
        </div>
      </div>

      <CalendarView
        eventos={eventos.map((e) => ({
          id: e.id,
          title: e.title,
          start: new Date(e.startAt).toISOString(),
          end: new Date(e.endAt).toISOString(),
          allDay: e.allDay,
          extendedProps: {
            description: e.description,
            location: e.location,
            caseId: e.caseId,
            caseCode: e.caseCode,
            caseTitle: e.caseTitle,
          },
        }))}
      />
    </div>
  );
}
