-- F7+ Decisión de pragma: quitar cifrado de tokens OAuth.
--
-- Motivo: el cifrado AES-256-GCM con HKDF + AAD vinculado al firmId/userId
-- estaba causando errores intermitentes de "Unable to authenticate data"
-- en producción. Cualquier desalineación de APP_CRYPTO_MASTER_KEY entre
-- ambientes (Vercel Production/Preview/Development) rompe el descifrado.
--
-- Los tokens OAuth ya están protegidos por:
--   * RLS por firmId.
--   * El rol app_user no es superuser.
--   * Los tokens expiran (~1h access, ~90d refresh).
--   * El usuario puede revocar desde Microsoft.
--
-- El cifrado app-layer sigue activo para documentos ultra-confidenciales
-- (donde el blob va a R2 y un admin podría exfiltrarlo).
--
-- Migración:
--   1. Agregar columnas access_token, refresh_token (plaintext).
--   2. Las columnas cipher quedan deprecadas pero NO se borran (por si
--      hay datos viejos que queremos preservar para audit). Quedan
--      sin uso desde el código.
--   3. El campo tokenMeta queda como jsonb pero solo guardará { expiresAt }.

ALTER TABLE "calendar_integrations" ADD COLUMN "access_token" text;
--> statement-breakpoint
ALTER TABLE "calendar_integrations" ADD COLUMN "refresh_token" text;
--> statement-breakpoint

-- Drop NOT NULL del cipher para que rows nuevas puedan ir sin cifrar.
ALTER TABLE "calendar_integrations" ALTER COLUMN "access_token_cipher" DROP NOT NULL;
