# Cloudflare R2 — Setup para direct upload (Fase 7)

Esta guía te lleva paso a paso para configurar Cloudflare R2 como backend
de storage. Con esto vas a poder subir archivos de hasta **500 MB** desde
el browser **directo a R2** — sin pasar por las Vercel functions, sin
chocar con `bodySizeLimit`.

**Costo esperado:** $0 al arranque (free tier: 10 GB storage + 1M ops). A
escala: $0.015/GB/mes después del free tier. **Cero egress** — bajar
documentos no cuesta.

---

## 1. Crear cuenta y bucket en R2

1. Andate a [dash.cloudflare.com](https://dash.cloudflare.com) y creá una
   cuenta (si no tenés). Te va a pedir tarjeta para "verificación" pero no
   cobra mientras estés en free tier.
2. Sidebar izquierdo: **R2 Object Storage** → **Create bucket**.
3. **Bucket name:** `ldp-legal-documents` (o lo que prefieras — solo
   recordá el nombre, lo vas a usar en env vars).
4. **Location:** `Automatic` está bien (R2 ya optimiza por proximidad).
5. **Storage class:** `Standard`.
6. Click **Create bucket**.

## 2. Configurar CORS del bucket

El browser hace PUT directo al bucket → el navegador exige que R2 declare
CORS permitido para tu dominio. Sin esto, fetch va a fallar con CORS error.

1. En tu bucket, ir a **Settings** → **CORS Policy**.
2. Click **Add CORS policy** → modo "JSON".
3. Pegá esto, reemplazando los AllowedOrigins por **tu dominio real**:

```json
[
  {
    "AllowedOrigins": [
      "https://app.ldplegal.com.do",
      "http://localhost:3000"
    ],
    "AllowedMethods": ["PUT", "GET", "HEAD"],
    "AllowedHeaders": ["Content-Type", "Content-Length"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
```

4. **Save**.

> **Nota:** `localhost:3000` te permite probar el flujo de upload directo
> también en dev. Si solo querés prod, sacalo.

## 3. Crear API Token con permisos al bucket

1. Sidebar → **R2** → **Manage R2 API Tokens**.
2. **Create API Token**.
3. **Token name:** `ldp-legal-suite-prod`.
4. **Permissions:** seleccioná **Admin Read & Write** (o "Object Read &
   Write" si querés más restrictivo — funciona igual).
5. **Specify bucket(s):** ✅ Apply to specific buckets → seleccioná
   `ldp-legal-documents`.
6. **TTL:** dejá `Forever` (o pone una fecha si querés rotación periódica).
7. **Create API Token**.
8. **Anotá las credenciales que te muestra** — Access Key ID, Secret
   Access Key, y el "Endpoint URL" del tipo
   `https://<32-hex-chars>.r2.cloudflarestorage.com`. Esa URL no la podés
   recuperar después, guardala.

## 4. Configurar variables de entorno en Vercel

Andate a tu proyecto en [vercel.com/dashboard](https://vercel.com/dashboard)
→ Settings → **Environment Variables**. Agregá estas, todas marcadas para
**Production** y **Preview** (no Development si querés que dev siga local):

| Variable | Valor |
|---|---|
| `STORAGE_DRIVER` | `s3` |
| `S3_BUCKET` | `ldp-legal-documents` |
| `S3_REGION` | `auto` |
| `S3_ENDPOINT` | `https://<tu-cuenta>.r2.cloudflarestorage.com` |
| `S3_ACCESS_KEY_ID` | `<el Access Key del paso 3>` |
| `S3_SECRET_ACCESS_KEY` | `<el Secret Key del paso 3>` |
| `S3_FORCE_PATH_STYLE` | `true` |

Save → vas a tener que redeployar para que tome los nuevos vars
(`vercel --prod` o nuevo commit en main).

## 5. Verificación

Después del redeploy:

1. Login en https://app.ldplegal.com.do
2. Andate a `/documentos` (o a un caso → tab Documentos).
3. Click en **Subir documento** y seleccioná un PDF de 50 MB.
4. Mirá la barra de progreso — debería llegar al 100% sin "Application error".
5. Si hay error CORS: revisá que el origin en el CORS de R2 (paso 2) sea
   exactamente tu dominio (`https://...`, no `http://`).
6. Si hay error 403/SignatureDoesNotMatch: revisá que el `Content-Type` que
   el browser manda sea el mismo que R2 firmó. Nuestro código setea
   `Content-Type` con el header `requiredHeaders` — no debería pasar.

## 6. Backup recomendado (opcional)

R2 no hace backups automáticos. Para una firma legal, considerá:

- **Versionado del bucket** (R2 → Bucket → Settings → Object Versioning): te
  guarda revisiones de cualquier archivo sobreescrito.
- **Lifecycle rules** para que versions viejos se borren tras N días y no
  acumulen costo indefinido.
- **Snapshots periódicos**: un cron diario que copia el bucket a otro
  bucket en otra región (R2 → R2 inter-region copy es gratis).

---

## Para dev local (no obligatorio)

Si no configurás `STORAGE_DRIVER=s3` en tu `.env` local, el sistema cae al
driver `local` por default. En ese caso el "direct upload" usa un endpoint
interno (`/api/uploads/local`) firmado con HMAC del `BETTER_AUTH_SECRET`,
así ejercitás el mismo flow sin necesitar R2 para desarrollar.

Si querés que dev también use R2, agregá las mismas variables a `.env`.
