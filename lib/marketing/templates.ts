// F7+ Marketing — definición de plantillas para Instagram + LinkedIn.
//
// Cada template es un objeto declarativo:
//   - id: clave única
//   - kind: "post" (4:5 1080×1350) | "story" (9:16 1080×1920) | "cover"
//   - label: nombre legible que el usuario ve
//   - controls: lista de tweaks editables (texto, foto, color, slider)
//   - defaults: valores iniciales de copy/foto/sizing
//
// El editor renderiza las plantillas a través de un mapa por id (lib/marketing/registry.tsx).
//
// Inspirado en el HTML de Gabriel — porteado al stack Next.js/Tailwind del app.

export type TemplateKind = "post" | "story" | "cover";

export type ControlDef =
  | {
      kind: "photo";
      key: string;
      label: string;
      options: Array<{ value: string; label: string }>;
    }
  | { kind: "text"; key: string; label: string; multiline?: boolean }
  | {
      kind: "slider";
      key: string;
      label: string;
      min: number;
      max: number;
      step?: number;
    }
  | {
      kind: "select";
      key: string;
      label: string;
      options: Array<{ value: string; label: string }>;
    }
  | {
      kind: "color";
      key: string;
      label: string;
      options: string[];
    };

export type TemplateDef = {
  id: string;
  kind: TemplateKind;
  label: string;
  /** Width × height en pixeles del export final */
  size: { w: number; h: number };
  /** Defaults de todas las propiedades editables */
  defaults: Record<string, string | number>;
  /** Lista ordenada de controles que aparecen en el panel derecho */
  controls: ControlDef[];
};

// =============================================================================
// Photo banks
// =============================================================================
// Las fotos vienen de /public/marketing-photos/. Si Gabriel quiere subir las
// fotos originales (las de ldplegal.com.do — atlas, pisapapeles, biblioteca,
// etc.) las pone ahí. Mientras tanto usamos un set genérico que muestra el
// estilo correcto.

export const BG_PHOTOS = [
  { value: "/marketing-photos/firma-atlas.jpg", label: "Atlas RD + escritorio" },
  { value: "/marketing-photos/oficina-pisapapeles.jpg", label: "Pisapapeles globo" },
  { value: "/marketing-photos/oficina-pisapapeles-2.jpg", label: "Pisapapeles mapamundi" },
  { value: "/marketing-photos/oficina-membrete.jpg", label: "Membrete LDP" },
  { value: "/marketing-photos/oficina-atlas.jpg", label: "Libros + globo Atlas" },
  { value: "/marketing-photos/oficina-grabados.jpg", label: "Grabados legales" },
  { value: "/marketing-photos/oficina-cuadros.jpg", label: "Sala con cuadros" },
  { value: "/marketing-photos/oficina-discobolo.jpg", label: "Discóbolo" },
  { value: "/marketing-photos/biplano-laton.jpg", label: "Biplano latón" },
  { value: "/marketing-photos/publicaciones-biblioteca-crop.jpg", label: "Biblioteca" },
  { value: "/marketing-photos/playa-caribe.jpg", label: "Playa caribe" },
];

export const AUTHOR_PHOTOS = [
  { value: "", label: "Sin foto" },
  { value: "/marketing-photos/team-jorge.jpg", label: "Jorge" },
  { value: "/marketing-photos/team-katty.jpg", label: "Katty" },
  { value: "/marketing-photos/team-perla.jpg", label: "Perla" },
  { value: "/marketing-photos/team-gabriel.jpg", label: "Gabriel" },
];

export const FROST_TINTS = [
  "rgba(14, 31, 59, 0.32)",
  "rgba(14, 31, 59, 0.55)",
  "rgba(8, 14, 24, 0.45)",
  "rgba(8, 14, 24, 0.70)",
  "rgba(239, 231, 213, 0.10)",
  "rgba(122, 150, 179, 0.22)",
  "rgba(70, 50, 30, 0.40)",
];

export const ALIGN_OPTIONS = [
  { value: "left", label: "Izquierda" },
  { value: "center", label: "Centrado" },
  { value: "right", label: "Derecha" },
  { value: "justify", label: "Justificado" },
];

// =============================================================================
// Reusable frost controls — el patrón compartido por todos los posts
// =============================================================================

function frostControls(sizeMin: number, sizeMax: number): ControlDef[] {
  return [
    { kind: "slider", key: "excerptSize", label: "Tamaño del texto", min: sizeMin, max: sizeMax },
    { kind: "slider", key: "frostInset", label: "Ancho del cuadro", min: 20, max: 220, step: 4 },
    { kind: "slider", key: "frostPad", label: "Padding interno", min: 12, max: 64, step: 2 },
    { kind: "select", key: "excerptAlign", label: "Alineado", options: ALIGN_OPTIONS },
    { kind: "color", key: "frostTint", label: "Color del frost", options: FROST_TINTS },
  ];
}

// =============================================================================
// Templates
// =============================================================================

export const TEMPLATES: TemplateDef[] = [
  // -------------------------------------------------------------------------
  // Post 01 — Presentación
  // -------------------------------------------------------------------------
  {
    id: "p1",
    kind: "post",
    label: "01 · Presentación",
    size: { w: 1080, h: 1350 },
    defaults: {
      photo: "/marketing-photos/oficina-pisapapeles-2.jpg",
      statement:
        "Una firma boutique de *abogados* dominicanos — orientada al ejercicio del derecho aplicado a los *negocios.*",
      value1: "Integridad",
      value2: "Excelencia",
      value3: "Criterio",
      excerptSize: 36,
      frostInset: 80,
      frostPad: 34,
      frostTint: "rgba(14, 31, 59, 0.32)",
      excerptAlign: "left",
    },
    controls: [
      { kind: "photo", key: "photo", label: "Foto de fondo", options: BG_PHOTOS },
      { kind: "text", key: "statement", label: "Declaración", multiline: true },
      { kind: "text", key: "value1", label: "Valor i." },
      { kind: "text", key: "value2", label: "Valor ii." },
      { kind: "text", key: "value3", label: "Valor iii." },
      ...frostControls(20, 56),
    ],
  },

  // -------------------------------------------------------------------------
  // Post 04 — Día del Abogado
  // -------------------------------------------------------------------------
  {
    id: "p4",
    kind: "post",
    label: "04 · Día del Abogado",
    size: { w: 1080, h: 1350 },
    defaults: {
      photo: "/marketing-photos/oficina-grabados.jpg",
      monthLabel: "Julio",
      year: "MMXXVI",
      dayRoman: "XXIV",
      title: "Día del *Abogado* Dominicano.",
      dedication:
        "A quienes hacen del derecho un oficio de cuidado, prudencia y servicio — nuestro reconocimiento a la profesión que escogimos honrar.",
      excerptSize: 24,
      frostInset: 80,
      frostPad: 32,
      frostTint: "rgba(14, 31, 59, 0.32)",
      excerptAlign: "left",
    },
    controls: [
      { kind: "photo", key: "photo", label: "Foto de fondo", options: BG_PHOTOS },
      { kind: "text", key: "monthLabel", label: "Mes" },
      { kind: "text", key: "year", label: "Año (romano)" },
      { kind: "text", key: "dayRoman", label: "Día (romano)" },
      { kind: "text", key: "title", label: "Título", multiline: true },
      { kind: "text", key: "dedication", label: "Dedicatoria", multiline: true },
      ...frostControls(14, 40),
    ],
  },
];

export function getTemplate(id: string): TemplateDef | undefined {
  return TEMPLATES.find((t) => t.id === id);
}
