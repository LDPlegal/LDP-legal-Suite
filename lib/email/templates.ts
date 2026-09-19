// Reusable email body builders. Plain HTML, inline styles porque cualquier
// cliente de correo (Gmail/Outlook/Apple) debe rendear sin CSS externo.
//
// Estética: paleta sobria (azul marino + dorado) con tipografías de
// sistema. Layout responsive con max-width 600px (estándar para email).
// Todo el wrapping y styling está centralizado en `emailLayout()` para
// que cada template solo declare su contenido.

import "server-only";

const FROM_FIRM = "LDP Legal Suite";

// ---------- Paleta y tokens compartidos ----------
const COLORS = {
  navy: "#0F4C81",      // brand primary
  navyDark: "#0A3866",
  gold: "#B89254",      // brand accent
  goldSoft: "#E8DCC4",
  ink: "#0F172A",       // texto principal
  inkSoft: "#475569",   // texto secundario
  inkMuted: "#94A3B8",  // texto descriptivo
  bgPage: "#F1F3F7",    // fondo del email
  bgCard: "#FFFFFF",    // fondo de la card
  border: "#E2E8F0",
} as const;

const FONT_STACK = `-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif`;

/** Render del layout base, header con marca, card central, footer.
 *  Acepta el bloque de contenido como HTML "crudo" para que cada template
 *  solo se preocupe de qué decir, no de cómo enmarcarlo. */
function emailLayout(input: {
  preheader: string;
  eyebrow?: string;
  contentHtml: string;
  footerNote?: string;
}): string {
  const eyebrow = input.eyebrow
    ? `<div style="font-size:11px;letter-spacing:1.6px;text-transform:uppercase;color:${COLORS.gold};font-weight:700;margin-bottom:8px">${input.eyebrow}</div>`
    : "";
  const footer = input.footerNote
    ? `<p style="margin:24px 0 0;font-size:12px;color:${COLORS.inkMuted};line-height:1.5">${input.footerNote}</p>`
    : "";
  return `<!doctype html>
<html lang="es"><head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <meta name="color-scheme" content="light only" />
  <meta name="supported-color-schemes" content="light" />
  <title>${FROM_FIRM}</title>
</head>
<body style="margin:0;padding:0;background:${COLORS.bgPage};font-family:${FONT_STACK};color:${COLORS.ink};-webkit-font-smoothing:antialiased">
  <!-- preheader oculto que asoma como preview en la bandeja -->
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all">${input.preheader}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${COLORS.bgPage}">
    <tr><td align="center" style="padding:32px 16px">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%">
        <!-- Header con marca -->
        <tr><td style="padding:0 0 18px 4px">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0">
            <tr>
              <td style="vertical-align:middle">
                <span style="display:inline-block;width:32px;height:32px;border-radius:8px;background:${COLORS.navy};color:${COLORS.gold};font-weight:800;font-size:14px;line-height:32px;text-align:center;letter-spacing:0.5px">LDP</span>
              </td>
              <td style="vertical-align:middle;padding-left:10px">
                <div style="font-size:14px;font-weight:600;color:${COLORS.navy};letter-spacing:0.3px">${FROM_FIRM}</div>
              </td>
            </tr>
          </table>
        </td></tr>

        <!-- Card principal -->
        <tr><td style="background:${COLORS.bgCard};border:1px solid ${COLORS.border};border-radius:14px;padding:32px 32px 28px;box-shadow:0 1px 2px rgba(15,76,129,0.04)">
          ${eyebrow}
          ${input.contentHtml}
        </td></tr>

        <!-- Footer -->
        <tr><td style="padding:18px 4px 0">
          <p style="margin:0;font-size:11px;color:${COLORS.inkMuted};line-height:1.5">
            ${FROM_FIRM} · Suite de gestión legal · República Dominicana
          </p>
          ${footer}
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

/** Botón CTA centralizado, siempre el mismo estilo. */
function ctaButton(href: string, label: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0 4px">
    <tr><td style="border-radius:8px;background:${COLORS.navy}">
      <a href="${href}" style="display:inline-block;padding:12px 22px;font-size:14px;font-weight:600;color:#fff;text-decoration:none;border-radius:8px;letter-spacing:0.2px">${label}</a>
    </td></tr>
  </table>`;
}

