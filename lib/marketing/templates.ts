// F7+ Marketing — definición de plantillas para Instagram + LinkedIn.
//
// Cada template es un objeto declarativo:
//   - id: clave única
//   - kind: "post" (4:5 1080×1350) | "story" (9:16 1080×1920) | "cover" (custom)
//   - label: nombre legible que el usuario ve
//   - controls: lista de tweaks editables (texto, foto, color, slider, fuente)
//   - defaults: valores iniciales de copy/foto/sizing
//
// El editor renderiza cada plantilla a través del registry (registry.tsx).

export type TemplateKind = "post" | "story" | "cover";

export type ControlDef =
  | {
      kind: "photo";
      key: string;
      label: string;
      options: Array<{ value: string; label: string }>;
      aspect?: string;
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
  /** Tamaño export final en píxeles */
  size: { w: number; h: number };
  /** Defaults de todas las propiedades editables */
  defaults: Record<string, string | number>;
  /** Lista ordenada de controles del panel derecho */
  controls: ControlDef[];
};

// =============================================================================
// Photo banks (vienen de /public/marketing-photos/ — copiadas de la web LDP)
// =============================================================================

export const BG_PHOTOS = [
  { value: "/marketing-photos/firma-atlas.jpg", label: "Atlas RD + escritorio" },
  { value: "/marketing-photos/oficina-pisapapeles.jpg", label: "Pisapapeles globo" },
  { value: "/marketing-photos/oficina-pisapapeles-2.jpg", label: "Pisapapeles mapamundi" },
  { value: "/marketing-photos/oficina-membrete.jpg", label: "Membrete LDP" },
  { value: "/marketing-photos/oficina-atlas.jpg", label: "Libros + globo Atlas" },
  { value: "/marketing-photos/oficina-globo.jpg", label: "Oficina con globo" },
  { value: "/marketing-photos/oficina-biblioteca.jpg", label: "Biblioteca" },
  { value: "/marketing-photos/oficina-grabados.jpg", label: "Grabados legales" },
  { value: "/marketing-photos/oficina-cuadros.jpg", label: "Sala con cuadros" },
  { value: "/marketing-photos/oficina-discobolo.jpg", label: "Discóbolo" },
  { value: "/marketing-photos/biplano-laton.jpg", label: "Biplano latón" },
  { value: "/marketing-photos/publicaciones-biblioteca.jpg", label: "Biblioteca publicaciones" },
  { value: "/marketing-photos/publicaciones-biblioteca-crop.jpg", label: "Biblioteca crop" },
  { value: "/marketing-photos/contacto-papeleria.jpg", label: "Papelería contacto" },
  { value: "/marketing-photos/playa-caribe.jpg", label: "Playa caribe" },
];

export const AUTHOR_PHOTOS = [
  { value: "", label: "Sin foto" },
  { value: "/marketing-photos/team-jorge.jpg", label: "Jorge" },
  { value: "/marketing-photos/team-katty.jpg", label: "Katty" },
  { value: "/marketing-photos/team-perla.jpg", label: "Perla" },
  { value: "/marketing-photos/team-gabriel.jpg", label: "Gabriel" },
  { value: "/marketing-photos/team-marc.jpg", label: "Marc" },
  { value: "/marketing-photos/team-vantroi.jpg", label: "Vantroi" },
];

// =============================================================================
// Color & alignment options
// =============================================================================

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
// Font system
// =============================================================================
// El cliente puede elegir entre 3 familias para el cuerpo principal de cada
// template. Los nombres son string keys; el resolver en rich-text/font.ts
// devuelve la font stack real.

export const FONT_OPTIONS = [
  { value: "garamond", label: "Garamond editorial (serif)" },
  { value: "cormorant", label: "Cormorant (serif clásico)" },
  { value: "inter", label: "Inter (sans-serif moderno)" },
];

export const FONT_STACKS: Record<string, string> = {
  garamond: '"EB Garamond", "Cormorant Garamond", Georgia, serif',
  cormorant: '"Cormorant Garamond", "EB Garamond", Georgia, serif',
  inter: '"Inter", ui-sans-serif, system-ui, -apple-system, sans-serif',
};

// =============================================================================
// Reusable control groups
// =============================================================================

