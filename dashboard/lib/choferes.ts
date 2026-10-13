import type { SexoChofer } from "@/lib/types";

// ⚠️ COPIA EXACTA de numeroEmpleadoAEmail() en src/services/authService.ts (app móvil) — NO
// reimplementar por separado. El Dashboard y la app viven en el mismo monorepo pero son dos
// proyectos npm distintos (React Native vs. Next.js, sin un lib compartido entre los dos), así
// que compartir la función en tiempo de build no es práctico — se copia, con el costo escrito
// acá y en el otro lado (mismo criterio que desfaseMinutos(), Hallazgo #20): si esta cadena
// difiere en un solo carácter entre los dos lados, el chofer que el Dashboard acaba de crear NO
// PUEDE ENTRAR a la app, y no hay ningún error que lo explique — solo credenciales que no
// funcionan. Si algún día se toca CUALQUIERA de los dos lados, hay que tocar el otro en el mismo
// commit.
export function numeroEmpleadoAEmail(numeroEmpleado: string): string {
  return `apptransp.chofer.${numeroEmpleado}.f83a1c@gmail.com`;
}

// Sin caracteres que se confundan al dictar por teléfono: sin l/1, sin O/0, sin I. Longitud 12 —
// arriba del mínimo de 6 que exige registrarCuenta() hoy, con margen.
const ALFABETO_CONTRASENA_TEMPORAL = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
const LONGITUD_CONTRASENA_TEMPORAL = 12;

/** Genera del lado del servidor una contraseña temporal legible al dictarla — nunca se guarda en
 * ningún lado, se devuelve una sola vez en la respuesta HTTP de crear/resetear. */
export function generarContrasenaTemporal(): string {
  const bytes = new Uint8Array(LONGITUD_CONTRASENA_TEMPORAL);
  crypto.getRandomValues(bytes);
  let contrasena = "";
  for (const byte of bytes) {
    contrasena += ALFABETO_CONTRASENA_TEMPORAL[byte % ALFABETO_CONTRASENA_TEMPORAL.length];
  }
  return contrasena;
}

export const SEXOS: SexoChofer[] = ["Masculino", "Femenino", "Otro"];

// Hallazgo #51, paso 3b (criterios 23/24 de spec_bloque_b_invitacion_registro_login_correo.md):
// identificador único del chofer en todo el Dashboard y el Excel, en vivo desde `choferes`
// (nunca desde `jornadas.chofer_nombre`, que solo guarda el nombre -- ver A1 de
// spec_bloque_b_paso_3b_identificador_chofer.md). apellidos/dni son NOT NULL en el esquema hoy,
// así que la reserva de abajo es defensiva, no un caso esperado.
export function nombreApellidosChofer({
  nombre,
  apellidos,
}: {
  nombre: string;
  apellidos: string | null | undefined;
}): string {
  const n = nombre.trim();
  const a = apellidos?.trim();
  return a ? `${a}, ${n}` : n;
}

/** "Apellidos, Nombre · DNI" -- el identificador completo (mapa usa solo nombreApellidosChofer,
 * sin DNI, D2 de la spec del paso 3b). */
export function identificadorChofer({
  nombre,
  apellidos,
  dni,
}: {
  nombre: string;
  apellidos: string | null | undefined;
  dni: string | null | undefined;
}): string {
  const base = nombreApellidosChofer({ nombre, apellidos });
  const d = dni?.trim();
  return d ? `${base} · ${d}` : base;
}

/** "Apellidos, Nombre" para una fila de `jornadas` con el embed `choferes(nombre, apellidos,
 * dni)` ya traído (criterio 7 del paso 3b; ajuste del 2026-10-13, Parte A: el DNI se muestra
 * aparte, ya no pegado a este texto) -- si el embed viniera `null` (no debería, la FK es NOT
 * NULL) o no se pidió, cae a `jornada.chofer_nombre` (el snapshot histórico), nunca a un texto
 * vacío. Reutiliza nombreApellidosChofer(), no copia su lógica. */
export function nombreApellidosChoferDeJornada(jornada: {
  chofer_nombre: string;
  choferes?: { nombre: string; apellidos: string; dni: string } | null;
}): string {
  return jornada.choferes ? nombreApellidosChofer(jornada.choferes) : jornada.chofer_nombre;
}

/** El DNI de una fila de `jornadas` con el embed ya traído, o `null` si el embed no vino (no
 * debería) -- nunca jornada.chofer_nombre, que no lleva DNI. */
export function dniChoferDeJornada(jornada: { choferes?: { dni: string } | null }): string | null {
  return jornada.choferes?.dni ?? null;
}

// Collator declarado en el código (criterio 6 del paso 3b): no depender del collation de la
// base de datos para que "ñ"/acentos ordenen como en español sin importar dónde corra la
// consulta.
const COLLATOR_ES = new Intl.Collator("es-ES");

/** Por apellidos y, si coinciden, por nombre -- mismo orden para el selector de "+ Cargar
 * jornada" (criterio 3) y para GET /api/choferes (criterio 6). */
export function compararChoferesPorNombre<T extends { nombre: string; apellidos: string | null }>(
  a: T,
  b: T
): number {
  const apellidosA = a.apellidos?.trim() ?? "";
  const apellidosB = b.apellidos?.trim() ?? "";
  const porApellidos = COLLATOR_ES.compare(apellidosA, apellidosB);
  return porApellidos !== 0 ? porApellidos : COLLATOR_ES.compare(a.nombre, b.nombre);
}

