// Pruebas del reclamo atómico de sincronización (spec_reclamo_atomico_sincronizacion.md, criterio 8).
// Corre con: node --test pruebas/reclamoSincronizacion.test.mjs (Node >= 23.6, sin flags: importa el
// .ts con type stripping). Usa el SQL real de src/db/sincronizacionSql.ts y el CREATE TABLE
// literal de src/db/database.ts, contra node:sqlite. Dos conexiones distintas sobre el mismo
// archivo hacen de los dos contextos de JavaScript (app abierta y tarea en segundo plano).
import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  PLAZO_RESERVA_SINCRONIZACION_MS,
  SQL_MARCAR_ERROR,
  SQL_MARCAR_PENDIENTE_SIN_CONTAR,
  SQL_MARCAR_SINCRONIZADO,
  SQL_PENDIENTES_SINCRONIZACION,
  SQL_RECLAMAR_JORNADA,
  limiteReserva,
} from "../src/db/sincronizacionSql.ts";

const fuenteDatabase = readFileSync(new URL("../src/db/database.ts", import.meta.url), "utf8");
const CREATE_TABLE_JORNADAS = fuenteDatabase.match(
  /CREATE TABLE IF NOT EXISTS jornadas \([\s\S]*?\n {4}\);/
)[0];
const DEFINICION_COLUMNA_NUEVA = fuenteDatabase.match(/sincronizandoDesde: "([^"]+)"/)[1];

const AHORA = 1_762_160_000_000;
const ID = "a1b2c3d4";

function abrirDos(createTable = CREATE_TABLE_JORNADAS) {
  const dir = mkdtempSync(join(tmpdir(), "reclamo-"));
  const archivo = join(dir, "app_transp.db");
  const a = new DatabaseSync(archivo);
  a.exec(`PRAGMA journal_mode = WAL; ${createTable}`);
  const b = new DatabaseSync(archivo);
  const cerrar = () => {
    a.close();
    b.close();
    rmSync(dir, { recursive: true, force: true });
  };
  return { a, b, cerrar };
}

function insertar(db, { sincronizacion = "pendiente", intentos = 0, desde } = {}) {
  const columnas = desde === undefined ? "" : ", sincronizandoDesde";
  const valores = desde === undefined ? "" : ", ?";
  db.prepare(
    `INSERT INTO jornadas (id, choferId, choferNombre, empresa, matricula, ruta, kmInicial, fotoRutaUri,
       fechaCheckIn, sincronizacion, intentosSincronizacion${columnas})
     VALUES (?, 'chofer01', 'Chofer', 'EMPRESA', '1234ABC', 'RUTA', 1000, 'file://ruta.jpg',
       '2026-11-03T08:00:00Z', ?, ?${valores})`
  ).run(ID, sincronizacion, intentos, ...(desde === undefined ? [] : [desde]));
}

const fila = (db) =>
  db
    .prepare(`SELECT sincronizacion, intentosSincronizacion, sincronizandoDesde FROM jornadas WHERE id = ?`)
    .get(ID);
const pendientes = (db, ahora) => db.prepare(SQL_PENDIENTES_SINCRONIZACION).all(limiteReserva(ahora));
const reclamar = (db, ahora) => db.prepare(SQL_RECLAMAR_JORNADA).run(ahora, ID, limiteReserva(ahora)).changes;
const cerrar = (db, sql, desde) => db.prepare(sql).run(ID, desde).changes;

test("dos reclamadores concurrentes: gana uno solo", () => {
  const { a, b, cerrar: fin } = abrirDos();
  try {
    insertar(a);
    // Los dos leen la misma jornada como pendiente antes de reclamar (el hueco de hoy).
    assert.equal(pendientes(a, AHORA).length, 1);
    assert.equal(pendientes(b, AHORA).length, 1);
    assert.equal(reclamar(a, AHORA), 1);
    assert.equal(reclamar(b, AHORA + 5), 0);
    assert.deepEqual(
      { ...fila(b) },
      { sincronizacion: "sincronizando", intentosSincronizacion: 0, sincronizandoDesde: AHORA }
    );
    // Mientras la reserva está viva, ni el ciclo ni el banner la ven como pendiente.
    assert.equal(pendientes(b, AHORA + 60_000).length, 0);
  } finally {
    fin();
  }
});

test("reserva vencida: se recupera sin sumar intento", () => {
  const { a, cerrar: fin } = abrirDos();
  try {
    insertar(a, {
      sincronizacion: "sincronizando",
      intentos: 2,
      desde: AHORA - PLAZO_RESERVA_SINCRONIZACION_MS - 1,
    });
    assert.equal(pendientes(a, AHORA).length, 1);
    assert.equal(reclamar(a, AHORA), 1);
    assert.deepEqual(
      { ...fila(a) },
      { sincronizacion: "sincronizando", intentosSincronizacion: 2, sincronizandoDesde: AHORA }
    );
  } finally {
    fin();
  }
});

