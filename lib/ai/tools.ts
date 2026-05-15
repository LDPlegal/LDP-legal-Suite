// Tool definitions exposed to the chat assistant. Each tool has a
// JSON-Schema input the model fills in, and a server-side handler the
// route layer resolves.
//
// Why centralize: avoids re-defining the schemas in every action file and
// keeps the model's tool surface consistent across the codebase. Adding a
// new tool == adding an entry here + a resolver.

import "server-only";
import type { AiTool } from "./claude";

export const generateDocumentTool: AiTool = {
  name: "generate_document",
  description:
    "Generar un documento legal en formato .docx siguiendo el estilo LDP. Usar ESTA herramienta (y no responder con el documento como texto plano) cuando el usuario pida actas, contratos, demandas, cartas u otros documentos formales. Marca [DATO PENDIENTE: descripción] en el cuerpo cuando un dato no se pueda obtener del contexto del expediente.",
  input_schema: {
    type: "object",
    properties: {
      documentType: {
        type: "string",
        description:
          "Tipo de documento. Ejemplos: 'acta-asamblea', 'acta-asamblea-ordinaria', 'contrato-alquiler', 'contrato-promesa-venta', 'contrato-compraventa', 'carta-formal', 'carta-remision', 'demanda-desalojo', 'propuesta-servicios'.",
      },
      title: {
        type: "string",
        description:
          "Título legible del documento que verá el usuario en el listado. Ej: 'Acta de Asamblea Ordinaria Anual 2026 — Constructora Caribe'.",
      },
      bodyMarkdown: {
        type: "string",
        description:
          "Cuerpo del documento en Markdown LDP. Usar # / ## / ### para títulos, **bold**, *italic*, '– ' para bullets, y [DATO PENDIENTE: ...] para placeholders. NO inventes datos: si falta algo, usa el marcador.",
      },
      summary: {
        type: "string",
        description:
          "Resumen de 1-2 frases que aparece como confirmación en el chat (ej. 'Generé el acta con base en los estatutos y la nómina actualizada. Marqué 3 campos como [DATO PENDIENTE] que necesito que confirmes.').",
      },
    },
    required: ["documentType", "title", "bodyMarkdown", "summary"],
  },
};

export const createEventTool: AiTool = {
  name: "create_event",
  description:
    "Crear un evento (audiencia, plazo procesal, reunión, vencimiento) en el calendario del expediente. SIEMPRE confirma con el usuario en texto antes de invocar esta herramienta, mostrando fecha, hora, lugar y tipo. Solo invocar cuando el usuario haya dicho 'sí, créalo' o equivalente.",
  input_schema: {
    type: "object",
    properties: {
      eventType: {
        type: "string",
        enum: [
          "audiencia",
          "plazo_procesal",
          "reunion_cliente",
          "reunion_interna",
          "vencimiento_administrativo",
          "recordatorio",
        ],
        description:
          "Tipo de evento. 'audiencia' y 'plazo_procesal' tienen alertas agresivas por defecto.",
      },
      title: {
        type: "string",
        description: "Título conciso del evento. Ej: 'Audiencia conciliación — Demanda en desalojo'.",
      },
      description: {
        type: "string",
        description: "Detalles adicionales (referencia al caso, contraparte, documentos necesarios).",
      },
      startAtIso: {
        type: "string",
        description:
          "Fecha y hora de inicio en ISO 8601 con zona horaria. Si el usuario dijo 'jueves 3pm', resuélvela primero pensando en el día actual + zona América/Santo_Domingo.",
      },
      durationMinutes: {
        type: "integer",
        minimum: 15,
        maximum: 480,
        description: "Duración en minutos. Por defecto: 60 para reuniones, 120 para audiencias, 0 para plazos (vencimiento puntual).",
      },
      location: {
        type: "string",
        description: "Ubicación física o link de videollamada. Vacío si es un plazo.",
      },
    },
    required: ["eventType", "title", "startAtIso"],
  },
};

// Convenience: tools enabled for the matter chat. Other entry points (e.g.
// the global palette) may expose a different subset.
export const matterChatTools: AiTool[] = [generateDocumentTool, createEventTool];
