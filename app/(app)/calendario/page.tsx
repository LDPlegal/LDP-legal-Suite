import { Download, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { listEventsInRange } from "@/lib/db/queries/events";
import { listCases } from "@/lib/db/queries/cases";
import { listFirmUsers } from "@/lib/db/queries/users";
import { requireUser } from "@/lib/auth/session";
import { CalendarView } from "./_components/calendar-view";
import { EventoFormDrawer } from "./_components/evento-form-drawer";

export const metadata = { title: "Calendario · LDP Legal Suite" };

export default async function CalendarioPage() {
  const user = await requireUser();

  // Fetch a generous window so navigation between months doesn't refetch
  // for typical browsing. FullCalendar handles in-memory display.
  const start = new Date();
  start.setUTCDate(start.getUTCDate() - 60);
  const end = new Date();
  end.setUTCDate(end.getUTCDate() + 180);

  const [eventos, casos, usuarios] = await Promise.all([
    listEventsInRange(user.firmId, user.userId, { start, end }),
    listCases(user.firmId, user.userId, { limit: 200, status: "open" }),
    listFirmUsers(user.firmId, user.userId),
  ]);

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
