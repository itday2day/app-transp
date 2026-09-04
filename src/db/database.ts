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
      fotoTacometroInicialUri TEXT NOT NULL,
      fotoRutaUri TEXT NOT NULL,
      latInicial REAL NOT NULL,
      lngInicial REAL NOT NULL,
      fechaCheckIn TEXT NOT NULL,
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
      intentosSincronizacion INTEGER NOT NULL DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS idx_jornadas_chofer ON jornadas (choferId);
    CREATE INDEX IF NOT EXISTS idx_jornadas_estado ON jornadas (estado);
  `);

  await agregarColumnasFaltantes(db);
  await migrarCombustibleAPorcentaje(db);

  return db;
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
  fotoCheckInUrl: "TEXT",
  fotoRutaUrl: "TEXT",
  fotoCheckOutUrl: "TEXT",
  fotosIncidenciaUris: "TEXT",
  fotosIncidencia: "TEXT",
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