function frostControls(sizeMin: number, sizeMax: number): ControlDef[] {
  return [
    { kind: "slider", key: "excerptSize", label: "Tamaño del texto", min: sizeMin, max: sizeMax },
    { kind: "slider", key: "frostInset", label: "Ancho del cuadro", min: 20, max: 240, step: 4 },
    { kind: "slider", key: "frostPad", label: "Padding interno", min: 12, max: 72, step: 2 },
    { kind: "select", key: "excerptAlign", label: "Alineado", options: ALIGN_OPTIONS },
    { kind: "color", key: "frostTint", label: "Color del frost", options: FROST_TINTS },
    { kind: "select", key: "font", label: "Fuente principal", options: FONT_OPTIONS },
  ];
}

// Bloques de texto extra disponibles en cada template — el usuario puede
// dejarlos vacíos para que no aparezcan.
function extraTextControls(): ControlDef[] {
  return [
    { kind: "text", key: "extra1", label: "Texto extra #1 (opcional)", multiline: true },
    { kind: "text", key: "extra2", label: "Texto extra #2 (opcional)", multiline: true },
  ];
}

// =============================================================================
// Templates
// =============================================================================

export const TEMPLATES: TemplateDef[] = [
  // -------------------------------------------------------------------------
  // POST 01 — Presentación
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
      font: "garamond",
      extra1: "",
      extra2: "",
    },
    controls: [
      { kind: "photo", key: "photo", label: "Foto de fondo", options: BG_PHOTOS },
      { kind: "text", key: "statement", label: "Declaración", multiline: true },
      { kind: "text", key: "value1", label: "Valor i." },
      { kind: "text", key: "value2", label: "Valor ii." },
      { kind: "text", key: "value3", label: "Valor iii." },
      ...frostControls(20, 56),
      ...extraTextControls(),
    ],
  },

  // -------------------------------------------------------------------------
  // POST 02 — Áreas de práctica
  // -------------------------------------------------------------------------
  {
    id: "p2",
    kind: "post",
    label: "02 · Áreas de práctica",
    size: { w: 1080, h: 1350 },
    defaults: {
      photo: "/marketing-photos/oficina-membrete.jpg",
      intro:
        "De la *protección patrimonial* al *arbitraje* comercial y deportivo.",
      area1: "Derecho *Corporativo*",
      area2: "Arbitraje *Comercial* y *Deportivo*",
      area3: "Sucesiones y *Liberalidades*",
      area4: "Litigios *Civiles, Laborales* y *Administrativos*",
      excerptSize: 32,
      frostInset: 80,
      frostPad: 36,
      frostTint: "rgba(14, 31, 59, 0.32)",
      excerptAlign: "left",
      font: "garamond",
      extra1: "",
      extra2: "",
    },
    controls: [
      { kind: "photo", key: "photo", label: "Foto de fondo", options: BG_PHOTOS },
      { kind: "text", key: "intro", label: "Intro", multiline: true },
      { kind: "text", key: "area1", label: "Área i." },
      { kind: "text", key: "area2", label: "Área ii." },
      { kind: "text", key: "area3", label: "Área iii." },
      { kind: "text", key: "area4", label: "Área iv." },
      ...frostControls(18, 48),
      ...extraTextControls(),
    ],
  },

  // -------------------------------------------------------------------------
  // POST 03 — Publicación destacada
  // -------------------------------------------------------------------------
  {
    id: "p3",
    kind: "post",
    label: "03 · Publicación",
    size: { w: 1080, h: 1350 },
    defaults: {
      photo: "/marketing-photos/oficina-pisapapeles.jpg",
      authorPhoto: "/marketing-photos/team-gabriel.jpg",
      pubCategory: "Corporativo",
      pubDate: "Mayo 2026",
      pubTitle:
        "Reflexiones sobre la adecuación estructural en la *empresa\ndominicana*",
      pubExcerpt:
        'Es en esos momentos cuando la calidad del mantenimiento corporativo, la solidez de los instrumentos internos que gobiernan la relación entre los titulares, y la previsión con la que se ha organizado el patrimonio empresarial, dejan de ser asuntos abstractos."',
      pubAuthor: "Gabriel A. Peralta Rizik",
      pubReadTime: "8 min. de lectura",
      excerptSize: 30,
      frostInset: 80,
      frostPad: 32,
      frostTint: "rgba(14, 31, 59, 0.45)",
      excerptAlign: "left",
      font: "garamond",
      authorNameSize: 15,
      authorPhotoSize: 92,
      extra1: "",
      extra2: "",
    },
    controls: [
      { kind: "photo", key: "photo", label: "Foto de fondo", options: BG_PHOTOS },
      {
        kind: "photo",
        key: "authorPhoto",
        label: "Foto del autor",
        options: AUTHOR_PHOTOS,
        aspect: "1 / 1",
      },
      { kind: "text", key: "pubCategory", label: "Categoría" },
      { kind: "text", key: "pubDate", label: "Fecha" },
      { kind: "text", key: "pubTitle", label: "Título", multiline: true },
      { kind: "text", key: "pubExcerpt", label: "Resumen", multiline: true },
      { kind: "text", key: "pubAuthor", label: "Autor" },
      { kind: "text", key: "pubReadTime", label: "Lectura" },
      ...frostControls(14, 40),
      { kind: "slider", key: "authorNameSize", label: "Tamaño nombre autor", min: 9, max: 22 },
      { kind: "slider", key: "authorPhotoSize", label: "Tamaño foto autor", min: 40, max: 140, step: 2 },
      ...extraTextControls(),
    ],
  },

  // -------------------------------------------------------------------------
  // POST 04 — Día del Abogado / Efeméride
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
      font: "garamond",
      extra1: "",
      extra2: "",
    },
    controls: [
      { kind: "photo", key: "photo", label: "Foto de fondo", options: BG_PHOTOS },
      { kind: "text", key: "monthLabel", label: "Mes" },
      { kind: "text", key: "year", label: "Año (romano)" },
      { kind: "text", key: "dayRoman", label: "Día (romano)" },
      { kind: "text", key: "title", label: "Título", multiline: true },
      { kind: "text", key: "dedication", label: "Dedicatoria", multiline: true },
      ...frostControls(14, 40),
      ...extraTextControls(),
    ],
  },

  // -------------------------------------------------------------------------
  // STORY 01-04 — versiones 9:16 (mismo contenido, layout vertical)
  // -------------------------------------------------------------------------
  {
    id: "s1",
    kind: "story",
    label: "Story · Presentación",
    size: { w: 1080, h: 1920 },
    defaults: {
      photo: "/marketing-photos/oficina-pisapapeles-2.jpg",
      statement:
        "Una firma boutique de *abogados* dominicanos — orientada al ejercicio del derecho aplicado a los *negocios.*",
      value1: "Integridad",
      value2: "Excelencia",
      value3: "Criterio",
      excerptSize: 48,
      frostInset: 90,
      frostPad: 42,
      frostTint: "rgba(14, 31, 59, 0.32)",
      excerptAlign: "left",
      font: "garamond",
      extra1: "",
      extra2: "",
    },
    controls: [
      { kind: "photo", key: "photo", label: "Foto de fondo", options: BG_PHOTOS },
      { kind: "text", key: "statement", label: "Declaración", multiline: true },
      { kind: "text", key: "value1", label: "Valor i." },
      { kind: "text", key: "value2", label: "Valor ii." },
      { kind: "text", key: "value3", label: "Valor iii." },
      ...frostControls(28, 72),
      ...extraTextControls(),
    ],
  },
  {
    id: "s2",
    kind: "story",
    label: "Story · Áreas",
    size: { w: 1080, h: 1920 },
    defaults: {
      photo: "/marketing-photos/oficina-membrete.jpg",
      intro:
        "De la *protección patrimonial* al *arbitraje* comercial y deportivo.",
      area1: "Derecho *Corporativo*",
      area2: "Arbitraje *Comercial* y *Deportivo*",
      area3: "Sucesiones y *Liberalidades*",
      area4: "Litigios *Civiles, Laborales* y *Administrativos*",
      excerptSize: 42,
      frostInset: 90,
      frostPad: 44,
      frostTint: "rgba(14, 31, 59, 0.32)",
      excerptAlign: "left",
      font: "garamond",
      extra1: "",
      extra2: "",
    },
    controls: [
      { kind: "photo", key: "photo", label: "Foto de fondo", options: BG_PHOTOS },
      { kind: "text", key: "intro", label: "Intro", multiline: true },
      { kind: "text", key: "area1", label: "Área i." },
      { kind: "text", key: "area2", label: "Área ii." },
      { kind: "text", key: "area3", label: "Área iii." },
      { kind: "text", key: "area4", label: "Área iv." },
      ...frostControls(24, 60),
      ...extraTextControls(),
    ],
  },
  {
    id: "s3",
    kind: "story",
    label: "Story · Publicación",
    size: { w: 1080, h: 1920 },
    defaults: {
      photo: "/marketing-photos/oficina-pisapapeles.jpg",
      authorPhoto: "/marketing-photos/team-gabriel.jpg",
      pubCategory: "Corporativo",
      pubDate: "Mayo 2026",
      pubTitle:
        "Reflexiones sobre la adecuación estructural en la *empresa\ndominicana*",
      pubExcerpt:
        'Es en esos momentos cuando la calidad del mantenimiento corporativo, la solidez de los instrumentos internos que gobiernan la relación entre los titulares, y la previsión con la que se ha organizado el patrimonio empresarial, dejan de ser asuntos abstractos."',
      pubAuthor: "Gabriel A. Peralta Rizik",
      pubReadTime: "8 min. de lectura",
      excerptSize: 36,
      frostInset: 80,
      frostPad: 40,
      frostTint: "rgba(14, 31, 59, 0.50)",
      excerptAlign: "left",
      font: "garamond",
      authorNameSize: 18,
      authorPhotoSize: 110,
      extra1: "",
      extra2: "",
    },
    controls: [
      { kind: "photo", key: "photo", label: "Foto de fondo", options: BG_PHOTOS },
      {
        kind: "photo",
        key: "authorPhoto",
        label: "Foto del autor",
        options: AUTHOR_PHOTOS,
        aspect: "1 / 1",
      },
      { kind: "text", key: "pubCategory", label: "Categoría" },
      { kind: "text", key: "pubDate", label: "Fecha" },
      { kind: "text", key: "pubTitle", label: "Título", multiline: true },
      { kind: "text", key: "pubExcerpt", label: "Resumen", multiline: true },
      { kind: "text", key: "pubAuthor", label: "Autor" },
      { kind: "text", key: "pubReadTime", label: "Lectura" },
      ...frostControls(20, 52),
      { kind: "slider", key: "authorNameSize", label: "Tamaño nombre autor", min: 12, max: 28 },
      { kind: "slider", key: "authorPhotoSize", label: "Tamaño foto autor", min: 60, max: 180, step: 2 },
      ...extraTextControls(),
    ],
  },
  {
    id: "s4",
    kind: "story",
    label: "Story · Día del Abogado",
    size: { w: 1080, h: 1920 },
    defaults: {
      photo: "/marketing-photos/oficina-grabados.jpg",
      monthLabel: "Julio",
      year: "MMXXVI",
      dayRoman: "XXIV",
      title: "Día del *Abogado* Dominicano.",
      dedication:
        "A quienes hacen del derecho un oficio de cuidado, prudencia y servicio — nuestro reconocimiento a la profesión que escogimos honrar.",
      excerptSize: 32,
      frostInset: 90,
      frostPad: 40,
      frostTint: "rgba(14, 31, 59, 0.32)",
      excerptAlign: "left",
      font: "garamond",
      extra1: "",
      extra2: "",
    },
    controls: [
      { kind: "photo", key: "photo", label: "Foto de fondo", options: BG_PHOTOS },
      { kind: "text", key: "monthLabel", label: "Mes" },
      { kind: "text", key: "year", label: "Año (romano)" },
      { kind: "text", key: "dayRoman", label: "Día (romano)" },
      { kind: "text", key: "title", label: "Título", multiline: true },
      { kind: "text", key: "dedication", label: "Dedicatoria", multiline: true },
      ...frostControls(18, 50),
      ...extraTextControls(),
    ],
  },

  // -------------------------------------------------------------------------
  // LINKEDIN COVER — 1584×396 (4:1)
  // -------------------------------------------------------------------------
  {
    id: "li",
    kind: "cover",
    label: "LinkedIn · Portada",
    size: { w: 1584, h: 396 },
    defaults: {
      photo: "/marketing-photos/firma-atlas.jpg",
      tagline: "Derecho aplicado a los *negocios.*",
      subline: "Una firma boutique de abogados dominicanos.",
      wordmarkHeight: 132,
      position: "center 58%",
      font: "garamond",
    },
    controls: [
      { kind: "photo", key: "photo", label: "Foto de fondo", options: BG_PHOTOS },
      { kind: "text", key: "tagline", label: "Tagline", multiline: true },
      { kind: "text", key: "subline", label: "Sub-tagline" },
      { kind: "slider", key: "wordmarkHeight", label: "Tamaño monograma", min: 80, max: 180, step: 2 },
      {
        kind: "select",
        key: "position",
        label: "Encuadre de la foto",
        options: [
          { value: "center 30%", label: "Arriba" },
          { value: "center 45%", label: "Centro-arriba" },
          { value: "center 58%", label: "Centro" },
          { value: "center 70%", label: "Centro-abajo" },
          { value: "center 85%", label: "Abajo" },
        ],
      },
      { kind: "select", key: "font", label: "Fuente principal", options: FONT_OPTIONS },
    ],
  },
];

export function getTemplate(id: string): TemplateDef | undefined {
  return TEMPLATES.find((t) => t.id === id);
}