// ============================================================================
// Templates
// ============================================================================

export function buildResetPasswordEmail(input: {
  recipientName?: string;
  resetUrl: string;
}): { subject: string; html: string } {
  const greeting = input.recipientName ? `Hola ${input.recipientName},` : "Hola,";
  const contentHtml = `
    <p style="margin:0 0 6px;font-size:15px;color:${COLORS.ink}">${greeting}</p>
    <h1 style="margin:0 0 12px;font-size:22px;font-weight:700;color:${COLORS.ink};line-height:1.3">Restablecé tu contraseña</h1>
    <p style="margin:0 0 4px;font-size:14px;color:${COLORS.inkSoft};line-height:1.55">
      Recibimos una solicitud para restablecer tu contraseña en <strong>${FROM_FIRM}</strong>. Hacé clic en el botón para crear una nueva.
    </p>
    ${ctaButton(input.resetUrl, "Restablecer contraseña")}
    <p style="margin:18px 0 0;font-size:13px;color:${COLORS.inkSoft};line-height:1.5">
      El link expira en una hora. Si no solicitaste este cambio, ignorá este mensaje, tu contraseña seguirá igual.
    </p>
    <p style="margin:14px 0 0;font-size:12px;color:${COLORS.inkMuted};line-height:1.4">
      URL directa (si el botón no funciona):<br>
      <a href="${input.resetUrl}" style="color:${COLORS.navy};word-break:break-all">${input.resetUrl}</a>
    </p>`;
  return {
    subject: `Restablecer contraseña, ${FROM_FIRM}`,
    html: emailLayout({
      preheader: "Restablecé tu contraseña, link válido por una hora.",
      eyebrow: "Seguridad",
      contentHtml,
    }),
  };
}

export function buildPortalInviteEmail(input: {
  recipientName: string;
  firmName: string;
  loginUrl: string;
  tempPassword: string;
}): { subject: string; html: string } {
  const contentHtml = `
    <p style="margin:0 0 6px;font-size:15px;color:${COLORS.ink}">Hola ${input.recipientName},</p>
    <h1 style="margin:0 0 12px;font-size:22px;font-weight:700;color:${COLORS.ink};line-height:1.3">Tu acceso al portal está listo</h1>
    <p style="margin:0 0 14px;font-size:14px;color:${COLORS.inkSoft};line-height:1.55">
      ${input.firmName} te creó un acceso al portal cliente. Vas a poder ver:
    </p>
    <ul style="margin:0 0 18px;padding:0 0 0 20px;font-size:14px;color:${COLORS.inkSoft};line-height:1.7">
      <li>Tus casos y su estado</li>
      <li>Próximos eventos y audiencias</li>
      <li>Facturas con detalle y descarga en PDF</li>
      <li>Documentos compartidos contigo</li>
    </ul>
    <div style="background:${COLORS.bgPage};border:1px solid ${COLORS.border};border-radius:10px;padding:14px 16px;margin:0 0 18px">
      <div style="font-size:11px;text-transform:uppercase;letter-spacing:1.2px;color:${COLORS.inkMuted};font-weight:600;margin-bottom:8px">Credenciales</div>
      <div style="font-family:'SF Mono','Menlo','Consolas',monospace;font-size:13px;line-height:1.8;color:${COLORS.ink}">
        <div><span style="color:${COLORS.inkSoft}">URL:</span> <a href="${input.loginUrl}" style="color:${COLORS.navy};text-decoration:none">${input.loginUrl}</a></div>
        <div><span style="color:${COLORS.inkSoft}">Contraseña temporal:</span> <strong>${input.tempPassword}</strong></div>
      </div>
    </div>
    ${ctaButton(input.loginUrl, "Ir al portal")}
    <p style="margin:18px 0 0;font-size:13px;color:${COLORS.inkSoft};line-height:1.5">
      Te recomendamos cambiar la contraseña en tu primer inicio de sesión.
    </p>`;
  return {
    subject: `Acceso al portal de ${input.firmName}`,
    html: emailLayout({
      preheader: `Tu acceso a ${input.firmName} está listo.`,
      eyebrow: "Portal cliente",
      contentHtml,
    }),
  };
}

