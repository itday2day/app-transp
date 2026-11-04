// spec_aviso_version_y_pagina_actualizar.md, Fase 2, criterios 4 y 8: lógica PURA de cuándo
// mostrar el aviso de "hay una versión nueva" -- sin React Native, se compila con `tsc` puro y se
// prueba con `node --test` (mismo criterio que logicaPortapapeles.ts/authCore.ts: separar la
// decisión de la llamada real a Supabase, que el llamador hace con el cliente real).

import type { SupabaseClient } from "@supabase/supabase-js";

export interface FilaAppVersion {
  buildRecomendado: number;
  urlDescarga: string;
}

/** Revisión 2026-11-04 (ajuste de César): distingue "la consulta respondió" (con fila, sin fila, o
 * con un error real del servidor) de "nunca hubo respuesta" (sin red, DNS, timeout) -- postgrest-js
 * (PostgrestBuilder.ts) NO lanza por defecto ante un fallo de fetch: resuelve con `status: 0` y un
 * `error` armado localmente ("Note: We don't populate code/hint for client-side network errors").
 * `status` real del servidor (2xx o un error de Postgrest/Postgres) es siempre distinto de 0 -- es
 * el único campo documentado que separa los dos casos. El llamador usa esto para decidir si
 * `debeRevisarAvisoVersionEsteArranque` queda consumida o se libera (ver más abajo). */
export type ResultadoLecturaAppVersion =
  { tipo: "respondio"; fila: FilaAppVersion | null } | { tipo: "sinRespuesta" };

/** NUNCA lanza (criterio 8: sin conexión, con error de red o con la fila ausente, no se muestra
 * nada y no hay demora al abrir). `tipo: "sinRespuesta"` cubre tanto el caso documentado de
 * postgrest-js (status 0) como cualquier excepción inesperada fuera del fetch mismo. */
export async function obtenerFilaAppVersion(cliente: SupabaseClient): Promise<ResultadoLecturaAppVersion> {
  try {
    const respuesta = await cliente
      .from("app_version")
      .select("build_recomendado, url_descarga")
      .eq("plataforma", "android")
      .maybeSingle();

    if (respuesta.status === 0) return { tipo: "sinRespuesta" };
    if (respuesta.error || !respuesta.data) return { tipo: "respondio", fila: null };

    return {
      tipo: "respondio",
      fila: {
        buildRecomendado: respuesta.data.build_recomendado as number,
        urlDescarga: respuesta.data.url_descarga as string,
      },
    };
  } catch {
    return { tipo: "sinRespuesta" };
  }
}

/** Criterio 4: compara `Application.nativeBuildVersion` (texto, puede ser `null` en Expo Go/web)
 * contra `build_recomendado` (entero). Un valor no numérico (o `null`, o una fila ausente) nunca
 * muestra el aviso -- un dato corrupto no es motivo para avisar, es motivo para quedarse callado.
 * `/^\d+$/` (no `Number.parseInt` solo) a propósito: `parseInt("4-algo-raro")` devolvería 4 sin
 * avisar que el resto del texto no es un número -- acá un valor parcialmente numérico también
 * cuenta como "no numérico". */
export function debeMostrarAviso(buildInstaladoTexto: string | null, fila: FilaAppVersion | null): boolean {
  if (!fila || !buildInstaladoTexto) return false;
  if (!/^\d+$/.test(buildInstaladoTexto)) return false;

  const buildInstalado = Number.parseInt(buildInstaladoTexto, 10);
  return buildInstalado < fila.buildRecomendado;
}

// "Una vez por arranque" (criterio 4): mismo patrón que logicaPortapapeles.ts --
// debeRevisarPortapapelesEsteArranque() -- variables de módulo propias, nunca persistidas, se
// restablecen solas con cada reinicio real del proceso.
//
// Revisión 2026-11-04 (ajuste de César): consumir el "una vez por arranque" YA NO pasa en
// `debeRevisarAvisoVersionEsteArranque()` (eso solo evita dos intentos concurrentes, ver
// `revisionEnCursoEsteArranque` abajo) -- el llamador tiene que confirmar explícitamente que la
// consulta RESPONDIÓ (`marcarAvisoVersionRevisadoEsteArranque`) antes de que cuente como
// "revisado". Si la consulta no tuvo respuesta (sin red), el llamador libera el intento
// (`liberarRevisionAvisoVersionEsteArranque`) y queda disponible para la próxima vez que el
// componente se monte en este mismo arranque (por ejemplo, logout/login sin reiniciar el proceso)
// -- abrir la app offline nunca debe "gastar" el único chequeo del arranque.
let yaRevisadoEnEsteArranque = false;
let revisionEnCursoEsteArranque = false;

/** `true` la primera vez que se llama (y mientras no haya ni una revisión completada ni una en
 * curso); `false` si ya se completó una revisión este arranque, o si hay una en curso (evita dos
 * intentos concurrentes, por ejemplo con un remount rápido). El llamador debe terminar cada
 * intento llamando a `marcarAvisoVersionRevisadoEsteArranque()` (consulta respondió) o a
 * `liberarRevisionAvisoVersionEsteArranque()` (sin respuesta) -- nunca dejarlo sin resolver. */
export function debeRevisarAvisoVersionEsteArranque(): boolean {
  if (yaRevisadoEnEsteArranque || revisionEnCursoEsteArranque) return false;
  revisionEnCursoEsteArranque = true;
  return true;
}

/** La consulta respondió (con fila o sin fila) -- consume el único chequeo del arranque. */
export function marcarAvisoVersionRevisadoEsteArranque(): void {
  yaRevisadoEnEsteArranque = true;
  revisionEnCursoEsteArranque = false;
}

/** La consulta NO respondió (sin red, timeout) -- NO consume el chequeo del arranque, queda
 * disponible para un próximo intento (otro montaje del componente) en este mismo arranque. */
export function liberarRevisionAvisoVersionEsteArranque(): void {
  revisionEnCursoEsteArranque = false;
}
