"use client";

import { useActionState, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Pencil, Plus, UserMinus } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  invitarStaffAction,
  actualizarRolStaffAction,
  actualizarPerfilStaffAction,
  desactivarStaffAction,
  resetearPasswordStaffAction,
  type InvitarStaffState,
  type UpdateRoleState,
  type UpdateProfileState,
  type ResetPasswordState,
} from "@/app/_actions/configuracion/invitar-staff";

type StaffMember = {
  id: string;
  name: string;
  email: string;
  role: "admin" | "partner" | "lawyer" | "paralegal" | "tester" | "client";
  status: "active" | "invited" | "suspended";
  hourlyRate: string | null;
  lastLoginAt: Date | null;
};

const ROLE_LABEL: Record<StaffMember["role"], string> = {
  admin: "Admin",
  partner: "Socio",
  lawyer: "Abogado/a",
  paralegal: "Paralegal",
  tester: "Tester informático",
  client: "Cliente",
};

const ROLE_VARIANT: Record<StaffMember["role"], "default" | "secondary" | "outline" | "warning"> = {
  admin: "warning",
  partner: "default",
  lawyer: "secondary",
  paralegal: "outline",
  tester: "warning",
  client: "outline",
};

const initialInvite: InvitarStaffState = { ok: true, userId: "" };
const initialRole: UpdateRoleState = { ok: true };
const initialProfile: UpdateProfileState = { ok: true };
const initialPwd: ResetPasswordState = { ok: true };

