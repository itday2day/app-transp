import * as SQLite from "expo-sqlite";

// Se cachea la promesa (no la instancia ya resuelta) para que llamadas
// concurrentes esperen la misma apertura en vez de abrir cada una su propio
// access handle sobre el mismo archivo OPFS — eso último causa
// "NoModificationAllowedError: Access Handles cannot be created..." en web.
let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

export function obtenerBaseDeDatos(): Promise<SQLite.SQLiteDatabase> {
  if (dbPromise) return dbPromise;

  dbPromise = abrirBaseDeDatos();
  return dbPromise;
}

async function abrirBaseDeDatos(): Promise<SQLite.SQLiteDatabase> {
  const db = await SQLite.openDatabaseAsync("app_transp.db");

  await db.execAsync(`
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS jornadas (
      id TEXT PRIMARY KEY NOT NULL,
      choferId TEXT NOT NULL,
      choferNombre TEXT NOT NULL,
      empresa TEXT NOT NULL,
      matricula TEXT NOT NULL,
      ruta TEXT NOT NULL,
      incidencias TEXT,
      kmInicial REAL NOT NULL,
      combustibleInicial REAL NOT NULL,
      -- fotoTacometroInicialUri/latInicial/lngInicial: nullable desde
      -- spec_rutas_asignadas_admin.md -- una jornada creada por Administración desde el Dashboard
      -- no tiene foto real de tacómetro ni GPS real del dispositivo. Instalaciones existentes se
      -- migran en relajarNotNullCheckIn() más abajo (SQLite no soporta ALTER COLUMN).
      fotoTacometroInicialUri TEXT,
      fotoRutaUri TEXT NOT NULL,
      latInicial REAL,
      lngInicial REAL,
      fechaCheckIn TEXT NOT NULL,
      tuvoIncidenciaCheckin INTEGER,
      tipoIncidenciaCheckin TEXT,
      detalleIncidenciaCheckin TEXT,
      fotosIncidenciaCheckinUris TEXT,
      fotosIncidenciaCheckin TEXT,
      kmFinal REAL,
      combustibleFinal REAL,
      fotoTacometroFinalUri TEXT,
      latFinal REAL,
      lngFinal REAL,
      fechaCheckOut TEXT,
      tuvoIncidencia INTEGER,
      tipoIncidencia TEXT,
      detalleIncidencia TEXT,
      fotoCheckInUrl TEXT,
      fotoRutaUrl TEXT,
      fotoCheckOutUrl TEXT,
      fotosIncidenciaUris TEXT,
      fotosIncidencia TEXT,
      estado TEXT NOT NULL DEFAULT 'abierta',
      sincronizacion TEXT NOT NULL DEFAULT 'pendiente',
      intentosSincronizacion INTEGER NOT NULL DEFAULT 0,
      creadaPorAdmin INTEGER NOT NULL DEFAULT 0,
      creadaPor TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_jornadas_chofer ON jornadas (choferId);
    CREATE INDEX IF NOT EXISTS idx_jornadas_estado ON jornadas (estado);

    -- spec_catalogo_empresas_rutas.md (Hallazgo #48): caché local del catálogo de Supabase --
    -- nunca se escribe desde la app (solo el Dashboard da de alta), así que no necesita id propio
    -- ni sincronizacion/intentosSincronizacion como jornadas. catalogoRepo.ts reemplaza el
    -- contenido completo en cada descarga exitosa (la tabla es chica, decenas de filas), no hace
    -- diff incremental.
    CREATE TABLE IF NOT EXISTS catalogoEmpresas (
      nombre TEXT PRIMARY KEY NOT NULL
    );

    CREATE TABLE IF NOT EXISTS catalogoRutas (
      empresa TEXT NOT NULL,
      nombre TEXT NOT NULL,
      PRIMARY KEY (empresa, nombre)
    );
  `);

  await agregarColumnasFaltantes(db);
  await relajarNotNullCheckIn(db);
  await migrarCombustibleAPorcentaje(db);

  return db;
}