export function buildNotificationEmail(input: {
  recipientName?: string;
  title: string;
  body?: string | null;
  actionUrl?: string | null;
  actionLabel?: string;
  categoryLabel: string;
}): { subject: string; html: string } {
  const greeting = input.recipientName ? `Hola ${input.recipientName},` : "Hola,";
  const cta = input.actionUrl ? ctaButton(input.actionUrl, input.actionLabel ?? "Ver en LDP Legal Suite") : "";
  const body = input.body
    ? `<p style="margin:0 0 4px;font-size:14px;color:${COLORS.inkSoft};line-height:1.55">${input.body}</p>`
    : "";
  const contentHtml = `
    <p style="margin:0 0 6px;font-size:14px;color:${COLORS.inkSoft}">${greeting}</p>
    <h1 style="margin:0 0 10px;font-size:20px;font-weight:700;color:${COLORS.ink};line-height:1.35">${input.title}</h1>
    ${body}
    ${cta}`;
  return {
    subject: `${input.title}, ${FROM_FIRM}`,
    html: emailLayout({
      preheader: input.body ?? input.title,
      eyebrow: input.categoryLabel,
      contentHtml,
      footerNote: `Recibís este correo porque activaste las notificaciones de «${input.categoryLabel}». Podés desactivarlas en Configuración → Notificaciones.`,
    }),
  };
}

export function buildStaffInviteEmail(input: {
  recipientName: string;
  firmName: string;
  inviterName: string;
  role: string;
  loginUrl: string;
  tempPassword: string;
}): { subject: string; html: string } {
  const contentHtml = `
    <p style="margin:0 0 6px;font-size:15px;color:${COLORS.ink}">Hola ${input.recipientName},</p>
    <h1 style="margin:0 0 12px;font-size:22px;font-weight:700;color:${COLORS.ink};line-height:1.3">Bienvenido al equipo</h1>
    <p style="margin:0 0 14px;font-size:14px;color:${COLORS.inkSoft};line-height:1.55">
      <strong>${input.inviterName}</strong> te agregó al equipo de <strong>${input.firmName}</strong> como
      <strong style="color:${COLORS.navy}">${input.role}</strong>.
    </p>
    <div style="background:${COLORS.bgPage};border:1px solid ${COLORS.border};border-radius:10px;padding:14px 16px;margin:0 0 18px">
      <div style="font-size:11px;text-transform:uppercase;letter-spacing:1.2px;color:${COLORS.inkMuted};font-weight:600;margin-bottom:8px">Credenciales</div>
      <div style="font-family:'SF Mono','Menlo','Consolas',monospace;font-size:13px;line-height:1.8;color:${COLORS.ink}">
        <div><span style="color:${COLORS.inkSoft}">URL:</span> <a href="${input.loginUrl}" style="color:${COLORS.navy};text-decoration:none">${input.loginUrl}</a></div>
        <div><span style="color:${COLORS.inkSoft}">Contraseña temporal:</span> <strong>${input.tempPassword}</strong></div>
      </div>
    </div>
    ${ctaButton(input.loginUrl, "Ingresar")}
    <p style="margin:18px 0 0;font-size:13px;color:${COLORS.inkSoft};line-height:1.5">
      Cambiá tu contraseña en el primer inicio de sesión.
    </p>`;
  return {
    subject: `Acceso a ${input.firmName} en LDP Legal Suite`,
    html: emailLayout({
      preheader: `${input.inviterName} te agregó al equipo de ${input.firmName}.`,
      eyebrow: "Invitación al equipo",
      contentHtml,
    }),
  };
}

