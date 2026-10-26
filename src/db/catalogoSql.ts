/** Construcción pura del SQL de reemplazarCatalogo() (catalogoRepo.ts) -- sin imports de React ni
 * de expo, para poder probarse con node:sqlite sin levantar nada de la app
 * (spec_transaccion_catalogo_sqlite.md). Antes, reemplazarCatalogo armaba la misma secuencia con
 * BEGIN/DELETE/INSERT.../COMMIT como llamadas await separadas dentro de withTransactionAsync --
 * varias llamadas nativas distintas, con una ventana entre cada await donde otra escritura
 * concurrente sobre la misma conexión podía intercalarse (Hallazgo #60). Acá se arma TODO el SQL
 * como un único string, para que catalogoRepo.ts lo ejecute con una sola llamada a execAsync() --
 * una sola llamada a sqlite3_exec() en el nativo, atómica frente a otro hilo mientras corre. */

export interface ParEmpresaRuta {
  empresa: string;
  nombre: string;
}

/** Fila de catalogoLocalPendiente (spec_catalogo_por_chofer.md, criterios 16-19) -- empresa = ''
 * para tipo='empresa' (no aplica). Mismas tres columnas que forman su PRIMARY KEY compuesta. */
export interface FilaCatalogoLocalPendiente {
  tipo: "empresa" | "ruta";
  empresa: string;
  nombre: string;
}

/** Escapa un valor para usarlo como literal SQL entre comillas simples: duplica cada comilla
 * simple (estándar SQL) y descarta \u0000 -- un NUL corta el string en el nativo (las cadenas C
 * terminan en NUL) y truncaría el literal en silencio en vez de insertar el valor completo. */
function escaparLiteralSql(valor: string): string {
  return valor.replace(/\u0000/g, "").replace(/'/g, "''");
}

/** Mismo comportamiento que el reemplazarCatalogo() anterior: catalogoEmpresas con INSERT simple
 * (un nombre repetido en `empresas` viola la PRIMARY KEY y hace fallar todo el bloque -- igual
 * que antes, cuando ese INSERT corría dentro de la transacción), catalogoRutas con INSERT OR
 * IGNORE (una ruta repetida se descarta en silencio, ya que (empresa, nombre) es la PRIMARY KEY
 * compuesta y sí se esperan repetidos legítimos entre ejecuciones). */
export function construirSqlReemplazoCatalogo(
  empresas: string[],
  rutas: ParEmpresaRuta[],
  // Criterio 19 (diagnóstico 7): filas de catalogoLocalPendiente cuyo nombre normalizado ya llegó
  // en esta misma descarga -- calculadas por el llamador (catalogoRepo.ts, con
  // filasPendientesAEliminar de catalogoUnion.ts) ANTES de abrir la transacción (una lectura
  // simple con getAllAsync, segura: el riesgo de Hallazgo #60 es solo entre ESCRITURAS
  // concurrentes). Van DENTRO del mismo BEGIN...COMMIT que el reemplazo de arriba -- una sola
  // llamada a execAsync, sin ventana para otra escritura concurrente.
  pendientesABorrar: FilaCatalogoLocalPendiente[] = []
): string {
  const partes: string[] = ["BEGIN;", "DELETE FROM catalogoEmpresas;", "DELETE FROM catalogoRutas;"];

  for (const nombre of empresas) {
    partes.push(`INSERT INTO catalogoEmpresas (nombre) VALUES ('${escaparLiteralSql(nombre)}');`);
  }
  for (const { empresa, nombre } of rutas) {
    partes.push(
      `INSERT OR IGNORE INTO catalogoRutas (empresa, nombre) VALUES ('${escaparLiteralSql(empresa)}', '${escaparLiteralSql(nombre)}');`
    );
  }
  for (const fila of pendientesABorrar) {
    partes.push(
      `DELETE FROM catalogoLocalPendiente WHERE tipo = '${escaparLiteralSql(fila.tipo)}' AND empresa = '${escaparLiteralSql(fila.empresa)}' AND nombre = '${escaparLiteralSql(fila.nombre)}';`
    );
  }

  partes.push("COMMIT;");
  return partes.join("\n");
}