// spec_rutas_asignadas_admin.md: relaja el NOT NULL de fotoTacometroInicialUri/latInicial/
// lngInicial en instalaciones EXISTENTES (una app nueva ya nace con el CREATE TABLE de arriba, ya
// nullable). SQLite no soporta ALTER COLUMN para tocar un constraint -- hace falta el
// procedimiento de reconstrucción de tabla que la propia documentación de SQLite recomienda:
// crear la tabla nueva con el esquema correcto, copiar todas las filas tal cual (sin perder ni
// transformar ningún dato), borrar la vieja, renombrar. Se salta solo si ya corrió (PRAGMA
// table_info reporta notnull=0 en fotoTacometroInicialUri) -- para no reconstruir la tabla en
// cada arranque de la app.
async function relajarNotNullCheckIn(db: SQLite.SQLiteDatabase): Promise<void> {
  const columnas = await db.getAllAsync<{ name: string; notnull: number }>(`PRAGMA table_info(jornadas)`);
  const fotoInicial = columnas.find((c) => c.name === "fotoTacometroInicialUri");
  if (!fotoInicial || fotoInicial.notnull === 0) return;

  await db.execAsync(`
    CREATE TABLE jornadas_nueva (
      id TEXT PRIMARY KEY NOT NULL,
      choferId TEXT NOT NULL,
      choferNombre TEXT NOT NULL,
      empresa TEXT NOT NULL,
      matricula TEXT NOT NULL,
      ruta TEXT NOT NULL,
      incidencias TEXT,
      kmInicial REAL NOT NULL,
      combustibleInicial REAL NOT NULL,
      fotoTacometroInicialUri TEXT,
      fotoRutaUri TEXT NOT NULL,
      latInicial REAL,
      lngInicial REAL,
      fechaCheckIn TEXT NOT NULL,
      tuvoIncidenciaCheckin INTEGER,
      tipoIncidenciaCheckin TEXT,
      detalleIncidenciaCheckin TEXT,
      fotosIncidenciaCheckinUris TEXT,
      fotosIncidenciaCheckin TEXT,
      kmFinal REAL,
      combustibleFinal REAL,
      fotoTacometroFinalUri TEXT,
      latFinal REAL,
      lngFinal REAL,
      fechaCheckOut TEXT,
      tuvoIncidencia INTEGER,
      tipoIncidencia TEXT,
      detalleIncidencia TEXT,
      fotoCheckInUrl TEXT,
      fotoRutaUrl TEXT,
      fotoCheckOutUrl TEXT,
      fotosIncidenciaUris TEXT,
      fotosIncidencia TEXT,
      estado TEXT NOT NULL DEFAULT 'abierta',
      sincronizacion TEXT NOT NULL DEFAULT 'pendiente',
      intentosSincronizacion INTEGER NOT NULL DEFAULT 0,
      creadaPorAdmin INTEGER NOT NULL DEFAULT 0,
      creadaPor TEXT
    );

    INSERT INTO jornadas_nueva (
      id, choferId, choferNombre, empresa, matricula, ruta, incidencias, kmInicial,
      combustibleInicial, fotoTacometroInicialUri, fotoRutaUri, latInicial, lngInicial,
      fechaCheckIn, tuvoIncidenciaCheckin, tipoIncidenciaCheckin, detalleIncidenciaCheckin,
      fotosIncidenciaCheckinUris, fotosIncidenciaCheckin, kmFinal, combustibleFinal,
      fotoTacometroFinalUri, latFinal, lngFinal, fechaCheckOut, tuvoIncidencia, tipoIncidencia,
      detalleIncidencia, fotoCheckInUrl, fotoRutaUrl, fotoCheckOutUrl, fotosIncidenciaUris,
      fotosIncidencia, estado, sincronizacion, intentosSincronizacion, creadaPorAdmin, creadaPor
    )
    SELECT
      id, choferId, choferNombre, empresa, matricula, ruta, incidencias, kmInicial,
      combustibleInicial, fotoTacometroInicialUri, fotoRutaUri, latInicial, lngInicial,
      fechaCheckIn, tuvoIncidenciaCheckin, tipoIncidenciaCheckin, detalleIncidenciaCheckin,
      fotosIncidenciaCheckinUris, fotosIncidenciaCheckin, kmFinal, combustibleFinal,
      fotoTacometroFinalUri, latFinal, lngFinal, fechaCheckOut, tuvoIncidencia, tipoIncidencia,
      detalleIncidencia, fotoCheckInUrl, fotoRutaUrl, fotoCheckOutUrl, fotosIncidenciaUris,
      fotosIncidencia, estado, sincronizacion, intentosSincronizacion, creadaPorAdmin, creadaPor
    FROM jornadas;

    DROP TABLE jornadas;
    ALTER TABLE jornadas_nueva RENAME TO jornadas;

    CREATE INDEX IF NOT EXISTS idx_jornadas_chofer ON jornadas (choferId);
    CREATE INDEX IF NOT EXISTS idx_jornadas_estado ON jornadas (estado);
  `);
}

