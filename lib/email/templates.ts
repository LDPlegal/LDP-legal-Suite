// Reusable email body builders. Plain HTML, inline styles so any client can
// render. Keep messages short and human; the firm's brand voice can be added
// later via firm settings.

import "server-only";

const FROM_FIRM = "LDP Legal Suite";

export function buildResetPasswordEmail(input: {
  recipientName?: string;
  resetUrl: string;
}): { subject: string; html: string } {
  const greeting = input.recipientName ? `Hola ${input.recipientName},` : "Hola,";
  return {
    subject: `Restablecer contraseña — ${FROM_FIRM}`,
    html: `
<!doctype html>
<html><body style="font-family:Helvetica,Arial,sans-serif;line-height:1.5;color:#0F172A;max-width:560px;margin:0 auto;padding:24px">
  <p>${greeting}</p>
  <p>Recibimos una solicitud para restablecer tu contraseña en <strong>${FROM_FIRM}</strong>.
  Haz clic en el botón para crear una nueva:</p>
  <p style="margin:24px 0">
    <a href="${input.resetUrl}"
       style="display:inline-block;padding:10px 18px;background:#0F4C81;color:#fff;text-decoration:none;border-radius:6px;font-weight:500">
      Restablecer contraseña
    </a>
  </p>
  <p style="font-size:13px;color:#475569">El link expira en una hora. Si no solicitaste este cambio,
  ignora este mensaje y tu contraseña seguirá igual.</p>
  <p style="font-size:13px;color:#475569">URL directa (si el botón no funciona):<br>
  <a href="${input.resetUrl}" style="color:#0F4C81;word-break:break-all">${input.resetUrl}</a></p>
</body></html>`,
  };
}

export function buildPortalInviteEmail(input: {
  recipientName: string;
  firmName: string;
  loginUrl: string;
  tempPassword: string;
}): { subject: string; html: string } {
  return {
    subject: `Acceso al portal de ${input.firmName}`,
    html: `
<!doctype html>
<html><body style="font-family:Helvetica,Arial,sans-serif;line-height:1.5;color:#0F172A;max-width:560px;margin:0 auto;padding:24px">
  <p>Hola ${input.recipientName},</p>
  <p>${input.firmName} te creó un acceso al portal cliente. Podrás ver:</p>
  <ul>
    <li>Tus casos y su estado</li>
    <li>Próximos eventos y audiencias</li>
    <li>Facturas con detalle y descarga en PDF</li>
    <li>Documentos compartidos contigo</li>
  </ul>
  <p style="background:#F1F5F9;padding:12px;border-radius:6px;font-family:monospace;font-size:14px">
    <strong>URL:</strong> ${input.loginUrl}<br>
    <strong>Contraseña temporal:</strong> ${input.tempPassword}
  </p>
  <p style="font-size:13px;color:#475569">
    Te recomendamos cambiar la contraseña en tu primer inicio de sesión.
  </p>
</body></html>`,
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
  return {
    subject: `Acceso a ${input.firmName} en LDP Legal Suite`,
    html: `
<!doctype html>
<html><body style="font-family:Helvetica,Arial,sans-serif;line-height:1.5;color:#0F172A;max-width:560px;margin:0 auto;padding:24px">
  <p>Hola ${input.recipientName},</p>
  <p>${input.inviterName} te agregó al equipo de <strong>${input.firmName}</strong> como
  <strong>${input.role}</strong>.</p>
  <p style="background:#F1F5F9;padding:12px;border-radius:6px;font-family:monospace;font-size:14px">
    <strong>URL:</strong> ${input.loginUrl}<br>
    <strong>Contraseña temporal:</strong> ${input.tempPassword}
  </p>
  <p style="font-size:13px;color:#475569">
    Cambia tu contraseña en el primer inicio de sesión.
  </p>
</body></html>`,
  };
}
