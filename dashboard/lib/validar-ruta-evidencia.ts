/** Valida una ruta de Storage del bucket `evidencias` tal como la construye subirEvidencia()
 * (app-transp, src/services/storageService.ts, llamada desde src/services/syncService.ts):
 * `${choferId}/${jornadaId}-{inicial|ruta|final|incidencia-N|incidencia-checkin-N}.jpg`, donde
 * choferId es el id de Supabase Auth del chofer y jornadaId el uuid v4 generado en el dispositivo
 * (jornadasRepo.ts, generarId()) -- los dos son UUID en minúsculas con el separador `-` estándar.
 *
 * Estricta a propósito: `^...$` rechaza cualquier cosa fuera de esa forma exacta, incluidos
 * "..", una barra inicial, una barra invertida, o un prefijo de otro bucket -- todos fallan el
 * `^[0-9a-f]{8}-...` inicial o el separador `/` único entre los dos uuid.
 */
const PATRON_RUTA_EVIDENCIA =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-(inicial|ruta|final|incidencia-\d+|incidencia-checkin-\d+)\.jpg$/;

export const MAX_RUTAS_METADATA_FOTOS = 30;

export function rutaEvidenciaEsValida(ruta: string): boolean {
  return PATRON_RUTA_EVIDENCIA.test(ruta);
}