// combustibleInicial/combustibleFinal eran un enum de texto ("Reserva"|"1/4"|
// "1/2"|"3/4"|"Lleno") y pasaron a ser un porcentaje 0-100 (ver
// src/types/index.ts NivelCombustible). Convierte cualquier fila que un
// dispositivo ya tenga guardada con los valores viejos — no-op (WHERE no
// matchea nada) en instalaciones nuevas o ya migradas.
async function migrarCombustibleAPorcentaje(db: SQLite.SQLiteDatabase): Promise<void> {
  const mapeo = `CASE %COLUMNA%
    WHEN 'Reserva' THEN 0
    WHEN '1/4' THEN 25
    WHEN '1/2' THEN 50
    WHEN '3/4' THEN 75
    WHEN 'Lleno' THEN 100
    ELSE %COLUMNA%
  END`;

  for (const columna of ["combustibleInicial", "combustibleFinal"]) {
    const casoConColumna = mapeo.split("%COLUMNA%").join(columna);
    await db.execAsync(`
      UPDATE jornadas SET ${columna} = ${casoConColumna}
      WHERE ${columna} IN ('Reserva', '1/4', '1/2', '3/4', 'Lleno');
    `);
  }
}

// CREATE TABLE IF NOT EXISTS no toca una tabla que ya existe de una versión
// anterior de la app, así que las columnas agregadas después de la primera
// instalación (matricula, ruta, empresa, ...) quedan ausentes y el INSERT
// falla en silencio. Esto agrega cualquier columna que falte en el dispositivo.
const COLUMNAS_JORNADA: Record<string, string> = {
  empresa: "TEXT NOT NULL DEFAULT ''",
  matricula: "TEXT NOT NULL DEFAULT ''",
  ruta: "TEXT NOT NULL DEFAULT ''",
  incidencias: "TEXT",
  tuvoIncidencia: "INTEGER",
  tipoIncidencia: "TEXT",
  detalleIncidencia: "TEXT",
  // spec_incidencia_en_checkin.md — incidencia estructurada del check-in, mismas columnas que las
  // de check-out de arriba, con sufijo "Checkin" (ver src/types/index.ts).
  tuvoIncidenciaCheckin: "INTEGER",
  tipoIncidenciaCheckin: "TEXT",
  detalleIncidenciaCheckin: "TEXT",
  fotosIncidenciaCheckinUris: "TEXT",
  fotosIncidenciaCheckin: "TEXT",
  fotoCheckInUrl: "TEXT",
  fotoRutaUrl: "TEXT",
  fotoCheckOutUrl: "TEXT",
  fotosIncidenciaUris: "TEXT",
  fotosIncidencia: "TEXT",
  // spec_rutas_asignadas_admin.md — jornada cargada por Administración desde el Dashboard, nunca
  // por el propio chofer. relajarNotNullCheckIn() de abajo depende de que estas dos ya existan
  // antes de reconstruir la tabla, por eso agregarColumnasFaltantes() corre primero.
  creadaPorAdmin: "INTEGER NOT NULL DEFAULT 0",
  creadaPor: "TEXT",
};

async function agregarColumnasFaltantes(db: SQLite.SQLiteDatabase): Promise<void> {
  const columnas = await db.getAllAsync<{ name: string }>(`PRAGMA table_info(jornadas)`);
  const existentes = new Set(columnas.map((c) => c.name));

  for (const [nombre, definicion] of Object.entries(COLUMNAS_JORNADA)) {
    if (!existentes.has(nombre)) {
      await db.execAsync(`ALTER TABLE jornadas ADD COLUMN ${nombre} ${definicion}`);
    }
  }
}
