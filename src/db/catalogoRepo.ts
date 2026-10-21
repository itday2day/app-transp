import { obtenerBaseDeDatos } from "./database";
import { construirSqlReemplazoCatalogo, type ParEmpresaRuta } from "./catalogoSql";

/** Caché local del catálogo de empresas/rutas de Supabase (spec_catalogo_empresas_rutas.md,
 * Hallazgo #48) -- nunca se escribe desde la app, solo se reemplaza por completo en cada
 * descarga exitosa (ver syncService.descargarCatalogoSiCorresponde). Sin conexión o antes de la
 * primera descarga, CheckInForm.tsx cae a src/data/empresas.ts (el array incluido en la app). */
export type { ParEmpresaRuta };

/** Reemplaza TODO el contenido local por el que acaba de llegar de Supabase -- todo-o-nada: si
 * algo falla a mitad, la caché vieja queda intacta en vez de quedar a medio reemplazar (peor que
 * no haber descargado nada). Antes esto corría dentro de withTransactionAsync (BEGIN/DELETE/
 * INSERT.../COMMIT como awaits separados); el SQL completo se arma ahora en un único string
 * (construirSqlReemplazoCatalogo, catalogoSql.ts) y se ejecuta con UN solo execAsync -- una sola
 * llamada a sqlite3_exec() en el nativo, sin ventanas intermedias para otra escritura concurrente
 * sobre la misma conexión (Hallazgo #60; spec_transaccion_catalogo_sqlite.md). */
export async function reemplazarCatalogo(empresas: string[], rutas: ParEmpresaRuta[]): Promise<void> {
  const db = await obtenerBaseDeDatos();
  const sql = construirSqlReemplazoCatalogo(empresas, rutas);
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

export async function obtenerCatalogoEmpresas(): Promise<string[]> {
  const db = await obtenerBaseDeDatos();
  const filas = await db.getAllAsync<{ nombre: string }>(
    "SELECT nombre FROM catalogoEmpresas ORDER BY nombre ASC"
  );
  return filas.map((f) => f.nombre);
}

/** Todas las rutas cacheadas, agrupadas por empresa -- misma forma que RUTAS_POR_EMPRESA en
 * src/data/empresas.ts, para que CheckInForm.tsx no necesite distinguir entre las dos fuentes. */
export async function obtenerCatalogoRutasPorEmpresa(): Promise<Record<string, string[]>> {
  const db = await obtenerBaseDeDatos();
  const filas = await db.getAllAsync<{ empresa: string; nombre: string }>(
    "SELECT empresa, nombre FROM catalogoRutas ORDER BY empresa ASC, nombre ASC"
  );
  const mapa: Record<string, string[]> = {};
  for (const { empresa, nombre } of filas) {
    (mapa[empresa] ??= []).push(nombre);
  }
  return mapa;
}
