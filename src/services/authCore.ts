// spec_app_registro_paso5.md, paso 2b: núcleo de autenticación/registro SIN ninguna dependencia de
// React Native/Expo ni del alias "@/" -- se puede compilar con `tsc` normal y correr en Node puro
// (ver la tabla de pruebas de este paso: un cliente falso, sin red, sin EAS, sin dispositivo).
// authService.ts (que SÍ importa expo-secure-store vía @/lib/supabase) es un envoltorio delgado
// sobre este archivo con el singleton `supabase` real -- ver ese archivo para el punto de entrada
// que usa el resto de la app.
//
// Cada función recibe `cliente: ClienteAuthCore` como parámetro OBLIGATORIO (nunca opcional, nunca
// con un valor por defecto importado) -- es la única manera de inyectar un cliente falso en una
// prueba sin cambiar cómo el resto de la app usa el `supabase` real.
//
// Ninguna función de este archivo lanza por un error esperado de Supabase (red, credenciales,
// invitación inválida, etc.) -- todas devuelven un resultado tipado con una `clave`, tomada de
// mapearError.ts o del `estado` de validar_invitacion. Solo una excepción realmente inesperada (un
// bug, no una respuesta real de Supabase) se deja propagar.
//
// Nada de este archivo loguea correo, contraseña, código, token ni ningún dato del formulario de
// registro -- ni siquiera en un `console.error`.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Usuario } from "../types";
import { normalizarDni } from "../utils/validarDatosRegistro";
import {
  mapearErrorRegistro,
  mapearErrorLogin,
  mapearErrorCodigo,
  mapearErrorCambiarContrasena,
  type ErrorSupabase,
  type ClaveMapaLogin,
  type ClaveMapaCodigo,
} from "../utils/mapearError";

export type ClienteAuthCore = SupabaseClient;

// ============================================================
// Normalización de correo e identificadorACorreo
// ============================================================

/** Punto 3.3: TODA llamada de este archivo que manda un correo a Supabase (signUp, verifyOtp,
 * resend, resetPasswordForEmail) lo normaliza con ESTA función -- recortado y en minúsculas --
 * DENTRO del núcleo, no como responsabilidad de la pantalla que llama. Antes de esta corrección,
 * registrarChofer/pedirRecuperacion/reenviarCodigo/verificarCodigo mandaban `correo` tal cual lo
 * daba el llamador (solo identificadorACorreo(), usado por iniciarSesionCore(), normalizaba) --
 * un correo con mayúsculas o espacios colados (copiado/pegado desde el correo de invitación, por
 * ejemplo) podía registrar una cuenta con un correo distinto al que el chofer usa después para
 * iniciar sesión (identificadorACorreo() SÍ lo normaliza en el login, generando el mismo
 * problema al revés: nunca matchear). */
function normalizarCorreo(correo: string): string {
  return correo.trim().toLowerCase();
}

/** COPIADA (no compartida) en dashboard/lib/choferes.ts -- mismo motivo que ese archivo documenta
 * (Supabase Auth exige un dominio de MX real). Exportada para que authService.ts la importe de
 * ACÁ en vez de tener su propia copia (punto 3.4) -- ya solo existen DOS copias en todo el
 * proyecto: esta y la del Dashboard. TODO(barrido): cuando chofer 01 tenga un correo real, esta
 * función y el camino sintético de identificadorACorreo() de abajo se borran junto con la copia
 * del Dashboard, "Orden de implementación" punto 3 de la spec. */
export function numeroEmpleadoAEmail(numeroEmpleado: string): string {
  return `apptransp.chofer.${numeroEmpleado}.f83a1c@gmail.com`;
}

/** D2=a (spec, "Resolución de la Fase 1c" punto 6 / criterio 11): UN solo punto de entrada para
 * decidir si lo que escribió el chofer en el login es ya un correo real o un número de empleado
 * sintético (hoy solo chofer 01 -- TODO(barrido): ver el de numeroEmpleadoAEmail() arriba). */
export function identificadorACorreo(identificador: string): string {
  const limpio = identificador.trim();
  if (limpio.includes("@")) return normalizarCorreo(limpio);
  return numeroEmpleadoAEmail(limpio);
}

// ============================================================
// construirUsuarioDesdeChofer
// ============================================================

