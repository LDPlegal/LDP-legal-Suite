import { ActiveTimerWidget } from "./active-timer";
import { CommandPalette } from "./command-palette";
import { MobileMenuButton } from "./mobile-menu-button";
import { NotificationsBell } from "./notifications-bell";
import { ThemeToggle } from "./theme-toggle";
import { UserMenu } from "./user-menu";

export function Header({
  user,
}: {
  user: { name: string; email: string; role: string };
}) {
  // Topbar de 56px, superficie blanca plana, borde inferior #DFE0DC.
  return (
    <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b border-border bg-card px-3 md:gap-3 md:px-5">
      <MobileMenuButton />
      <CommandPalette />
      <div className="flex-1" />
      <ActiveTimerWidget />
      <NotificationsBell />
      <ThemeToggle />
      <UserMenu name={user.name} email={user.email} role={user.role} />
    </header>
  );
}
