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

/** Corrección C4 (authService.ts, cambiarContrasenaVoluntaria): correo a usar para RE-AUTENTICAR
 * -- el correo REAL de la sesión YA ACTIVA (`session.user.email`) si lo tiene; el sintético
 * (numeroEmpleadoAEmail) SOLO si esa sesión no trae correo (chofer 01, o cualquier cuenta vieja
 * que siga usando el correo sintético en Auth) o si no hay sesión (defensivo -- esta función no
 * debería llamarse sin sesión, pero no asume que sea imposible). Antes, cambiarContrasenaVoluntaria()
 * SIEMPRE re-autenticaba con el sintético -- roto para cualquier chofer que ya se registró con su
 * propio correo real (paso 5, Hallazgo #51): su cuenta no tiene ese correo sintético en Auth, el
 * signInWithPassword fallaría siempre con "credenciales incorrectas" aunque la contraseña actual
 * fuera correcta. */
export async function correoParaReautenticar(
  numeroEmpleado: string,
  cliente: ClienteAuthCore
): Promise<string> {
  const { data } = await cliente.auth.getSession();
  return data.session?.user.email ?? numeroEmpleadoAEmail(numeroEmpleado);
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
 * función solo usa los nombres embebidos, no los ids.
 *
 * Corrección C3: `FilaChoferConDefectos` (abajo) tipa `empresas`/`rutas` como OBJETO **o
 * ARREGLO** -- por la misma regla de PostgREST (many-to-one, ver el razonamiento que seguía acá
 * antes de esta corrección) debería venir SIEMPRE como objeto/null, pero no se volvió a medir
 * contra una fila real de choferes (RLS exige `auth.uid() = id`, prohibido en esta ronda), así que
 * `normalizarEmbedUno()` (abajo) acepta las dos formas en vez de asumir una sola -- si llega
 * arreglo, avisa con `console.warn` (solo en desarrollo) para que se note en la prueba real del
 * iPhone, pero no rompe. */
const SELECT_CHOFER_CON_DEFECTOS =
  "nombre, debe_cambiar_contrasena, empresa_defecto_id, ruta_defecto_id, empresas(nombre), rutas(nombre)";

type EmbedUnoOArreglo<T> = T | T[] | null;

interface FilaChoferConDefectos {
  nombre: string;
  debe_cambiar_contrasena: boolean;
  empresa_defecto_id: string | null;
  ruta_defecto_id: string | null;
  empresas: EmbedUnoOArreglo<{ nombre: string }>;
  rutas: EmbedUnoOArreglo<{ nombre: string }>;
}

/** Normaliza un embed de PostgREST que debería ser many-to-one (un objeto o `null`) pero que
 * `postgrest-js` puede entregar envuelto en un arreglo según la versión/config (no medido contra
 * una fila real en esta ronda, ver el comentario de arriba) -- `Array.isArray(x) ? (x[0] ?? null)
 * : x` cubre las dos formas con la misma función. `globalThis.__DEV__` (no `__DEV__` suelto) para
 * que este archivo siga compilando con `tsc` puro fuera de React Native (las pruebas de este
 * mismo paso) sin un `declare var __DEV__` ambiental -- en Node, `__DEV__` no existe, así que el
 * aviso simplemente no se imprime nunca ahí (correcto: esto solo importa en el dispositivo real).
 */
function normalizarEmbedUno<T>(valor: EmbedUnoOArreglo<T>, nombreCampo: string): T | null {
  if (Array.isArray(valor)) {
    if ((globalThis as { __DEV__?: boolean }).__DEV__) {
      console.warn(
        `construirUsuarioDesdeChofer: el embed "${nombreCampo}" llegó como arreglo, no como objeto -- revisar la versión de postgrest-js.`
      );
    }
    return valor[0] ?? null;
  }
  return valor;
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
 *
 * ⚠️ Punto 3.5, caso marginal ACEPTADO: si el select falla justo en el login de un chofer que
 * SÍ tiene `debe_cambiar_contrasena = true` pendiente (alta o reseteo del Dashboard, Hallazgo #25),
 * `usuarioMinimo.debeCambiarContrasena` queda en `false` -- esa sesión entraría directo a la app
 * normal, saltándose por esta vez la pantalla obligatoria de cambio de contraseña, en vez de
 * bloquear el ingreso por un fallo de lectura transitorio. Es el mismo criterio que ya elige
 * "dejar entrar y reintentar" para el resto de este Usuario mínimo -- el reintento posterior
 * (AuthContext.tsx, "valida") vuelve a leer la fila real y corrige el campo si sigue activo en una
 * sesión futura; mientras tanto, este único login puntual queda sin el bloqueo.
 *
 * No distingue, A PROPÓSITO, un fallo de RED/servidor de una fila genuinamente inexistente (ej.
 * PGRST116, 0 filas): a diferencia de validarInvitacion() (donde esa distinción cambia qué mensaje
 * se muestra), acá el resultado es el MISMO en los dos casos -- "no se pudo construir el Usuario
 * completo, usar el mínimo y reintentar" -- así que no hay ninguna decisión que dependa de la
 * causa. Ver la tabla de pruebas: ambos casos (red caída y .single() sin fila) llegan al mismo
 * `usuarioMinimo`.
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
  const empresa = normalizarEmbedUno(fila.empresas, "empresas");
  const ruta = normalizarEmbedUno(fila.rutas, "rutas");
  return {
    ok: true,
    usuario: {
      id: idAuth,
      nombre: fila.nombre,
      empresaDefecto: empresa?.nombre ?? null,
      rutaDefecto: ruta?.nombre ?? null,
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
 * hoy): usa mapearErrorLogin() para distinguir credenciales/sin-confirmar/dado-de-baja/red.
 *
 * Corrección D3: un identificador vacío o solo espacios NUNCA puede ser una cuenta real (ni
 * correo ni número de empleado) -- se corta ACÁ, antes de llamar a Supabase. Sin esto,
 * identificadorACorreo("") devuelve `apptransp.chofer..f83a1c@gmail.com` (un correo sintético
 * "vacío" válido en su FORMATO) y el intento de login real contra ese correo gasta una llamada de
 * red para, en el mejor caso, terminar en el mismo "credencialesIncorrectas" de todos modos --
 * nunca puede haber una cuenta real con ese correo. */
export async function iniciarSesionCore(
  identificador: string,
  contrasena: string,
  cliente: ClienteAuthCore
): Promise<ResultadoLogin> {
  if (identificador.trim() === "") {
    return { ok: false, clave: "credencialesIncorrectas" };
  }

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

/**
 * Punto 3.1 -- medido ANTES de escribir esto (fetch falso, sin red real, contra `rpc()`):
 *
 *   entrada del fetch falso      | data   | error                                  | status (TOP-LEVEL, no en error)
 *   ------------------------------+--------+----------------------------------------+----------------------------------
 *   rechaza (sin red real)       | null   | {message,details,hint:'',code:''}     | 0
 *   responde 500 con JSON        | null   | {message} (solo lo que trae el cuerpo) | 500
 *   responde 500 con HTML        | null   | {message: "<html>..."}                 | 500
 *   0 filas reales (array vacío) | []     | null                                   | 200
 *
 * HALLAZGO CLAVE: postgrest-js NO pone `status` dentro de `error` -- `error` (PostgrestError) solo
 * tiene `message`/`details`/`hint`/`code`, NUNCA `status`. El `status` real vive en el nivel de
 * arriba del resultado, como hermano de `data`/`error` (`const { data, error, status } =
 * await cliente.rpc(...)`), igual que ya sabíamos para postgrest-js por convención del proyecto
 * (ver mapearError.ts, que opera sobre errores de AUTH-js, un cliente distinto, donde `error.status`
 * SÍ existe -- NO es el mismo objeto ni el mismo contrato). La versión anterior de esta función
 * miraba solo `data` y nunca el `error`/`status` del rpc -- un fallo de red o de servidor (sea cual
 * sea su status) se tragaba exactamente igual que una respuesta real de 0 filas, y las dos se
 * devolvían como `{estado: "no_existe"}`: un fallo de RED podía hacerle creer al chofer que su
 * invitación "no existe" cuando en realidad nunca se pudo preguntar.
 *
 * Esta versión usa `status` (no `error.status`, que no existe) para distinguir tres casos:
 *   - `error` presente y `status === 0` -> `{ ok:false, motivo:"sinConexion" }`.
 *   - `error` presente con cualquier otro `status` (500, 502, etc. -- el servidor respondió algo,
 *     aunque sea un error) -> `{ ok:false, motivo:"error" }` -- genérico, reintentable.
 *   - SIN error: la única forma real de "no_existe" por esta vía es un arreglo vacío (defensivo;
 *     el RPC, schema.sql:518-561, SIEMPRE devuelve exactamente una fila en uso normal -- nunca
 *     medido así en producción).
 */
export type ResultadoValidarInvitacion =
  { ok: true; fila: FilaValidarInvitacion } | { ok: false; motivo: "sinConexion" | "error" };

/** RPC `validar_invitacion` (schema.sql:518-561) -- acepta token de 32 hex O código de 8
 * caracteres, SIN sesión (grant a anon). */
export async function validarInvitacion(
  valor: string | null,
  cliente: ClienteAuthCore
): Promise<ResultadoValidarInvitacion> {
  const { data, error, status } = await cliente.rpc("validar_invitacion", { p_valor: valor });

  if (error) {
    return { ok: false, motivo: status === 0 ? "sinConexion" : "error" };
  }
  if (!Array.isArray(data) || data.length === 0) {
    return {
      ok: true,
      fila: { estado: "no_existe", empresa_nombre: null, ruta_nombre: null, vence_at: null },
    };
  }
  return { ok: true, fila: data[0] as FilaValidarInvitacion };
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
 * nunca lo entrega). Si la REVALIDACIÓN misma falla (red o servidor -- `validarInvitacion()`
 * devuelve `ok:false`), el resultado es SIEMPRE "genericoConPista", nunca una clave de invitación
 * -- no hay ninguna base para afirmar que la invitación cambió de estado si ni siquiera se pudo
 * volver a leer.
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

  const resultado = await validarInvitacion(datos.invitacion, cliente);
  if (!resultado.ok) return { clave: "genericoConPista" };
  const claveEstado = claveDeEstadoInvitacion(resultado.fila.estado);
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
