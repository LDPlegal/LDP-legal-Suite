"use client";

import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  CasoFormDrawer,
  type ParentCaseForForm,
} from "@/app/(app)/casos/_components/caso-form-drawer";

// Lanzador del drawer "Nuevo expediente vinculado". Existe como client component para que
// desde el server component del detalle del caso solo crucen datos planos:
// pasar a la vez un elemento JSX (trigger) y el objeto parentCase a través
// de la frontera RSC dentro de un TabsContent hacía que el Sheet no montara.
type Cliente = { id: string; displayName: string };
type User = { id: string; name: string; role: string };
type Template = {
  id: string;
  name: string;
  matterType: string;
  defaultTasks: unknown[];
  defaultEvents: unknown[];
};

export function SubcaseCreateButton({
  clientes,
  users,
  templates,
  parentCase,
}: {
  clientes: Cliente[];
  users: User[];
  templates: Template[];
  parentCase: ParentCaseForForm;
}) {
  return (
    <CasoFormDrawer
      clientes={clientes}
      users={users}
      templates={templates}
      parentCase={parentCase}
      trigger={
        <Button variant="outline" size="sm">
          <Plus className="h-3.5 w-3.5" />
          Nuevo expediente vinculado
        </Button>
      }
    />
  );
}
