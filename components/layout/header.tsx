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
  return (
    <header
      className="sticky top-0 z-20 flex h-16 items-center gap-2 px-3 md:gap-3 md:px-5 border-b border-border bg-[var(--glass-bg)] backdrop-blur-2xl"
      style={{
        // Inner highlight para que se vea el "vidrio" claro arriba.
        boxShadow:
          "inset 0 1px 0 rgba(255,255,255,0.5), 0 1px 0 rgba(15,76,129,0.04)",
      }}
    >
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
