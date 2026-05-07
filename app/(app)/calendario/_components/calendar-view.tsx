"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { eliminarEventoAction } from "@/app/_actions/eventos/eliminar";
import Link from "next/link";

// FullCalendar pulls in DOM-only modules; load on the client only.
const FullCalendar = dynamic(() => import("@fullcalendar/react"), {
  ssr: false,
  loading: () => <Skeleton className="h-[600px] w-full" />,
});
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import esLocale from "@fullcalendar/core/locales/es";

type EventoProps = {
  id: string;
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  extendedProps: {
    description: string | null;
    location: string | null;
    caseId: string | null;
    caseCode: string | null;
    caseTitle: string | null;
  };
};

export function CalendarView({ eventos }: { eventos: EventoProps[] }) {
  const [selected, setSelected] = useState<EventoProps | null>(null);

  return (
    <div className="rounded-lg border bg-card p-4">
      <FullCalendar
        plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
        initialView="dayGridMonth"
        headerToolbar={{
          left: "prev,next today",
          center: "title",
          right: "dayGridMonth,timeGridWeek,timeGridDay",
        }}
        buttonText={{
          today: "Hoy",
          month: "Mes",
          week: "Semana",
          day: "Día",
        }}
        locale={esLocale}
        events={eventos}
        eventClick={(info) => {
          info.jsEvent.preventDefault();
          const e = eventos.find((x) => x.id === info.event.id);
          if (e) setSelected(e);
        }}
        height="auto"
        eventDisplay="block"
        eventTimeFormat={{ hour: "2-digit", minute: "2-digit", meridiem: false }}
        slotLabelFormat={{ hour: "2-digit", minute: "2-digit", meridiem: false }}
        firstDay={1}
        nowIndicator
      />

      <Dialog open={!!selected} onOpenChange={(v) => !v && setSelected(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{selected?.title}</DialogTitle>
          </DialogHeader>
          {selected ? (
            <div className="space-y-3 text-sm">
              <p>
                <span className="text-xs uppercase tracking-wide text-muted-foreground">Inicio: </span>
                {new Date(selected.start).toLocaleString("es-DO")}
              </p>
              <p>
                <span className="text-xs uppercase tracking-wide text-muted-foreground">Fin: </span>
                {new Date(selected.end).toLocaleString("es-DO")}
              </p>
              {selected.extendedProps.location ? (
                <p>
                  <span className="text-xs uppercase tracking-wide text-muted-foreground">Lugar: </span>
                  {selected.extendedProps.location}
                </p>
              ) : null}
              {selected.extendedProps.caseCode ? (
                <p>
                  <Badge variant="outline" className="font-mono">
                    {selected.extendedProps.caseCode}
                  </Badge>{" "}
                  <Link
                    href={`/casos/${selected.extendedProps.caseId}`}
                    className="hover:underline"
                  >
                    {selected.extendedProps.caseTitle}
                  </Link>
                </p>
              ) : null}
              {selected.extendedProps.description ? (
                <p className="whitespace-pre-wrap rounded-md border bg-muted/30 p-3">
                  {selected.extendedProps.description}
                </p>
              ) : null}
              <form
                action={async (fd) => {
                  await eliminarEventoAction(fd);
                  setSelected(null);
                }}
                className="flex justify-end gap-2 pt-2"
              >
                <input type="hidden" name="eventId" value={selected.id} />
                <Button type="submit" variant="destructive" size="sm">
                  Eliminar evento
                </Button>
              </form>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