/** Select LITERAL de specs\ensayos_registro\registro.mjs:679 (modo m4, ya ejecutado contra
 * producción en la Fase 1b) para la parte de embeds -- `empresas(nombre)`/`rutas(nombre)` sobre
 * `choferes.empresa_defecto_id`/`ruta_defecto_id` (confirmado en supabase/schema.sql:406-407: son
 * las ÚNICAS dos FK de choferes hacia empresas/rutas, así que el embed no es ambiguo). Se agrega
 * `debe_cambiar_contrasena` (que m4 no necesitaba, pero hace falta para armar el Usuario completo)
 * -- `empresa_defecto_id`/`ruta_defecto_id` quedan en el select, igual que en m4, aunque esta
 * función solo usa los nombres embebidos, no los ids. */
const SELECT_CHOFER_CON_DEFECTOS =
  "nombre, debe_cambiar_contrasena, empresa_defecto_id, ruta_defecto_id, empresas(nombre), rutas(nombre)";

interface FilaChoferConDefectos {
  nombre: string;
  debe_cambiar_contrasena: boolean;
  empresa_defecto_id: string | null;
  ruta_defecto_id: string | null;
  empresas: { nombre: string } | null;
  rutas: { nombre: string } | null;
}

export type ResultadoConstruirUsuario =
  { ok: true; usuario: Usuario } | { ok: false; usuarioMinimo: Usuario };

/**
 * Punto único que convierte (id de auth + fila de choferes) en un `Usuario`. Lo usan
 * iniciarSesionCore(), verificarCodigo() (type 'signup') y, en el 2c, la pantalla de recuperación
 * después de cambiarContrasena() -- los cuatro caminos de entrada terminan en esta misma función,
 * para que los dos mecanismos de sesión (supabase-js y el Usuario que persiste AuthContext.tsx)
 * nunca se construyan de dos formas distintas.
 *
 * Si la lectura de choferes falla, NO lanza: la spec dice que un registro/login ya válido (el
 * trigger ya corrió, la cuenta existe) debe dejar entrar a la app igual y reintentar esta lectura
 * más tarde -- perder el preselect de empresa/ruta (o, en el peor caso, un debeCambiarContrasena
 * desactualizado) no es motivo para bloquear el ingreso. El `usuarioMinimo` que se devuelve en ese
 * caso tiene `nombre: ""` y `debeCambiarContrasena: false` como placeholders optimistas -- el
 * llamador debe tratar `ok: false` como "hay que reintentar esta lectura", no asumir que esos
 * valores son reales.
 */
export async function construirUsuarioDesdeChofer(
  idAuth: string,
  cliente: ClienteAuthCore
): Promise<ResultadoConstruirUsuario> {
  const { data, error } = await cliente
    .from("choferes")
    .select(SELECT_CHOFER_CON_DEFECTOS)
    .eq("id", idAuth)
    .single();

  if (error || !data) {
    return {
      ok: false,
      usuarioMinimo: {
        id: idAuth,
        nombre: "",
        empresaDefecto: null,
        rutaDefecto: null,
        debeCambiarContrasena: false,
      },
    };
  }

  const fila = data as unknown as FilaChoferConDefectos;
  return {
    ok: true,
    usuario: {
      id: idAuth,
      nombre: fila.nombre,
      empresaDefecto: fila.empresas?.nombre ?? null,
      rutaDefecto: fila.rutas?.nombre ?? null,
      debeCambiarContrasena: fila.debe_cambiar_contrasena,
    },
  };
}

// ============================================================
// Login
// ============================================================

export type ResultadoLogin =
  | { ok: true; usuario: Usuario }
  | { ok: false; clave: "correoSinConfirmar"; correo: string }
  | { ok: false; clave: Exclude<ClaveMapaLogin, "correoSinConfirmar"> };

/** `signInWithPassword` + construirUsuarioDesdeChofer(), con el identificador ya resuelto vía
 * identificadorACorreo(). No colapsa todo a un 401 genérico (a diferencia del authService.ts de
 * hoy): usa mapearErrorLogin() para distinguir credenciales/sin-confirmar/dado-de-baja/red. */
