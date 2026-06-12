// PUT endpoint para dev — ejercita el flow de "direct upload" sin necesitar
// S3 / R2 corriendo en local. En prod (STORAGE_DRIVER=s3) este endpoint NO
// se usa porque presignedPut() devuelve URLs reales de R2/S3.
//
// Security: el query string trae HMAC firmada por el server. Sin esa firma
// válida (verificada con BETTER_AUTH_SECRET), el endpoint rechaza con 401.
// Esto evita que un atacante escriba archivos arbitrarios al storage local
// sin pasar por preparar-upload.

import { NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";
import { verifyLocalUploadToken } from "@/lib/storage/local";

// Vercel functions tienen body limits — este handler NO se ejecuta en Vercel,
// solo en dev. Si por alguna razón se llamara en prod, los body chicos
// pasarían y los grandes rebotarían igual que antes.
export const runtime = "nodejs";

export async function PUT(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const key = url.searchParams.get("key");
  const expStr = url.searchParams.get("exp");
  const sig = url.searchParams.get("sig");

  if (!key || !expStr || !sig) {
    return NextResponse.json(
      { error: "Faltan parámetros (key/exp/sig)." },
      { status: 400 },
    );
  }

  const expiresAt = Number(expStr);
  if (!verifyLocalUploadToken(key, expiresAt, sig)) {
    return NextResponse.json(
      { error: "Token inválido o expirado." },
      { status: 401 },
    );
  }

  // Defensa: prohibir traversal y absolutos. El key fue firmado pero
  // mejor verificar igual.
  if (key.includes("..") || path.isAbsolute(key)) {
    return NextResponse.json({ error: "Key inseguro." }, { status: 400 });
  }

  const root = process.env.STORAGE_ROOT ?? "./storage";
  const abs = path.join(root, key);

  // Stream del body al archivo. Si es chico, ArrayBuffer está bien; para
  // archivos grandes el streaming sería mejor pero local dev no es
  // performance-critical.
  const buf = Buffer.from(await req.arrayBuffer());
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, buf);

  return NextResponse.json({ ok: true, key, sizeBytes: buf.length });
}