export function TeamPanel({
  members,
  currentUserId,
  currentRole,
}: {
  members: StaffMember[];
  currentUserId: string;
  currentRole: StaffMember["role"];
}) {
  const canInvite = currentRole === "admin" || currentRole === "partner";
  // Only show staff in this panel; portal clients live in /clientes/[id].
  const staff = members.filter((m) => m.role !== "client");

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          {staff.length} {staff.length === 1 ? "miembro" : "miembros"} del equipo
        </p>
        {canInvite ? (
          <InviteDrawer
            isAdmin={currentRole === "admin"}
            trigger={
              <Button variant="outline" size="sm">
                <Plus className="h-3.5 w-3.5" />
                Invitar miembro
              </Button>
            }
          />
        ) : null}
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Nombre</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Rol</TableHead>
            <TableHead>Estado</TableHead>
            <TableHead className="text-right">Tarifa/h</TableHead>
            <TableHead>Último acceso</TableHead>
            <TableHead className="w-10" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {staff.map((m) => (
            <TableRow key={m.id}>
              <TableCell>
                <p className="text-sm font-medium">{m.name}</p>
                {m.id === currentUserId ? (
                  <span className="text-[10px] text-muted-foreground">(tú)</span>
                ) : null}
              </TableCell>
              <TableCell className="text-xs text-muted-foreground">{m.email}</TableCell>
              <TableCell>
                <Badge variant={ROLE_VARIANT[m.role]}>{ROLE_LABEL[m.role]}</Badge>
              </TableCell>
              <TableCell>
                <Badge variant="outline" className="text-[10px]">
                  {m.status}
                </Badge>
              </TableCell>
              <TableCell className="text-right font-mono text-xs tabular-nums">
                {m.hourlyRate ? `DOP ${Number(m.hourlyRate).toFixed(2)}` : "—"}
              </TableCell>
              <TableCell className="text-xs text-muted-foreground">
                {m.lastLoginAt
                  ? new Date(m.lastLoginAt).toLocaleDateString("es-DO")
                  : "Sin acceso"}
              </TableCell>
              <TableCell>
                {canInvite && m.id !== currentUserId ? (
                  <div className="flex gap-1">
                    <EditMemberDrawer
                      member={m}
                      isAdmin={currentRole === "admin"}
                      trigger={
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          aria-label="Editar miembro"
                          title="Editar nombre, email, tarifa, rol o contraseña"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                      }
                    />
                    <ConfirmButton
                      action={desactivarStaffAction}
                      title={`¿Desactivar a ${m.name}?`}
                      description="Sus sesiones activas se cerrarán inmediatamente y no podrá volver a iniciar sesión. Esta acción es difícil de revertir (requiere SQL manual)."
                      confirmLabel="Desactivar"
                      trigger={
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive"
                          aria-label="Desactivar miembro"
                        >
                          <UserMinus className="h-3.5 w-3.5" />
                        </Button>
                      }
                    >
                      <input type="hidden" name="targetId" value={m.id} />
                    </ConfirmButton>
                  </div>
                ) : null}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function InviteDrawer({
  trigger,
  isAdmin,
}: {
  trigger: ReactNode;
  isAdmin: boolean;
}) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const [state, action, pending] = useActionState<InvitarStaffState, FormData>(
    async (prev, fd) => {
      const r = await invitarStaffAction(prev, fd);
      if (r.ok) {
        toast.success("Miembro agregado", {
          description: "Comparte la contraseña temporal con él/ella.",
        });
        setOpen(false);
        router.refresh();
      } else {
        toast.error(r.error);
      }
      return r;
    },
    initialInvite,
  );

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>{trigger}</SheetTrigger>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Invitar miembro al equipo</SheetTitle>
          <SheetDescription>
            El nuevo miembro inicia sesión en /login con la contraseña temporal
            que ingresas aquí. Puede cambiarla después desde su perfil.
          </SheetDescription>
        </SheetHeader>
        <form action={action} className="flex flex-1 flex-col min-h-0">
          <SheetBody className="space-y-4">
            <div className="space-y-1.5">
              <Label>Nombre *</Label>
              <Input name="name" required maxLength={120} />
            </div>
            <div className="space-y-1.5">
              <Label>Email *</Label>
              <Input name="email" type="email" required maxLength={200} />
            </div>
            <div className="space-y-1.5">
              <Label>Rol *</Label>
              <select
                name="role"
                required
                defaultValue="lawyer"
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                {isAdmin ? <option value="admin">Admin</option> : null}
                <option value="partner">Socio</option>
                <option value="lawyer">Abogado/a</option>
                <option value="paralegal">Paralegal</option>
                <option value="tester">Tester informático</option>
              </select>
              <p className="text-[11px] text-muted-foreground">
                {isAdmin
                  ? "Solo los admins pueden crear otros admins. El rol Tester tiene acceso a todo (igual que admin) — úsalo solo para QA del sistema."
                  : "Para crear un admin, pide a un admin existente."}
              </p>
            </div>
            <div className="space-y-1.5">
              <Label>Contraseña temporal *</Label>
              <Input
                name="password"
                type="text"
                minLength={8}
                maxLength={72}
                required
                placeholder="Mínimo 8 caracteres"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Tarifa por hora (DOP)</Label>
              <Input name="hourlyRate" placeholder="2500.00" className="font-mono" />
              <p className="text-[11px] text-muted-foreground">
                Opcional. Puedes definir tarifas específicas por materia o
                cliente desde la pestaña Tarifas.
              </p>
            </div>
            {!state.ok ? (
              <p className="text-sm text-destructive">{state.error}</p>
            ) : null}
          </SheetBody>
          <SheetFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? <Loader2 className="animate-spin" /> : null}
              Agregar miembro
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}

function EditMemberDrawer({
  trigger,
  member,
  isAdmin,
}: {
  trigger: ReactNode;
  member: StaffMember;
  isAdmin: boolean;
}) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  // Form principal: nombre, email, hourlyRate.
  const [profileState, profileAction, profilePending] = useActionState<
    UpdateProfileState,
    FormData
  >(
    async (prev, fd) => {
      const r = await actualizarPerfilStaffAction(prev, fd);
      if (r.ok) {
        toast.success("Perfil actualizado");
        router.refresh();
      } else {
        toast.error(r.error);
      }
      return r;
    },
    initialProfile,
  );

  // Form de rol (separado porque solo admin puede tocarlo).
  const [roleState, roleAction, rolePending] = useActionState<UpdateRoleState, FormData>(
    async (prev, fd) => {
      const r = await actualizarRolStaffAction(prev, fd);
      if (r.ok) {
        toast.success("Rol actualizado");
        router.refresh();
      } else {
        toast.error(r.error);
      }
      return r;
    },
    initialRole,
  );

  // Form de password reset.
  const [pwdState, pwdAction, pwdPending] = useActionState<ResetPasswordState, FormData>(
    async (prev, fd) => {
      const r = await resetearPasswordStaffAction(prev, fd);
      if (r.ok) {
        toast.success("Contraseña actualizada", {
          description:
            "Las sesiones activas del usuario fueron cerradas. Pasale la nueva contraseña directamente.",
        });
        // El form se vacía automáticamente con el reset implícito de useActionState.
        router.refresh();
      } else {
        toast.error(r.error);
      }
      return r;
    },
    initialPwd,
  );

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>{trigger}</SheetTrigger>
      <SheetContent className="sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Editar a {member.name}</SheetTitle>
          <SheetDescription className="text-xs">
            Cambiá nombre, email, tarifa, rol o resetá la contraseña. Los cambios
            quedan registrados en el audit log.
          </SheetDescription>
        </SheetHeader>
        <SheetBody className="space-y-6 overflow-y-auto">
          {/* ------------ Perfil básico ------------ */}
          <form action={profileAction} className="space-y-3">
            <input type="hidden" name="targetId" value={member.id} />
            <div>
              <Label htmlFor={`name-${member.id}`}>Nombre completo</Label>
              <Input
                id={`name-${member.id}`}
                name="name"
                defaultValue={member.name}
                required
                maxLength={120}
              />
            </div>
            <div>
              <Label htmlFor={`email-${member.id}`}>Email</Label>
              <Input
                id={`email-${member.id}`}
                name="email"
                type="email"
                defaultValue={member.email}
                required
                maxLength={200}
              />
              <p className="mt-1 text-[11px] text-muted-foreground">
                Cambiar el email cambia también la cuenta con la que el usuario hace login.
              </p>
            </div>
            <div>
              <Label htmlFor={`rate-${member.id}`}>Tarifa por hora (DOP)</Label>
              <Input
                id={`rate-${member.id}`}
                name="hourlyRate"
                type="text"
                inputMode="decimal"
                pattern="\d+(\.\d{1,2})?"
                defaultValue={member.hourlyRate ?? ""}
                placeholder="3500.00"
              />
            </div>
            {!profileState.ok ? (
              <p className="text-sm text-destructive">{profileState.error}</p>
            ) : null}
            <Button type="submit" disabled={profilePending} className="w-full">
              {profilePending ? <Loader2 className="animate-spin" /> : null}
              Guardar perfil
            </Button>
          </form>

          {/* ------------ Rol (solo admin) ------------ */}
          {isAdmin ? (
            <div className="rounded-md border bg-muted/30 p-3">
              <p className="mb-2 text-xs font-medium">Rol</p>
              <form action={roleAction} className="space-y-2">
                <input type="hidden" name="targetId" value={member.id} />
                <select
                  name="role"
                  defaultValue={member.role === "client" ? "lawyer" : member.role}
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="admin">Admin</option>
                  <option value="partner">Socio</option>
                  <option value="lawyer">Abogado/a</option>
                  <option value="paralegal">Paralegal</option>
                  <option value="tester">Tester informático</option>
                </select>
                {!roleState.ok ? (
                  <p className="text-xs text-destructive">{roleState.error}</p>
                ) : null}
                <Button
                  type="submit"
                  disabled={rolePending}
                  variant="outline"
                  size="sm"
                  className="w-full"
                >
                  {rolePending ? <Loader2 className="animate-spin h-3 w-3" /> : null}
                  Cambiar rol
                </Button>
              </form>
            </div>
          ) : null}

          {/* ------------ Reset password ------------ */}
          <div className="rounded-md border border-amber-200 bg-amber-50/40 p-3 dark:border-amber-900/50 dark:bg-amber-950/20">
            <p className="mb-1 text-xs font-medium">Resetear contraseña</p>
            <p className="mb-2 text-[11px] text-muted-foreground">
              Vas a definir una contraseña nueva manualmente. Las sesiones activas del
              usuario se cierran. Compartile la nueva contraseña directamente.
            </p>
            <form action={pwdAction} className="space-y-2">
              <input type="hidden" name="targetId" value={member.id} />
              <Input
                name="newPassword"
                type="password"
                placeholder="Mínimo 8 caracteres"
                minLength={8}
                maxLength={72}
                required
                autoComplete="new-password"
              />
              {!pwdState.ok ? (
                <p className="text-xs text-destructive">{pwdState.error}</p>
              ) : null}
              <Button
                type="submit"
                disabled={pwdPending}
                variant="outline"
                size="sm"
                className="w-full"
              >
                {pwdPending ? <Loader2 className="animate-spin h-3 w-3" /> : null}
                Resetear contraseña
              </Button>
            </form>
          </div>
        </SheetBody>
        <SheetFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            Cerrar
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
