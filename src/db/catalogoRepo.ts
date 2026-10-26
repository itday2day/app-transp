import { obtenerBaseDeDatos } from "./database";
import {
  construirSqlReemplazoCatalogo,
  type ParEmpresaRuta,
  type FilaCatalogoLocalPendiente,
} from "./catalogoSql";
import {
  unirListaConPendientes,
  unirRutasPorEmpresaConPendientes,
  filasPendientesAEliminar,
} from "@/utils/catalogoUnion";

/** Caché local del catálogo de empresas/rutas de Supabase (spec_catalogo_empresas_rutas.md,
 * Hallazgo #48) -- nunca se escribe desde la app, solo se reemplaza por completo en cada
 * descarga exitosa (ver syncService.descargarCatalogoSiCorresponde). spec_catalogo_por_chofer.md
 * (criterios 16-19): ya no hay respaldo de bundle (src/data/empresas.ts no existe más) -- lo que
 * CheckInForm.tsx muestra es SIEMPRE la unión de esta caché con catalogoLocalPendiente (lo que el
 * propio chofer agregó desde la ventana "Agregar...", todavía no confirmado por el servidor). Un
 * catálogo vacío (primer arranque, sin red todavía) es una lista vacía de verdad, no el bundle. */
export type { ParEmpresaRuta, FilaCatalogoLocalPendiente };

/** Reemplaza TODO el contenido local por el que acaba de llegar de Supabase -- todo-o-nada: si
 * algo falla a mitad, la caché vieja queda intacta en vez de quedar a medio reemplazar (peor que
 * no haber descargado nada). Antes esto corría dentro de withTransactionAsync (BEGIN/DELETE/
 * INSERT.../COMMIT como awaits separados); el SQL completo se arma ahora en un único string
 * (construirSqlReemplazoCatalogo, catalogoSql.ts) y se ejecuta con UN solo execAsync -- una sola
 * llamada a sqlite3_exec() en el nativo, sin ventanas intermedias para otra escritura concurrente
 * sobre la misma conexión (Hallazgo #60; spec_transaccion_catalogo_sqlite.md). */
export async function reemplazarCatalogo(empresas: string[], rutas: ParEmpresaRuta[]): Promise<void> {
  const db = await obtenerBaseDeDatos();
  // Lectura simple, SIN transacción propia -- corre ANTES de abrir el BEGIN de abajo, así que no
  // compite con ninguna escritura (el riesgo de Hallazgo #60 es solo entre escrituras concurrentes
  // sobre la misma conexión). Con su resultado se decide, en JS, qué filas de
  // catalogoLocalPendiente ya quedaron redundantes con ESTA descarga (criterio 19, diagnóstico 7)
  // -- y esa limpieza entra en el MISMO execAsync atómico de abajo, no en una llamada aparte.
  const pendientes = await db.getAllAsync<FilaCatalogoLocalPendiente>(
    "SELECT tipo, empresa, nombre FROM catalogoLocalPendiente"
  );
  const pendientesABorrar = filasPendientesAEliminar(pendientes, empresas, rutas);
  const sql = construirSqlReemplazoCatalogo(empresas, rutas, pendientesABorrar);
  try {
    await db.execAsync(sql);
  } catch (error) {
    // Ventana residual: a diferencia del BEGIN...COMMIT de arriba (una sola llamada nativa,
    // atómica), este catch y el ROLLBACK de abajo SÍ son dos llamadas nativas separadas
    // (execAsync ya falló; isInTransactionAsync y el ROLLBACK corren después, con un await de
    // por medio) -- la misma ventana mínima que ya tiene withTransactionAsync de la librería
    // (ver expo-sqlite/build/SQLiteDatabase.js). No se puede cerrar sin un mutex propio en JS, y
    // no es lo que esta spec ataca: lo que sí se evitó fue partir el REEMPLAZO en sí en múltiples
    // awaits. Por eso isInTransactionAsync() se confirma antes del ROLLBACK (sqlite3_exec() no
    // hace rollback automático si BEGIN ya corrió y una sentencia posterior falla -- un ROLLBACK
    // sin transacción abierta fallaría a su vez).
    if (await db.isInTransactionAsync()) {
      try {
        await db.execAsync("ROLLBACK;");
      } catch (errorRollback) {
        console.error("reemplazarCatalogo: el ROLLBACK también falló:", errorRollback);
      }
    }
    throw error;
  }
}

/** Unión de catalogoEmpresas (lo que bajó del servidor) con catalogoLocalPendiente (lo que el
 * chofer agregó y todavía no se confirmó) -- ver unirListaConPendientes, catalogoUnion.ts. */
export async function obtenerCatalogoEmpresas(): Promise<string[]> {
  const db = await obtenerBaseDeDatos();
  const [filas, pendientes] = await Promise.all([
    db.getAllAsync<{ nombre: string }>("SELECT nombre FROM catalogoEmpresas ORDER BY nombre ASC"),
    db.getAllAsync<{ nombre: string }>("SELECT nombre FROM catalogoLocalPendiente WHERE tipo = 'empresa'"),
  ]);
  return unirListaConPendientes(
    filas.map((f) => f.nombre),
    pendientes.map((f) => f.nombre)
  );
}

/** Todas las rutas cacheadas, agrupadas por empresa, unidas con las rutas de
 * catalogoLocalPendiente -- ver unirRutasPorEmpresaConPendientes, catalogoUnion.ts. */
export async function obtenerCatalogoRutasPorEmpresa(): Promise<Record<string, string[]>> {
  const db = await obtenerBaseDeDatos();
  const [filas, pendientes] = await Promise.all([
    db.getAllAsync<{ empresa: string; nombre: string }>(
      "SELECT empresa, nombre FROM catalogoRutas ORDER BY empresa ASC, nombre ASC"
    ),
    db.getAllAsync<FilaCatalogoLocalPendiente>(
      "SELECT tipo, empresa, nombre FROM catalogoLocalPendiente WHERE tipo = 'ruta'"
    ),
  ]);
  const mapa: Record<string, string[]> = {};
  for (const { empresa, nombre } of filas) {
    (mapa[empresa] ??= []).push(nombre);
  }
  return unirRutasPorEmpresaConPendientes(mapa, pendientes);
}

/** Alta local (criterio 18, diagnóstico 7): la ventana "Agregar..." de CheckInForm.tsx llama esto
 * al aceptar un nombre nuevo -- sin red, nunca llega a Supabase directo (la única vía para crear
 * una empresa/ruta de verdad es que viaje dentro de una jornada; el trigger del servidor la crea
 * "pendiente de revisión" en ese momento). `ON CONFLICT DO NOTHING`: la PRIMARY KEY compuesta
 * (tipo, empresa, nombre) ya alcanza para no duplicar un alta repetida. */
export async function agregarCatalogoLocalPendiente(
  tipo: "empresa" | "ruta",
  empresa: string,
  nombre: string
): Promise<void> {
  const db = await obtenerBaseDeDatos();
  await db.runAsync(
    "INSERT INTO catalogoLocalPendiente (tipo, empresa, nombre, agregadoEn) VALUES ($tipo, $empresa, $nombre, $agregadoEn) ON CONFLICT DO NOTHING",
    { $tipo: tipo, $empresa: empresa, $nombre: nombre, $agregadoEn: new Date().toISOString() }
  );
}