export async function iniciarSesionCore(
  identificador: string,
  contrasena: string,
  cliente: ClienteAuthCore
): Promise<ResultadoLogin> {
  const correo = identificadorACorreo(identificador);
  const { data, error } = await cliente.auth.signInWithPassword({ email: correo, password: contrasena });

  if (error) {
    const mapeado = mapearErrorLogin(error as ErrorSupabase);
    if (mapeado.clave === "correoSinConfirmar") {
      return { ok: false, clave: "correoSinConfirmar", correo };
    }
    return { ok: false, clave: mapeado.clave };
  }
  if (!data.user) return { ok: false, clave: "generico" };

  const construido = await construirUsuarioDesdeChofer(data.user.id, cliente);
  return { ok: true, usuario: construido.ok ? construido.usuario : construido.usuarioMinimo };
}

// ============================================================
// Invitaciones
// ============================================================

export type EstadoInvitacion = "no_existe" | "revocada" | "vencida" | "usada" | "valida";

/** Shape LITERAL de la fila que devuelve el RPC (supabase/schema.sql:518-561) -- snake_case tal
 * cual la columna, mismo criterio que el resto de la app para objetos que vienen directo de
 * PostgREST (ej. FilaRutaCatalogo en syncService.ts). */
export interface FilaValidarInvitacion {
  estado: EstadoInvitacion;
  empresa_nombre: string | null;
  ruta_nombre: string | null;
  vence_at: string | null;
}

/** RPC `validar_invitacion` (schema.sql:518-561) -- acepta token de 32 hex O código de 8
 * caracteres, SIN sesión (grant a anon). Devuelve SIEMPRE exactamente una fila (nunca error ni 0
 * filas en uso normal); si por algún motivo de red/config no viniera ninguna, se trata como
 * "no_existe" -- el estado más conservador, nunca deja avanzar un registro por error. */
export async function validarInvitacion(
  valor: string | null,
  cliente: ClienteAuthCore
): Promise<FilaValidarInvitacion> {
  const { data } = await cliente.rpc("validar_invitacion", { p_valor: valor });
  if (!data || !Array.isArray(data) || data.length === 0) {
    return { estado: "no_existe", empresa_nombre: null, ruta_nombre: null, vence_at: null };
  }
  return data[0] as FilaValidarInvitacion;
}

/** Shape literal de obtener_datos_invitacion (schema.sql:573-610). */
export interface DatosInvitacion {
  dni: string;
  nombre: string;
  apellidos: string;
  telefono: string;
  email: string;
  fecha_nacimiento: string;
}

/** RPC `obtener_datos_invitacion` -- SOLO acepta el token de 32 hex (no el código de 8), sin
 * sesión. 0 filas = "no existe" o "ya usada" (medido en la Fase 1b: mismo shape para ambos casos,
 * indistinguibles acá -- usar validarInvitacion() si hace falta distinguir el estado). */
export async function obtenerDatosInvitacion(
  token: string,
  cliente: ClienteAuthCore
): Promise<DatosInvitacion | null> {
  const { data } = await cliente.rpc("obtener_datos_invitacion", { p_token: token });
  if (!data || !Array.isArray(data) || data.length === 0) return null;
  return data[0] as DatosInvitacion;
}

type ClaveInvitacionInvalida =
  "invitacionNoExiste" | "invitacionRevocada" | "invitacionVencida" | "invitacionUsada";

function claveDeEstadoInvitacion(estado: EstadoInvitacion): ClaveInvitacionInvalida | null {
  switch (estado) {
    case "no_existe":
      return "invitacionNoExiste";
    case "revocada":
      return "invitacionRevocada";
    case "vencida":
      return "invitacionVencida";
    case "usada":
      return "invitacionUsada";
    case "valida":
      return null;
  }
}

// ============================================================
// Registro
// ============================================================

export interface DatosRegistroCompletos {
  invitacion: string;
  dni: string;
  nombre: string;
  apellidos: string;
  fechaNacimiento: string; // "AAAA-MM-DD"
  telefono: string;
  correo: string;
  contrasena: string;
}

export type ResultadoRegistro =
  | { clave: "pantallaCodigo" }
  | { clave: "correoYaRegistrado" }
  | { clave: "esperar"; segundos: number }
  | { clave: "sinConexion" }
  | { clave: "contrasenaDebil" }
  | { clave: ClaveInvitacionInvalida }
  | { clave: "genericoConPista" }
  | { clave: "generico" };

