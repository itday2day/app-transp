import { obtenerBaseDeDatos } from "./database";

/** Caché local del catálogo de empresas/rutas de Supabase (spec_catalogo_empresas_rutas.md,
 * Hallazgo #48) -- nunca se escribe desde la app, solo se reemplaza por completo en cada
 * descarga exitosa (ver syncService.descargarCatalogoSiCorresponde). Sin conexión o antes de la
 * primera descarga, CheckInForm.tsx cae a src/data/empresas.ts (el array incluido en la app). */
export interface ParEmpresaRuta {
  empresa: string;
  nombre: string;
}

/** Reemplaza TODO el contenido local por el que acaba de llegar de Supabase -- todo-o-nada
 * dentro de una transacción: si algo falla a mitad, la caché vieja queda intacta en vez de
 * quedar a medio reemplazar (peor que no haber descargado nada). */
export async function reemplazarCatalogo(empresas: string[], rutas: ParEmpresaRuta[]): Promise<void> {
  const db = await obtenerBaseDeDatos();
  await db.withTransactionAsync(async () => {
    await db.execAsync("DELETE FROM catalogoEmpresas; DELETE FROM catalogoRutas;");
    for (const nombre of empresas) {
      await db.runAsync("INSERT INTO catalogoEmpresas (nombre) VALUES (?)", [nombre]);
    }
    for (const { empresa, nombre } of rutas) {
      await db.runAsync("INSERT OR IGNORE INTO catalogoRutas (empresa, nombre) VALUES (?, ?)", [
        empresa,
        nombre,
      ]);
    }
  });
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
