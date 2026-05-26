"use client";

// Registry: id de template → componente React que lo renderiza.
// Separar registry de templates.ts mantiene los datos (defaults, controles)
// libres de imports React — útil si en el futuro queremos consumir la
// definición desde el server.

import { PostPresentacion } from "./templates/post-presentacion";
import { PostDiaAbogado } from "./templates/post-dia-abogado";

type TemplateComponent = (props: {
  values: Record<string, string | number>;
}) => React.ReactElement;

export const TEMPLATE_COMPONENTS: Record<string, TemplateComponent> = {
  p1: PostPresentacion,
  p4: PostDiaAbogado,
};
