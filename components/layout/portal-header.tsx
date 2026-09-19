import { ThemeToggle } from "./theme-toggle";
import { UserMenu } from "./user-menu";

// Stripped-down header for /portal, no command palette, no active-timer
// widget. Clients only need theme + their menu (logout).

export function PortalHeader({
  user,
}: {
  user: { name: string; email: string };
}) {
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-background/80 px-4 backdrop-blur">
      <div className="flex-1" />
      <ThemeToggle />
      <UserMenu name={user.name} email={user.email} role="client" />
    </header>
  );
}
