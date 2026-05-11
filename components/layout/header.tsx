import { ActiveTimerWidget } from "./active-timer";
import { CommandPalette } from "./command-palette";
import { NotificationsBell } from "./notifications-bell";
import { ThemeToggle } from "./theme-toggle";
import { UserMenu } from "./user-menu";

export function Header({
  user,
}: {
  user: { name: string; email: string; role: string };
}) {
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-background/80 px-4 backdrop-blur">
      <CommandPalette />
      <div className="flex-1" />
      <ActiveTimerWidget />
      <NotificationsBell />
      <ThemeToggle />
      <UserMenu name={user.name} email={user.email} role={user.role} />
    </header>
  );
}
