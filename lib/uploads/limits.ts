// Constantes de límites para uploads. Vive en un archivo SIN "use server"
// para que tanto server actions como client components puedan importarlas
// sin violar la regla de Next.js que dice que un archivo "use server" SOLO
// puede exportar funciones async (ver Next.js docs sobre Server Actions).

/**
 * Tope hard de tamaño por archivo. Sincronizado con el schema Zod en
 * prepararUploadAction. Si subís este número, hacelo también allá.
 */
export const MAX_UPLOAD_BYTES = 500 * 1024 * 1024; // 500 MB