// ============================================================================
// Reporte de audiencia
// ============================================================================
// Email con el contenido del reporte. El HTML del reporte viene del editor
// tiptap (server-rendered con escape de HTML), así que se inserta tal cual
// pero dentro de un wrapper con tipografía consistente.

export function buildHearingReportEmail(input: {
  recipientName?: string;
  senderName: string;
  reportTitle: string;
  reportHtml: string;
  caseTitle: string;
  caseCode: string;
  hearingTitle: string;
  hearingStartAt: Date;
  hearingLocation?: string | null;
  actionUrl?: string | null;
}): { subject: string; html: string } {
  const greeting = input.recipientName ? `Hola ${input.recipientName},` : "Hola,";
  const dateFmt = new Intl.DateTimeFormat("es-DO", {
    dateStyle: "full",
    timeStyle: "short",
    timeZone: "America/Santo_Domingo",
  }).format(input.hearingStartAt);

  const locationRow = input.hearingLocation
    ? `<tr><td style="padding:4px 0;font-size:13px;color:${COLORS.inkSoft};width:80px;vertical-align:top">Lugar</td><td style="padding:4px 0;font-size:13px;color:${COLORS.ink}">${input.hearingLocation}</td></tr>`
    : "";

  const contentHtml = `
    <p style="margin:0 0 6px;font-size:14px;color:${COLORS.inkSoft}">${greeting}</p>
    <h1 style="margin:0 0 6px;font-size:22px;font-weight:700;color:${COLORS.ink};line-height:1.3">${input.reportTitle}</h1>
    <p style="margin:0 0 18px;font-size:13px;color:${COLORS.inkMuted}">
      Reporte enviado por <strong style="color:${COLORS.inkSoft}">${input.senderName}</strong>
    </p>

    <!-- Tarjeta de metadata de la audiencia -->
    <div style="background:${COLORS.bgPage};border:1px solid ${COLORS.border};border-radius:10px;padding:16px 18px;margin:0 0 22px">
      <div style="font-size:11px;text-transform:uppercase;letter-spacing:1.4px;color:${COLORS.gold};font-weight:700;margin-bottom:10px">Audiencia</div>
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
        <tr><td style="padding:4px 0;font-size:13px;color:${COLORS.inkSoft};width:80px;vertical-align:top">Caso</td><td style="padding:4px 0;font-size:13px;color:${COLORS.ink}"><strong>${input.caseCode}</strong>, ${input.caseTitle}</td></tr>
        <tr><td style="padding:4px 0;font-size:13px;color:${COLORS.inkSoft};vertical-align:top">Título</td><td style="padding:4px 0;font-size:13px;color:${COLORS.ink}">${input.hearingTitle}</td></tr>
        <tr><td style="padding:4px 0;font-size:13px;color:${COLORS.inkSoft};vertical-align:top">Fecha</td><td style="padding:4px 0;font-size:13px;color:${COLORS.ink}">${dateFmt}</td></tr>
        ${locationRow}
      </table>
    </div>

    <!-- Contenido del reporte (HTML del editor) -->
    <div style="font-size:14px;color:${COLORS.ink};line-height:1.65">
      ${input.reportHtml || `<p style="color:${COLORS.inkMuted}">(Sin contenido)</p>`}
    </div>

    ${input.actionUrl ? ctaButton(input.actionUrl, "Abrir reporte en LDP Legal Suite") : ""}`;

  return {
    subject: `[Audiencia ${input.caseCode}] ${input.reportTitle}`,
    html: emailLayout({
      preheader: `Reporte de audiencia: ${input.hearingTitle}, ${dateFmt}`,
      eyebrow: "Reporte de audiencia",
      contentHtml,
      footerNote: `Recibís este correo porque ${input.senderName} te eligió como destinatario de este reporte.`,
    }),
  };
}