/**
 * `signUp` con `options.data` = { invitacion, dni, nombre, apellidos, fecha_nacimiento, telefono }
 * y NADA más (ni correo ni contraseña, que van en el nivel de arriba del payload; ni empresa ni
 * ruta, que decide el trigger a partir de la invitación) -- las claves de `options.data` tienen
 * que ser EXACTAMENTE las que lee `v_meta->>'...'` en crear_chofer_desde_invitacion()
 * (schema.sql:622-633), confirmado leyendo esa función antes de escribir esto. `dni` se normaliza
 * igual que el Dashboard (normalizarDni(), más estricto que el trigger -- nunca deja pasar un DNI
 * que el trigger hubiera rechazado); nombre/apellidos/telefono solo se recortan, el trigger hace
 * el resto de su propia validación (capa 2).
 *
 * Tras un 500 (mapearErrorRegistro() -> "revisarInvitacion"), vuelve a pedir validarInvitacion()
 * con el MISMO valor: si el estado ya cambió, usa la clave de ESE estado; si sigue "valida", usa
 * "genericoConPista" (el motivo real sigue sin conocerse -- medido en la Fase 1b, supabase-js
 * nunca lo entrega).
 */
export async function registrarChofer(
  datos: DatosRegistroCompletos,
  cliente: ClienteAuthCore
): Promise<ResultadoRegistro> {
  const { data, error } = await cliente.auth.signUp({
    email: normalizarCorreo(datos.correo),
    password: datos.contrasena,
    options: {
      data: {
        invitacion: datos.invitacion,
        dni: normalizarDni(datos.dni),
        nombre: datos.nombre.trim(),
        apellidos: datos.apellidos.trim(),
        fecha_nacimiento: datos.fechaNacimiento.trim(),
        telefono: datos.telefono.trim(),
      },
    },
  });

  const mapeado = mapearErrorRegistro({
    error: error as ErrorSupabase | null,
    identities: data?.user?.identities ?? undefined,
  });

  if (mapeado.clave === "esperar") return { clave: "esperar", segundos: mapeado.segundos };
  if (mapeado.clave !== "revisarInvitacion") return { clave: mapeado.clave };

  const filaInvitacion = await validarInvitacion(datos.invitacion, cliente);
  const claveEstado = claveDeEstadoInvitacion(filaInvitacion.estado);
  return claveEstado ? { clave: claveEstado } : { clave: "genericoConPista" };
}

// ============================================================
// Código (signup/recovery) y reenvío
// ============================================================

export type ResultadoVerificarCodigo =
  | { clave: "confirmado"; usuario: Usuario }
  | { clave: "ok" }
  | { clave: Exclude<ClaveMapaCodigo, "esperar"> }
  | { clave: "esperar"; segundos: number };

/**
 * `verifyOtp({ email, token, type })`.
 *
 * `type: 'signup'` -> construye y devuelve el Usuario (`clave: "confirmado"`) -- el llamador lo
 * establece y entra a la app, mismo camino que iniciarSesionCore().
 *
 * `type: 'recovery'` -> devuelve SOLO `{ clave: "ok" }`, SIN Usuario. La sesión de recovery YA
 * quedó abierta como efecto colateral (medido en la Fase 1b: verifyOtp de recovery abre sesión Y
 * confirma el correo a la vez) pero el chofer todavía no eligió su contraseña nueva -- si se
 * estableciera un Usuario acá, RootNavigator.tsx (que decide la pantalla según si `usuario` es
 * null) saltaría a la app normal ANTES de que exista una contraseña nueva. El llamador (la
 * pantalla de recuperación, 2c) recién pide construirUsuarioDesdeChofer() y lo establece DESPUÉS
 * de un cambiarContrasena() exitoso.
 */
