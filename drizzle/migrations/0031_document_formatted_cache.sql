-- Fase 13/UX:
--   Caché del formato IA de documentos. El preview de un DOCX/escaneo puede
--   mostrar el texto reestructurado por Claude (títulos, negritas). Para no
--   llamar a la IA en CADA apertura, guardamos el Markdown generado la
--   primera vez en esta columna y lo reutilizamos.
--
--   Se invalida (queda desactualizada) si el documento se re-procesa por OCR
--   o se sube una nueva versión — en esos casos el código limpia la columna.

ALTER TABLE "documents"
  ADD COLUMN IF NOT EXISTS "formatted_markdown" text;
