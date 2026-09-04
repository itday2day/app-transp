// Autenticación mínima del Dashboard: una única contraseña de administrador
// (DASHBOARD_ADMIN_PASSWORD), sin Supabase Auth ni tabla de roles.
//
// La cookie de sesión es un valor opaco firmado: `${payload}.${firmaHex}`,
// donde la firma es un HMAC-SHA256 del payload usando como secreto la propia
// DASHBOARD_ADMIN_PASSWORD. Así, quien no conozca la contraseña no puede
// fabricar una cookie válida, y el servidor no necesita guardar sesiones en
// ningún lado (ni base de datos ni memoria) para poder validarla.
//
// Se usa la Web Crypto API (`crypto.subtle`) en vez del módulo `node:crypto`
// a propósito: este mismo código corre tanto en Route Handlers (runtime
// Node.js) como en middleware.ts (runtime Edge), y `crypto.subtle` está
// disponible como global en ambos, mientras que `node:crypto` no lo está en
// Edge.

const NOMBRE_COOKIE = "dashboard_session";
const PAYLOAD = "admin-autenticado";

function obtenerSecreto(): string {
  const secreto = process.env.DASHBOARD_ADMIN_PASSWORD;
  if (!secreto) {
    throw new Error("Falta la variable de entorno DASHBOARD_ADMIN_PASSWORD.");
  }
  return secreto;
}

async function importarClaveHmac(secreto: string): Promise<CryptoKey> {
  const bytes = new TextEncoder().encode(secreto);
  return crypto.subtle.importKey("raw", bytes, { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
    "verify",
  ]);
}

function bufferAHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Genera el valor de cookie a setear tras un login correcto. */
export async function crearValorCookieSesion(): Promise<string> {
  const clave = await importarClaveHmac(obtenerSecreto());
  const firma = await crypto.subtle.sign("HMAC", clave, new TextEncoder().encode(PAYLOAD));
  return `${PAYLOAD}.${bufferAHex(firma)}`;
}

/** Valida el valor de cookie recibido en una request. */
export async function esCookieSesionValida(valor: string | undefined | null): Promise<boolean> {
  if (!valor) return false;
  const [payload, firmaRecibida] = valor.split(".");
  if (payload !== PAYLOAD || !firmaRecibida) return false;

  const clave = await importarClaveHmac(obtenerSecreto());
  const firmaEsperada = bufferAHex(
    await crypto.subtle.sign("HMAC", clave, new TextEncoder().encode(PAYLOAD))
  );

  return firmaFijaIgual(firmaRecibida, firmaEsperada);
}

/** Comparación en tiempo constante (evita timing attacks triviales). */
function firmaFijaIgual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diferencia = 0;
  for (let i = 0; i < a.length; i++) {
    diferencia |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diferencia === 0;
}

/** Compara la contraseña recibida en /api/auth/login contra la esperada. */
export function contrasenaEsCorrecta(candidata: string): boolean {
  const esperada = obtenerSecreto();
  if (candidata.length !== esperada.length) return false;
  let diferencia = 0;
  for (let i = 0; i < candidata.length; i++) {
    diferencia |= candidata.charCodeAt(i) ^ esperada.charCodeAt(i);
  }
  return diferencia === 0;
}

export const NOMBRE_COOKIE_SESION = NOMBRE_COOKIE;
