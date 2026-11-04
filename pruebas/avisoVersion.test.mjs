// Pruebas de spec_aviso_version_y_pagina_actualizar.md, Fase 3: comparación de versiones (menor,
// igual, mayor, valor no numérico), "una vez por arranque" y (revisión 2026-11-04) que un fallo de
// red NUNCA consume ese único chequeo. Corre con:
//   node --test pruebas/avisoVersion.test.mjs
// (Node >= 23.6, sin flags: importa el .ts con type stripping, mismo patrón que
// reclamoSincronizacion.test.mjs). No toca React Native -- un cliente Supabase falso (mismo patrón
// de "cliente inyectado" que authCore.ts/ClienteAuthCore) reemplaza la red real.
//
// IMPORTANTE: las pruebas de "una vez por arranque" comparten el estado de módulo de
// avisoVersionCore.ts (yaRevisadoEnEsteArranque/revisionEnCursoEsteArranque) -- node --test corre
// los tests de UN MISMO archivo en orden secuencial por defecto, así que el orden de abajo importa
// y arma un solo ciclo de vida realista (en curso -> sin respuesta -> libera -> reintento ->
// responde -> marca -> ya no se libera más). No reordenar ese bloque.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  debeMostrarAviso,
  debeRevisarAvisoVersionEsteArranque,
  marcarAvisoVersionRevisadoEsteArranque,
  liberarRevisionAvisoVersionEsteArranque,
  obtenerFilaAppVersion,
} from "../src/services/avisoVersionCore.ts";

// Cliente Supabase falso: solo implementa la cadena exacta que usa obtenerFilaAppVersion
// (.from().select().eq().maybeSingle()). `respuesta` imita la forma real de postgrest-js
// (PostgrestBuilder.ts): status=0 es el indicador documentado de que el fetch nunca tuvo una
// respuesta HTTP real (sin red/DNS/timeout) -- cualquier otro status es una respuesta real, con o
// sin error de Postgrest.
function clienteFalso(respuesta) {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => {
            if (respuesta instanceof Error) throw respuesta;
            return respuesta;
          },
        }),
      }),
    }),
  };
}

const FILA = { buildRecomendado: 4, urlDescarga: "https://app.day2day.es/actualizar" };

test("debeMostrarAviso: build instalado MENOR que el recomendado -> true", () => {
  assert.equal(debeMostrarAviso("3", FILA), true);
});

test("debeMostrarAviso: build instalado IGUAL al recomendado -> false", () => {
  assert.equal(debeMostrarAviso("4", FILA), false);
});

test("debeMostrarAviso: build instalado MAYOR que el recomendado -> false", () => {
  assert.equal(debeMostrarAviso("5", FILA), false);
});

test("debeMostrarAviso: valor no numérico -> false (nunca lanza)", () => {
  assert.equal(debeMostrarAviso("abc", FILA), false);
  assert.equal(debeMostrarAviso("", FILA), false);
  assert.equal(debeMostrarAviso("4-algo-raro", FILA), false);
  assert.equal(debeMostrarAviso("4.5", FILA), false);
});

test("debeMostrarAviso: nativeBuildVersion null (Expo Go/web) -> false", () => {
  assert.equal(debeMostrarAviso(null, FILA), false);
});

test("debeMostrarAviso: fila ausente (sin conexión, error o tabla vacía) -> false", () => {
  assert.equal(debeMostrarAviso("1", null), false);
});

test("obtenerFilaAppVersion: status 0 (sin red/DNS/timeout) -> tipo sinRespuesta", async () => {
  const cliente = clienteFalso({ status: 0, error: { message: "FetchError: failed to fetch" }, data: null });
  assert.deepEqual(await obtenerFilaAppVersion(cliente), { tipo: "sinRespuesta" });
});

test("obtenerFilaAppVersion: excepción inesperada fuera del fetch -> tipo sinRespuesta (nunca lanza)", async () => {
  const cliente = clienteFalso(new Error("boom"));
  assert.deepEqual(await obtenerFilaAppVersion(cliente), { tipo: "sinRespuesta" });
});

test("obtenerFilaAppVersion: respondió sin fila (status real, data null) -> tipo respondio, fila null", async () => {
  const cliente = clienteFalso({ status: 200, error: null, data: null });
  assert.deepEqual(await obtenerFilaAppVersion(cliente), { tipo: "respondio", fila: null });
});

test("obtenerFilaAppVersion: respondió con error de Postgrest (status real, no 0) -> tipo respondio, fila null", async () => {
  const cliente = clienteFalso({ status: 401, error: { message: "permission denied" }, data: null });
  assert.deepEqual(await obtenerFilaAppVersion(cliente), { tipo: "respondio", fila: null });
});

test("obtenerFilaAppVersion: respondió con fila -> tipo respondio, fila mapeada", async () => {
  const cliente = clienteFalso({
    status: 200,
    error: null,
    data: { build_recomendado: 4, url_descarga: "https://app.day2day.es/actualizar" },
  });
  assert.deepEqual(await obtenerFilaAppVersion(cliente), {
    tipo: "respondio",
    fila: { buildRecomendado: 4, urlDescarga: "https://app.day2day.es/actualizar" },
  });
});

test('"una vez por arranque": ciclo completo -- sin respuesta NO consume, responder SÍ consume', () => {
  // 1) Primera vez: nadie revisó ni hay nada en curso -> true, y queda "en curso".
  assert.equal(debeRevisarAvisoVersionEsteArranque(), true);

  // 2) Mientras está en curso, un remount no puede arrancar un segundo intento en paralelo.
  assert.equal(debeRevisarAvisoVersionEsteArranque(), false);

  // 3) La consulta de ese primer intento no tuvo respuesta (sin red) -- se libera, SIN marcar
  // "revisado". Ajuste de César (2026-11-04): abrir la app offline nunca gasta el único chequeo.
  liberarRevisionAvisoVersionEsteArranque();

  // 4) Con el intento liberado, un próximo montaje del componente en el mismo arranque puede
  // reintentar -- vuelve a dar true, exactamente como la primera vez.
  assert.equal(debeRevisarAvisoVersionEsteArranque(), true);

  // 5) Esta vez la consulta SÍ respondió (con o sin fila, da igual para este contrato) -- se marca
  // revisado. A partir de acá, "una vez por arranque" ya quedó consumida para siempre.
  marcarAvisoVersionRevisadoEsteArranque();
  assert.equal(debeRevisarAvisoVersionEsteArranque(), false);

  // 6) Liberar después de haber marcado revisado no reabre nada -- no hay forma de volver a
  // avisar en este arranque salvo un reinicio real del proceso.
  liberarRevisionAvisoVersionEsteArranque();
  assert.equal(debeRevisarAvisoVersionEsteArranque(), false);
});