export async function verificarCodigo(
  correo: string,
  codigo: string,
  tipo: "signup" | "recovery",
  cliente: ClienteAuthCore
): Promise<ResultadoVerificarCodigo> {
  const { data, error } = await cliente.auth.verifyOtp({
    email: normalizarCorreo(correo),
    token: codigo,
    type: tipo,
  });

  if (error) {
    const mapeado = mapearErrorCodigo(error as ErrorSupabase);
    if (mapeado.clave === "esperar") return { clave: "esperar", segundos: mapeado.segundos };
    return { clave: mapeado.clave };
  }

  if (tipo === "recovery") return { clave: "ok" };

  if (!data.user) return { clave: "generico" };
  const construido = await construirUsuarioDesdeChofer(data.user.id, cliente);
  return { clave: "confirmado", usuario: construido.ok ? construido.usuario : construido.usuarioMinimo };
}

/** Si el chofer abandona la pantalla de recuperación DESPUÉS de un verifyOtp de recovery exitoso
 * pero SIN llegar a cambiarContrasena(), esa sesión quedó abierta sin que la app haya establecido
 * ningún Usuario (ver verificarCodigo arriba) -- esta función la cierra explícitamente. Sin esto,
 * quedaría una sesión de Supabase válida sin Usuario persistido, un estado que restaurarSesion()
 * (AuthContext.tsx) no contempla entre sus tres resultados. El llamador (la pantalla de
 * recuperación, 2c) la invoca en su cleanup de salida si el chofer navega fuera sin terminar. */
export async function cancelarRecuperacionPendiente(cliente: ClienteAuthCore): Promise<void> {
  await cliente.auth.signOut();
}

export type ResultadoEnvioCodigo =
  { clave: "ok" } | { clave: "esperar"; segundos: number } | { clave: "sinConexion" | "generico" };

/** `resend({ type: 'signup' })` -- comparte el límite de 60s/usuario con verifyOtp (mapearErrorCodigo),
 * pero nunca puede devolver "codigoIncorrectoOVencido" (no es esa llamada); si alguna vez pasara,
 * se trata como "generico" en vez de propagar una clave que no le corresponde a este flujo. */
export async function reenviarCodigo(
  correo: string,
  cliente: ClienteAuthCore
): Promise<ResultadoEnvioCodigo> {
  const { error } = await cliente.auth.resend({ type: "signup", email: normalizarCorreo(correo) });
  if (!error) return { clave: "ok" };
  const mapeado = mapearErrorCodigo(error as ErrorSupabase);
  if (mapeado.clave === "esperar") return { clave: "esperar", segundos: mapeado.segundos };
  if (mapeado.clave === "codigoIncorrectoOVencido") return { clave: "generico" };
  return { clave: mapeado.clave };
}

/** `resetPasswordForEmail()` -- mismo límite de 60s/usuario y misma pantalla de código que
 * reenviarCodigo(); misma salvedad sobre "codigoIncorrectoOVencido". */
export async function pedirRecuperacion(
  correo: string,
  cliente: ClienteAuthCore
): Promise<ResultadoEnvioCodigo> {
  const { error } = await cliente.auth.resetPasswordForEmail(normalizarCorreo(correo));
  if (!error) return { clave: "ok" };
  const mapeado = mapearErrorCodigo(error as ErrorSupabase);
  if (mapeado.clave === "esperar") return { clave: "esperar", segundos: mapeado.segundos };
  if (mapeado.clave === "codigoIncorrectoOVencido") return { clave: "generico" };
  return { clave: mapeado.clave };
}

// ============================================================
// Cambio de contraseña (recovery, 2b) -- requiere sesión ya activa
// ============================================================

export type ResultadoCambiarContrasena =
  { ok: true } | { ok: false; clave: "sinConexion" | "generico" | "contrasenaDebil" | "contrasenaIgual" };

/** `updateUser({ password })` -- requiere sesión ya activa (llegó acá vía verifyOtp de recovery,
 * que ya deja sesión abierta como efecto colateral, medido en la Fase 1b). A diferencia de
 * cambiarContrasenaVoluntaria() (authService.ts), acá NO reautentica primero: no hay "contraseña
 * actual" que verificar, la sesión de recovery ya ES la prueba de identidad. */
export async function cambiarContrasena(
  nueva: string,
  cliente: ClienteAuthCore
): Promise<ResultadoCambiarContrasena> {
  const { error } = await cliente.auth.updateUser({ password: nueva });
  if (!error) return { ok: true };
  const mapeado = mapearErrorCambiarContrasena(error as ErrorSupabase);
  return { ok: false, clave: mapeado.clave };
}
