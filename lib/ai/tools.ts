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

// Lee el contenido OCR/texto completo de un documento del expediente. La
// IA invoca esta tool cuando necesita citar literalmente un documento o
// extraer datos específicos (e.g. nombre de socios desde una nómina,
// cláusulas de un contrato previo). El servidor valida que el documento
// pertenece al firm + caso actual.
export const readDocumentTool: AiTool = {
  name: "read_document",
  description:
    "Lee el contenido completo (OCR) de un documento ya cargado en este expediente. Úsalo cuando necesites datos literales: nombres de socios, cláusulas previas, fechas exactas, números de cédula/RNC, etc. NO inventes — si el documento no existe o no tiene OCR, te lo decimos para que marques [DATO PENDIENTE].",
  input_schema: {
    type: "object",
    properties: {
      documentId: {
        type: "string",
        description: "UUID del documento. Lo obtienes del listado en el contexto del expediente.",
      },
      reason: {
        type: "string",
        description:
          "Razón breve por la que necesitás leerlo (queda en el audit log). Ej: 'Sacar nombres de socios para acta'.",
      },
    },
    required: ["documentId"],
  },
};

// Reagenda un evento existente (mueve fecha, cambia duración, cambia
// ubicación). Sólo eventos del caso actual. Requiere confirmación humana
// igual que create_event.
export const updateEventTool: AiTool = {
  name: "update_event",
  description:
    "Reagenda o edita un evento existente del expediente (audiencia, plazo, reunión). SIEMPRE muestra el cambio propuesto al usuario antes de invocar y espera su 'sí'. Mantenete dentro del mismo caso.",
  input_schema: {
    type: "object",
    properties: {
      eventId: {
        type: "string",
        description: "UUID del evento a modificar. Lo sacás del listado de eventos del expediente.",
      },
      startAtIso: {
        type: "string",
        description: "Nueva fecha/hora en ISO 8601 con zona horaria. Omitir si no cambia.",
      },
      durationMinutes: {
        type: "integer",
        minimum: 0,
        maximum: 480,
        description: "Nueva duración en minutos. Omitir si no cambia.",
      },
      title: { type: "string", description: "Nuevo título. Omitir si no cambia." },
      location: { type: "string", description: "Nueva ubicación. Omitir si no cambia." },
      reason: {
        type: "string",
        description: "Razón del cambio (queda en audit log). Ej: 'Tribunal pospuso audiencia'.",
      },
    },
    required: ["eventId"],
  },
};

// Cancela un evento existente. Sigue el mismo modelo de confirmación.
export const cancelEventTool: AiTool = {
  name: "cancel_event",
  description:
    "Cancela un evento existente del expediente. SIEMPRE confirmá con el usuario antes. Las alertas pendientes asociadas también se cancelan.",
  input_schema: {
    type: "object",
    properties: {
      eventId: {
        type: "string",
        description: "UUID del evento a cancelar.",
      },
      reason: {
        type: "string",
        description: "Por qué se cancela (queda en audit log). Ej: 'Cliente desistió'.",
      },
    },
    required: ["eventId", "reason"],
  },
};

// Compone y envía un correo en nombre del usuario (Microsoft Graph).
// SIEMPRE requiere confirmación humana — el usuario revisa el contenido
// final en la tarjeta del chat antes de que se envíe.
//
// La IA debe primero redactar el correo en el chat (texto plano), pedir
// confirmación al usuario, y SÓLO cuando dice "sí mandalo" invocar esta
// tool con el cuerpo final acordado. El skill de cartas LDP aplica al
// cuerpo si es una carta formal; el skill de cobros si es seguimiento de
// pago, etc.
export const sendEmailTool: AiTool = {
  name: "send_email",
  description:
    "Envía un correo a uno o más destinatarios desde la cuenta Microsoft del usuario (Outlook). SIEMPRE redactá primero el correo en texto en el chat, mostrale los destinatarios, asunto, y cuerpo final al usuario, y esperá su 'sí, mandalo' antes de invocar. La firma del usuario se concatena automáticamente al final del cuerpo si está configurada.",
  input_schema: {
    type: "object",
    properties: {
      to: {
        type: "array",
        description: "Lista de destinatarios principales.",
        items: {
          type: "object",
          properties: {
            email: { type: "string", description: "Email válido (RFC 5322)." },
            name: { type: "string", description: "Nombre legible. Opcional." },
          },
          required: ["email"],
        },
        minItems: 1,
      },
      cc: {
        type: "array",
        description: "CC opcional.",
        items: {
          type: "object",
          properties: {
            email: { type: "string" },
            name: { type: "string" },
          },
          required: ["email"],
        },
      },
      subject: { type: "string", description: "Asunto del correo." },
      bodyHtml: {
        type: "string",
        description:
          "Cuerpo del correo en HTML simple (párrafos con <p>, saltos con <br>, listas con <ul><li>). Sin estilos inline complicados — el cliente del destinatario decide cómo se ve.",
      },
      attachDocumentIds: {
        type: "array",
        description: "UUIDs de documentos del expediente para adjuntar (opcional).",
        items: { type: "string" },
      },
    },
    required: ["to", "subject", "bodyHtml"],
  },
};

// Convenience: tools enabled for the matter chat. Other entry points (e.g.
// the global palette) may expose a different subset.
export const matterChatTools: AiTool[] = [
  generateDocumentTool,
  createEventTool,
  readDocumentTool,
  updateEventTool,
  cancelEventTool,
  sendEmailTool,
];
