/** Construcción pura del SQL que relaja `combustibleInicial` a nullable en la tabla `jornadas`
 * local (spec_ajustes_previos_apk.md, A2/A3) -- sin imports de React ni de `expo-sqlite`, como
 * `catalogoSql.ts`, para poder probarse con `node` + SQLite real sin levantar la app.
 *
 * A diferencia de `relajarNotNullCheckIn()` (database.ts), que tiene la definición de la tabla
 * nueva escrita a mano (una lista fija de columnas) y corre como varias sentencias sueltas sin
 * transacción, esta reconstrucción:
 *   - Arma el `CREATE TABLE` a partir de las columnas REALES de la tabla vieja (el resultado de
 *     `PRAGMA table_info(jornadas)`, pasado por el llamador) -- nunca una lista escrita a mano.
 *     Ninguna columna agregada después por `agregarColumnasFaltantes()` puede quedar sin copiar.
 *   - Devuelve UN solo string con `BEGIN; ... COMMIT;`, para que el llamador lo ejecute con una
 *     única llamada a `execAsync()` -- una sola llamada nativa a `sqlite3_exec()`, transaccional.
 *
 * La tabla `jornadas` local no tiene ningún `CHECK` ni clave foránea (confirmado leyendo
 * database.ts completo) -- por eso alcanza con `name`/`type`/`notnull`/`dflt_value`/`pk` de
 * `PRAGMA table_info` para reconstruir la definición exacta de cada columna, sin perder nada.
 */
export interface ColumnaTablaSqlite {
  name: string;
  type: string;
  notnull: number;
  dflt_value: string | null;
  pk: number;
}

const TABLA_VIEJA = "jornadas";
const TABLA_NUEVA = "jornadas_nueva";
const COLUMNA_A_RELAJAR = "combustibleInicial";

function definicionColumna(columna: ColumnaTablaSqlite): string {
  const partes = [columna.name, columna.type];
  if (columna.pk > 0) partes.push("PRIMARY KEY");
  // La única diferencia a propósito frente a la tabla vieja: combustibleInicial deja de llevar
  // NOT NULL. Cualquier otra columna conserva EXACTAMENTE el notnull que PRAGMA table_info
  // reportó -- nunca se relaja ni se endurece nada más.
  if (columna.notnull === 1 && columna.name !== COLUMNA_A_RELAJAR) partes.push("NOT NULL");
  // dflt_value ya viene formateado como literal SQL válido (comillas incluidas para texto, sin
  // comillas para números) -- es el mismo texto que generaría sqlite_master para esa columna.
  if (columna.dflt_value !== null) partes.push(`DEFAULT ${columna.dflt_value}`);
  return partes.join(" ");
}

/** Arma el SQL completo de la reconstrucción -- BEGIN...COMMIT con la nueva tabla, la copia de
 * TODAS las columnas de `columnas` (en ese mismo orden), el DROP/RENAME, y los dos índices que
 * hoy existen sobre `jornadas` (`idx_jornadas_chofer`, `idx_jornadas_estado` -- confirmado por
 * grep que son los únicos `CREATE INDEX`/`CREATE TRIGGER` en todo `src/`, y que no hay ninguna
 * clave foránea de otra tabla hacia `jornadas`). Si en el futuro se agrega un trigger o un índice
 * nuevo sobre `jornadas`, hay que agregarlo también acá -- esta función no los descubre solos. */
export function construirSqlRelajarCombustibleInicial(columnas: ColumnaTablaSqlite[]): string {
  const nombres = columnas.map((c) => c.name).join(", ");
  const definiciones = columnas.map(definicionColumna).join(",\n      ");

  return [
    "BEGIN;",
    `CREATE TABLE ${TABLA_NUEVA} (\n      ${definiciones}\n    );`,
    `INSERT INTO ${TABLA_NUEVA} (${nombres}) SELECT ${nombres} FROM ${TABLA_VIEJA};`,
    `DROP TABLE ${TABLA_VIEJA};`,
    `ALTER TABLE ${TABLA_NUEVA} RENAME TO ${TABLA_VIEJA};`,
    `CREATE INDEX IF NOT EXISTS idx_jornadas_chofer ON ${TABLA_VIEJA} (choferId);`,
    `CREATE INDEX IF NOT EXISTS idx_jornadas_estado ON ${TABLA_VIEJA} (estado);`,
    "COMMIT;",
  ].join("\n");
}
