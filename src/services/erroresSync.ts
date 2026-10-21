/** Clasificación pura de errores de sincronización (spec_sync_sin_sesion_no_agota_intentos.md,
 * Hallazgo #56) -- sin imports de React ni de expo, para poder probarse con `node` solo. */

/** `true` si `error` es de autenticación/autorización (sin sesión, JWT inválido o vencido, RLS) --
 * en ese caso `sincronizarPendientes` NO debe contarlo como un intento real (criterio 3): la
 * jornada vuelve a 'pendiente' sin gastar `intentosSincronizacion`.
 *
 * Basado en `code`/`statusCode`, NUNCA en `status` a secas -- medido en la Fase 1 (sección 3.1,
 * punto 4, con la clave `anon` real): el `StorageApiError` de una subida sin sesión o con JWT
 * inválido llega con `status: 400` aunque el rechazo SÍ sea de autorización; el dato real está en
 * `statusCode` (`"403"`, como CADENA) y en `code` (`"AccessDenied"`). El error de PostgREST
 * (`upsert` a `jornadas`), en cambio, no expone `status` ni `statusCode` en absoluto -- solo
 * `code` (`"42501"`, `"PGRST301"`).
 *
 * Códigos de autenticación/autorización medidos (⚠️ salvo donde se dice lo contrario, de la
 * documentación, no medidos -- no hay forma de firmar un JWT vencido de verdad sin el secreto
 * real):
 *   - `"42501"` -- RLS, Postgres/PostgREST. Medido.
 *   - `"PGRST301"` -- JWT no se pudo decodificar / inválido. Medido.
 *   - `"PGRST302"` -- rol anónimo desactivado. ⚠️ No medido, de la documentación de PostgREST.
 *   - `"PGRST303"` -- claims inválidos (p. ej. `exp` vencido). ⚠️ No medido.
 *   - `"AccessDenied"` -- Storage, sin sesión o con JWT inválido. Medido.
 *   - `"InvalidJWT"` -- Storage, JWT vencido o malformado. ⚠️ No medido, de la documentación de
 *     Storage.
 *   - `statusCode`/`status` (comparados como TEXTO, nunca como número: Storage los manda como
 *     cadena) igual a `"401"` o `"403"`.
 *
 * Acepta las dos formas medidas: el error de PostgREST (sin `name` ni `status`, con
 * `code`/`message`/`details`/`hint`) y el `StorageApiError` (`name`/`message`/`status`/
 * `statusCode`/`code`) -- y cualquier objeto estructuralmente parecido, sin asumir una clase en
 * concreto (nunca `instanceof`). */
export function esErrorDeAutenticacion(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const e = error as Record<string, unknown>;

  const CODIGOS_AUTENTICACION = new Set([
    "42501",
    "PGRST301",
    "PGRST302",
    "PGRST303",
    "AccessDenied",
    "InvalidJWT",
  ]);
  if (typeof e.code === "string" && CODIGOS_AUTENTICACION.has(e.code)) return true;

  const comoTexto = (valor: unknown): string | null => {
    if (typeof valor === "string") return valor;
    if (typeof valor === "number") return String(valor);
    return null;
  };
  const statusCode = comoTexto(e.statusCode);
  if (statusCode === "401" || statusCode === "403") return true;
  const status = comoTexto(e.status);
  if (status === "401" || status === "403") return true;

  return false;
}

/** Envuelve un error original (de PostgREST o de Storage) en un `Error` nuevo con el mensaje que
 * ya se usaba (criterio 4: "el texto que ve el usuario no cambia"), copiando `code`/`status`/
 * `statusCode` -- lo que haga falta para que `esErrorDeAutenticacion()` de arriba pueda seguir
 * clasificándolo después de pasar por `subirJornada`/`subirEvidencia`, que antes los perdían por
 * completo (`new Error(mensaje)` a secas). Copia solo los campos presentes en `original`, nunca
 * inventa un valor para el que falte. */
export function envolverErrorConCampos(mensaje: string, original: unknown): Error {
  const error = new Error(mensaje) as Error & {
    code?: unknown;
    status?: unknown;
    statusCode?: unknown;
  };
  if (original && typeof original === "object") {
    const o = original as Record<string, unknown>;
    if ("code" in o) error.code = o.code;
    if ("status" in o) error.status = o.status;
    if ("statusCode" in o) error.statusCode = o.statusCode;
  }
  return error;
}
