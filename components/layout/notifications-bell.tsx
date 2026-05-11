"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, Check, CheckCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  fetchNotifications,
  marcarLeidaAction,
  marcarTodasLeidasAction,
} from "@/app/_actions/notificaciones";

type Notification = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  href: string | null;
  readAt: Date | null;
  createdAt: Date;
};

export function NotificationsBell() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);

  async function refresh() {
    try {
      const data = await fetchNotifications();
      setItems(data.items as unknown as Notification[]);
      setUnread(data.unreadCount);
    } catch {
      // ignore
    }
  }

  // Refresh on mount + every 60s while the bell is mounted. Cheap query.
  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 60_000);
    return () => clearInterval(id);
  }, []);

  // Also refresh when the dropdown is opened so the user sees fresh data.
  useEffect(() => {
    if (open) refresh();
  }, [open]);

  async function open_and_mark(n: Notification) {
    if (!n.readAt) {
      const fd = new FormData();
      fd.set("notificationId", n.id);
      await marcarLeidaAction(fd);
      setItems((cur) =>
        cur.map((it) => (it.id === n.id ? { ...it, readAt: new Date() } : it)),
      );
      setUnread((u) => Math.max(0, u - 1));
    }
    if (n.href) {
      setOpen(false);
      router.push(n.href);
    }
  }

  async function markAll() {
    await marcarTodasLeidasAction();
    setItems((cur) => cur.map((it) => ({ ...it, readAt: it.readAt ?? new Date() })));
    setUnread(0);
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          aria-label={`Notificaciones${unread > 0 ? ` (${unread} sin leer)` : ""}`}
        >
          <Bell className="h-4 w-4" />
          {unread > 0 ? (
            <span className="absolute -top-1 -right-1 grid h-4 min-w-[16px] place-items-center rounded-full bg-destructive px-1 text-[10px] font-medium text-destructive-foreground">
              {unread > 9 ? "9+" : unread}
            </span>
          ) : null}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <p className="text-sm font-medium">Notificaciones</p>
          {unread > 0 ? (
            <button
              type="button"
              onClick={markAll}
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <CheckCheck className="h-3 w-3" />
              Marcar todas
            </button>
          ) : null}
        </div>
        <div className="max-h-96 overflow-y-auto">
          {items.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Sin notificaciones todavía.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {items.map((n) => (
                <li
                  key={n.id}
                  className={`flex cursor-pointer items-start gap-2 p-3 text-sm hover:bg-accent ${
                    !n.readAt ? "bg-muted/30" : ""
                  }`}
                  onClick={() => open_and_mark(n)}
                >
                  <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center">
                    {!n.readAt ? (
                      <span className="h-2 w-2 rounded-full bg-primary" />
                    ) : (
                      <Check className="h-3 w-3 text-muted-foreground" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium leading-tight">{n.title}</p>
                    {n.body ? (
                      <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                        {n.body}
                      </p>
                    ) : null}
                    <p className="mt-1 text-[10px] text-muted-foreground">
                      {new Date(n.createdAt).toLocaleString("es-DO", {
                        dateStyle: "short",
                        timeStyle: "short",
                      })}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
