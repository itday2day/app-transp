// Autenticación del Dashboard: administradores individuales (tabla `admins`
// en Supabase, ver supabase/schema_v7_admins.sql), sin Supabase Auth.
//
// La cookie de sesión es un valor opaco firmado: `${payloadBase64Url}.${firmaHex}`,
// donde el payload es la identidad del admin (id/email/nombre/iat) y la firma
// es un HMAC-SHA256 de ese payload usando como secreto DASHBOARD_SESSION_SECRET
// (un secreto propio de la sesión, no la contraseña de ningún admin — cada
// admin tiene la suya propia, con su hash guardado en `admins.password_hash`).
// Así, quien no conozca el secreto no puede fabricar ni alterar una cookie
// válida, y el servidor no necesita guardar sesiones en ningún lado (ni base
// de datos ni memoria) para poder validarla.
//
// Se usa la Web Crypto API (`crypto.subtle`) en vez del módulo `node:crypto`
// a propósito: este mismo código corre tanto en Route Handlers (runtime
// Node.js) como en proxy.ts (runtime Edge), y `crypto.subtle` está disponible
// como global en ambos, mientras que `node:crypto` no lo está en Edge — por
// la misma razón, este archivo no importa `next/headers` ni bcrypt (Edge no
// soporta bindings nativos ni depende del contexto de request de Next):
// quien llama (proxy.ts, los Route Handlers) lee el valor crudo de la cookie
// y se lo pasa a estas funciones.

const NOMBRE_COOKIE = "dashboard_session";

/** Identidad del admin autenticado, embebida en la cookie de sesión. */
export interface AdminSesion {
  adminId: string;
  email: string;
  nombre: string;
  iat: number;
}

function obtenerSecreto(): string {
  const secreto = process.env.DASHBOARD_SESSION_SECRET;
  if (!secreto) {
    throw new Error("Falta la variable de entorno DASHBOARD_SESSION_SECRET.");
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

// base64url manual (btoa/atob, no Buffer) para que este módulo siga sin
// depender de nada específico de Node y funcione igual en runtime Edge.
function base64UrlCodificar(texto: string): string {
  const bytes = new TextEncoder().encode(texto);
  const binario = Array.from(bytes, (b) => String.fromCharCode(b)).join("");
  return btoa(binario).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecodificar(valor: string): string {
  const base64 = valor.replace(/-/g, "+").replace(/_/g, "/");
  const binario = atob(base64);
  const bytes = Uint8Array.from(binario, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
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

/** Genera el valor de cookie a setear tras un login correcto. */
export async function crearValorCookieSesion(admin: {
  id: string;
  email: string;
  nombre: string;
}): Promise<string> {
  const sesion: AdminSesion = {
    adminId: admin.id,
    email: admin.email,
    nombre: admin.nombre,
    iat: Date.now(),
  };
  const payload = base64UrlCodificar(JSON.stringify(sesion));
  const clave = await importarClaveHmac(obtenerSecreto());
  const firma = await crypto.subtle.sign("HMAC", clave, new TextEncoder().encode(payload));
  return `${payload}.${bufferAHex(firma)}`;
}

/** Valida la firma del valor de cookie y devuelve la identidad embebida, o `null` si no es válida. */
export async function obtenerAdminSesion(
  valorCookie: string | undefined | null
): Promise<AdminSesion | null> {
  if (!valorCookie) return null;
  const separador = valorCookie.lastIndexOf(".");
  if (separador === -1) return null;

  const payload = valorCookie.slice(0, separador);
  const firmaRecibida = valorCookie.slice(separador + 1);

  const clave = await importarClaveHmac(obtenerSecreto());
  const firmaEsperada = bufferAHex(
    await crypto.subtle.sign("HMAC", clave, new TextEncoder().encode(payload))
  );
  if (!firmaFijaIgual(firmaRecibida, firmaEsperada)) return null;

  try {
    const sesion = JSON.parse(base64UrlDecodificar(payload)) as Partial<AdminSesion>;
    if (
      typeof sesion.adminId !== "string" ||
      typeof sesion.email !== "string" ||
      typeof sesion.nombre !== "string" ||
      typeof sesion.iat !== "number"
    ) {
      return null;
    }
    return sesion as AdminSesion;
  } catch {
    return null;
  }
}

/** Valida el valor de cookie recibido en una request (proxy.ts solo necesita saber si es válida). */
export async function esCookieSesionValida(valor: string | undefined | null): Promise<boolean> {
  return (await obtenerAdminSesion(valor)) !== null;
}

export const NOMBRE_COOKIE_SESION = NOMBRE_COOKIE;