test("reserva justo en el plazo todavía es válida: no se reclama", () => {
  const { a, cerrar: fin } = abrirDos();
  try {
    insertar(a, { sincronizacion: "sincronizando", desde: AHORA - PLAZO_RESERVA_SINCRONIZACION_MS });
    assert.equal(pendientes(a, AHORA).length, 0);
    assert.equal(reclamar(a, AHORA), 0);
  } finally {
    fin();
  }
});

test("huérfana sin hora (de antes de la columna): se recupera en el primer ciclo", () => {
  // Esquema de la versión anterior (sin sincronizandoDesde), con una jornada atascada, y después
  // la misma migración que agregarColumnasFaltantes() aplica al arrancar.
  const esquemaViejo = CREATE_TABLE_JORNADAS.replace(/,\s*(--[^\n]*\n\s*)*sincronizandoDesde INTEGER/, "");
  assert.ok(!esquemaViejo.includes("sincronizandoDesde"));
  const { a, cerrar: fin } = abrirDos(esquemaViejo);
  try {
    insertar(a, { sincronizacion: "sincronizando", intentos: 1 });
    a.exec(`ALTER TABLE jornadas ADD COLUMN sincronizandoDesde ${DEFINICION_COLUMNA_NUEVA}`);
    assert.equal(fila(a).sincronizandoDesde, null);
    assert.equal(pendientes(a, AHORA).length, 1);
    assert.equal(reclamar(a, AHORA), 1);
    assert.equal(fila(a).intentosSincronizacion, 1);
  } finally {
    fin();
  }
});

test("cierre condicional: la ejecución perdedora no pisa un 'sincronizado'", () => {
  const { a, b, cerrar: fin } = abrirDos();
  try {
    insertar(a);
    const desdeA = AHORA;
    assert.equal(reclamar(a, desdeA), 1);
    // A se cuelga más que el plazo; B la recupera y la sube entera.
    const desdeB = AHORA + PLAZO_RESERVA_SINCRONIZACION_MS + 1;
    assert.equal(reclamar(b, desdeB), 1);
    assert.equal(cerrar(b, SQL_MARCAR_SINCRONIZADO, desdeB), 1);
    // A despierta y falla, o termina: ninguno de sus cierres toca la fila.
    assert.equal(cerrar(a, SQL_MARCAR_ERROR, desdeA), 0);
    assert.equal(cerrar(a, SQL_MARCAR_PENDIENTE_SIN_CONTAR, desdeA), 0);
    assert.equal(cerrar(a, SQL_MARCAR_SINCRONIZADO, desdeA), 0);
    assert.deepEqual(
      { ...fila(a) },
      { sincronizacion: "sincronizado", intentosSincronizacion: 0, sincronizandoDesde: null }
    );
  } finally {
    fin();
  }
});

test("cierre condicional: la perdedora tampoco pisa la reserva viva de la otra", () => {
  const { a, b, cerrar: fin } = abrirDos();
  try {
    insertar(a);
    assert.equal(reclamar(a, AHORA), 1);
    const desdeB = AHORA + PLAZO_RESERVA_SINCRONIZACION_MS + 1;
    assert.equal(reclamar(b, desdeB), 1);
    assert.equal(cerrar(a, SQL_MARCAR_PENDIENTE_SIN_CONTAR, AHORA), 0);
    assert.equal(fila(a).sincronizandoDesde, desdeB);
    assert.equal(fila(a).sincronizacion, "sincronizando");
  } finally {
    fin();
  }
});

test("un fallo no suma doble intento", () => {
  const { a, b, cerrar: fin } = abrirDos();
  try {
    insertar(a, { intentos: 1 });
    assert.equal(pendientes(a, AHORA).length, 1);
    assert.equal(pendientes(b, AHORA).length, 1);
    assert.equal(reclamar(a, AHORA), 1);
    const desdeB = AHORA + 3;
    assert.equal(reclamar(b, desdeB), 0); // B la salta (continue), sin cerrar nada.
    assert.equal(cerrar(a, SQL_MARCAR_ERROR, AHORA), 1);
    // Aunque B, por un error, intentara cerrar con su propia hora, no cuenta otro intento.
    assert.equal(cerrar(b, SQL_MARCAR_ERROR, desdeB), 0);
    assert.deepEqual(
      { ...fila(a) },
      { sincronizacion: "error", intentosSincronizacion: 2, sincronizandoDesde: null }
    );
    // Y el siguiente ciclo la vuelve a ver como pendiente.
    assert.equal(pendientes(b, AHORA + 15_000).length, 1);
  } finally {
    fin();
  }
});

test("'sincronizado' nunca se reclama ni aparece como pendiente", () => {
  const { a, cerrar: fin } = abrirDos();
  try {
    insertar(a, { sincronizacion: "sincronizado" });
    assert.equal(pendientes(a, AHORA).length, 0);
    assert.equal(reclamar(a, AHORA), 0);
  } finally {
    fin();
  }
});