// Se declara, no se hereda (ajuste del 2026-10-13, Parte B, criterio 7): minúsculas + NFD sin
// diacríticos para nombre/apellidos ("inigo" encuentra "Íñigo"), nunca `toLocaleLowerCase()` a
// secas -- ese método SÍ cambia con el locale del navegador (acentos aparte), que es justo lo
// que esta función no quiere heredar. El DNI usa normalizarDni() en los dos lados (texto y
// candidato), no esta función -- un DNI real no tiene letras acentuadas que normalizar así.
function normalizarParaBuscarChofer(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

/** Choferes cuyo nombre, apellidos o DNI contienen `texto` (Parte B, criterio 7) -- función
 * pura, conserva el orden de entrada (el llamador ya ordenó con compararChoferesPorNombre antes
 * de filtrar). Texto vacío -> todos, sin filtrar nada.
 *
 * El lado del DNI solo se activa si `consulta` trae al menos un dígito: una letra suelta ("a",
 * "z") NUNCA debe convertirse en una búsqueda de DNI -- de lo contrario coincide con la letra de
 * control o el prefijo NIE (X/Y/Z) de cualquier chofer, aunque el usuario solo quería buscar por
 * nombre/apellidos (retoque del 2026-10-13). */
export function filtrarChoferes<
  T extends { nombre: string; apellidos: string | null; dni: string | null },
>(choferes: T[], texto: string): T[] {
  const consulta = texto.trim();
  if (!consulta) return choferes;

  const consultaTexto = normalizarParaBuscarChofer(consulta);
  const consultaDni = /\d/.test(consulta) ? normalizarDni(consulta) : "";

  return choferes.filter((c) => {
    const porNombre = normalizarParaBuscarChofer(c.nombre).includes(consultaTexto);
    const porApellidos = normalizarParaBuscarChofer(c.apellidos ?? "").includes(consultaTexto);
    const porDni = consultaDni ? normalizarDni(c.dni ?? "").includes(consultaDni) : false;
    return porNombre || porApellidos || porDni;
  });
}

// spec_normalizacion_dni_matricula_telefono.md: 9 caracteres fijos (cubre DNI y NIE español).
// El registro propio desde la app móvil está deshabilitado (el DNI solo se carga desde acá, el
// Dashboard) y contra la base real no hay ningún chofer con documento de otro formato salvo 2
// perfiles de prueba, corregidos a mano antes de esta migración.
export const DNI_VALIDO_REGEX = /^[A-Z0-9]{9}$/;

/** Mismo criterio que normalizarMatricula() en dashboard/lib/vehiculos.ts (mayúsculas, sin
 * caracteres no alfanuméricos) — se usa antes de guardar Y antes de comparar duplicados, así la
 * columna en la base queda siempre en su forma normalizada. */
export function normalizarDni(dni: string): string {
  return dni.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

// spec_telefono_e164_y_pais_desplegable.md: E.164 — un "+" seguido de 8 a 15 dígitos, el primero
// distinto de 0. No valida que el número sea real ni alcanzable, solo el formato.
export const TELEFONO_VALIDO_REGEX = /^\+[1-9]\d{7,14}$/;

/** Se usa en el input mientras se tipea: descarta todo lo que no sea dígito, y conserva el "+"
 * solo si es el primer carácter (un "+" en cualquier otra posición se descarta, no se mueve). */
export function normalizarTelefonoAlTipear(valor: string): string {
  const conPlusInicial = valor.startsWith("+");
  const soloDigitos = valor.replace(/\D/g, "");
  return (conPlusInicial ? "+" : "") + soloDigitos;
}

/** Se usa al perder foco: si ya hay algo tipeado pero no empieza con "+", se lo agrega — cubre al
 * chofer/admin que tipeó el número sin el signo. Un valor vacío se deja vacío (el teléfono es
 * opcional al editar, ver Hallazgo #34). */
export function agregarPlusSiFalta(valor: string): string {
  if (!valor) return valor;
  return valor.startsWith("+") ? valor : `+${valor}`;
}

/** Mismo criterio que normalizarDni()/normalizarMatricula(), pero para COMPARAR nombres de país,
 * nunca para lo que se guarda (eso siempre es el string exacto de PAISES) — mayúsculas y sin
 * diacríticos, así "Espana" (dato real sin tilde, cargado antes de este spec) matchea "España". */
export function normalizarParaComparar(texto: string): string {
  return texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();
}

/** Misma regla que SelectorFecha.tsx (edadMinima=18 por defecto, el caso real de este
 * formulario) — replicada acá porque el Dashboard no puede reusar un componente de React
 * Native. */
export function edadMinimaCumplida(fechaNacimientoIso: string, edadMinima = 18): boolean {
  const nacimiento = new Date(fechaNacimientoIso);
  if (Number.isNaN(nacimiento.getTime())) return false;
  const hoy = new Date();
  let edad = hoy.getFullYear() - nacimiento.getFullYear();
  const noCumplioAnioTodavia =
    hoy.getMonth() < nacimiento.getMonth() ||
    (hoy.getMonth() === nacimiento.getMonth() && hoy.getDate() < nacimiento.getDate());
  if (noCumplioAnioTodavia) edad--;
  return edad >= edadMinima;
}
