// Pruebas de spec_enviado_visible_y_aviso_al_salir.md (Hallazgo #82), criterios 3, 4, 12, 13, 15 y
// la revisión de la sección 10 (defecto 1: sin conexión, la franja no dice "enviando"). Reductor
// puro `siguienteEstadoFranjaEnvio`. Corre con:
//   node --test pruebas/avisoEnvio.test.mjs
// (Node >= 23.6, sin flags: importa el .ts con type stripping). `avisoEnvioCore.ts` NO importa
// nada de syncService.ts (ese archivo instancia el cliente Supabase y un listener de AppState al
// cargarse -- rompería este test fuera del runtime de React Native): maxIntentos llega como
// parámetro, acá se usa un valor literal (5, el mismo que MAX_INTENTOS hoy).
import { test } from "node:test";
import assert from "node:assert/strict";
import { siguienteEstadoFranjaEnvio } from "../src/services/avisoEnvioCore.ts";

const MAX_INTENTOS = 5;
const CONECTADO = true;
const SIN_CONEXION = false;

function jornada(sincronizacion, intentosSincronizacion = 0) {
  return { sincronizacion, intentosSincronizacion };
}

test("criterio 12: una jornada 'sincronizando' cuenta como pendiente -> enviando", () => {
  // Este es el caso que obtenerPendientesSincronizacion() (la del reclamo atómico, #81) NO
  // detectaría si se usara acá -- su condición "reclamable" excluye una fila 'sincronizando' con
  // reserva vigente. La función bajo prueba no sabe nada de reservas: solo mira el array que le
  // pasan, así que esta prueba demuestra que SI el llamador incluye esa fila (como hace
  // obtenerNoSincronizadasDeChofer), el resultado es "enviando", nunca "oculta"/"enviado".
  const resultado = siguienteEstadoFranjaEnvio("oculta", [jornada("sincronizando")], MAX_INTENTOS, CONECTADO);
  assert.equal(resultado, "enviando");
});

test("criterio 4: una jornada 'error' con intentos agotados -> error (no 'enviando')", () => {
  const resultado = siguienteEstadoFranjaEnvio(
    "oculta",
    [jornada("error", MAX_INTENTOS)],
    MAX_INTENTOS,
    CONECTADO
  );
  assert.equal(resultado, "error");
});

test("'error' con intentos TODAVÍA no agotados (< maxIntentos) -> enviando, no error", () => {
  const resultado = siguienteEstadoFranjaEnvio(
    "oculta",
    [jornada("error", MAX_INTENTOS - 1)],
    MAX_INTENTOS,
    CONECTADO
  );
  assert.equal(resultado, "enviando");
});

test("'pendiente' cuenta igual que 'sincronizando' -> enviando", () => {
  const resultado = siguienteEstadoFranjaEnvio("oculta", [jornada("pendiente")], MAX_INTENTOS, CONECTADO);
  assert.equal(resultado, "enviando");
});

test("mezcla: una 'sincronizando' y una 'error' agotada -> error gana sobre enviando", () => {
  const resultado = siguienteEstadoFranjaEnvio(
    "oculta",
    [jornada("sincronizando"), jornada("error", MAX_INTENTOS)],
    MAX_INTENTOS,
    CONECTADO
  );
  assert.equal(resultado, "error");
});

test("sin jornadas pendientes y estadoActual 'oculta' -> sigue 'oculta' (nunca aparece un Enviado de la nada)", () => {
  const resultado = siguienteEstadoFranjaEnvio("oculta", [], MAX_INTENTOS, CONECTADO);
  assert.equal(resultado, "oculta");
});

test("criterio 15: sin pendientes pero estadoActual 'enviando' -> enviado (la franja YA estaba visible)", () => {
  const resultado = siguienteEstadoFranjaEnvio("enviando", [], MAX_INTENTOS, CONECTADO);
  assert.equal(resultado, "enviado");
});

test("criterio 15: sin pendientes y estadoActual 'error' -> enviado (se recuperó solo, p. ej. pull-to-refresh)", () => {
  const resultado = siguienteEstadoFranjaEnvio("error", [], MAX_INTENTOS, CONECTADO);
  assert.equal(resultado, "enviado");
});

test("sin pendientes y estadoActual ya 'enviado' -> se queda 'enviado' (el auto-ocultado es del componente, no de esta función)", () => {
  const resultado = siguienteEstadoFranjaEnvio("enviado", [], MAX_INTENTOS, CONECTADO);
  assert.equal(resultado, "enviado");
});

test("de 'enviando' a 'enviando' con nuevas jornadas pendientes -> se queda 'enviando'", () => {
  const resultado = siguienteEstadoFranjaEnvio("enviando", [jornada("pendiente")], MAX_INTENTOS, CONECTADO);
  assert.equal(resultado, "enviando");
});

// ============================================================
// Sección 10, defecto 1: sin conexión, la franja NUNCA dice "enviando".
// ============================================================

test("pendientes + SIN conexión -> oculta (nada que decir 'enviando' si no hay red)", () => {
  const resultado = siguienteEstadoFranjaEnvio("oculta", [jornada("pendiente")], MAX_INTENTOS, SIN_CONEXION);
  assert.equal(resultado, "oculta");
});

test("pendientes + conexión -> enviando (caso normal, sin regresión)", () => {
  const resultado = siguienteEstadoFranjaEnvio("oculta", [jornada("pendiente")], MAX_INTENTOS, CONECTADO);
  assert.equal(resultado, "enviando");
});

test("SIN conexión + error agotado -> error (el error ya pasó, no depende de la red ahora)", () => {
  const resultado = siguienteEstadoFranjaEnvio(
    "oculta",
    [jornada("error", MAX_INTENTOS)],
    MAX_INTENTOS,
    SIN_CONEXION
  );
  assert.equal(resultado, "error");
});

test("estaba 'enviando' y se cae la red (sigue pendiente) -> oculta", () => {
  const resultado = siguienteEstadoFranjaEnvio(
    "enviando",
    [jornada("sincronizando")],
    MAX_INTENTOS,
    SIN_CONEXION
  );
  assert.equal(resultado, "oculta");
});

test("vuelve la red con pendientes -> enviando (desde 'oculta', donde había quedado sin conexión)", () => {
  const resultado = siguienteEstadoFranjaEnvio("oculta", [jornada("pendiente")], MAX_INTENTOS, CONECTADO);
  assert.equal(resultado, "enviando");
});
