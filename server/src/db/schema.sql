-- Esquema de referencia (PostgreSQL). Adaptable a MySQL/SQLite en servidor.

CREATE TABLE choferes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  numero_empleado VARCHAR(20) UNIQUE NOT NULL,
  nombre VARCHAR(120) NOT NULL,          -- nombre y apellidos
  contrasena_hash TEXT NOT NULL,        -- bcrypt, nunca texto plano
  pais_nacimiento VARCHAR(60) NOT NULL,
  fecha_nacimiento DATE NOT NULL,
  licencia_conducir VARCHAR(30) NOT NULL,
  sexo VARCHAR(20) NOT NULL,
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE jornadas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  id_cliente UUID UNIQUE NOT NULL,      -- uuid generado en el dispositivo (idempotencia)
  chofer_id UUID NOT NULL REFERENCES choferes(id),

  empresa VARCHAR(60) NOT NULL,
  matricula VARCHAR(20) NOT NULL,
  ruta VARCHAR(120) NOT NULL,
  incidencias TEXT,

  km_inicial NUMERIC(10,1) NOT NULL,
  combustible_inicial VARCHAR(10) NOT NULL,
  foto_tacometro_inicial_url TEXT NOT NULL,
  foto_ruta_url TEXT,                   -- opcional: no es obligatoria para completar el check-in
  lat_inicial DOUBLE PRECISION NOT NULL,
  lng_inicial DOUBLE PRECISION NOT NULL,
  fecha_checkin TIMESTAMPTZ NOT NULL,

  km_final NUMERIC(10,1),
  combustible_final VARCHAR(10),
  foto_tacometro_final_url TEXT,
  lat_final DOUBLE PRECISION,
  lng_final DOUBLE PRECISION,
  fecha_checkout TIMESTAMPTZ,

  estado VARCHAR(10) NOT NULL DEFAULT 'abierta', -- abierta | cerrada
  creado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_jornadas_chofer ON jornadas (chofer_id);

-- Un chofer puede tener varios viajes abiertos en paralelo (rutas
-- concurrentes), así que ya NO hay un índice único que limite a una sola
-- jornada 'abierta' por chofer_id — antes existía, se quitó a propósito.

-- ── Dashboard web administrativo (rastreo en tiempo real) ──────────────────
-- Estas tres tablas amplían el esquema para soportar un futuro Dashboard Web.
-- Igual que el resto de este archivo, es solo referencia: el mock server
-- (server/mock/) sigue siendo el único backend que corre de verdad, y para el
-- feed en vivo usa un WebSocket (paquete `ws`) en memoria, no esta tabla.

CREATE TABLE vehiculos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  matricula VARCHAR(20) UNIQUE NOT NULL,
  empresa VARCHAR(60) NOT NULL,
  activo BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE ubicaciones (
  id BIGSERIAL PRIMARY KEY,
  jornada_id UUID NOT NULL REFERENCES jornadas(id),
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  velocidad_kmh REAL,
  registrado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Requiere la extensión PostGIS; columna generada a partir de lat/lng.
  geom GEOGRAPHY(Point, 4326) GENERATED ALWAYS AS (ST_MakePoint(lng, lat)::geography) STORED
);
CREATE INDEX idx_ubicaciones_jornada ON ubicaciones (jornada_id, registrado_en DESC);
CREATE INDEX idx_ubicaciones_geom ON ubicaciones USING GIST (geom);

CREATE TABLE incidencias (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  jornada_id UUID NOT NULL REFERENCES jornadas(id),
  tipo VARCHAR(30) NOT NULL,
  detalle TEXT,
  registrado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Normalizada (una fila por incidencia) aunque hoy la app móvil solo captura
-- 0 o 1 por jornada — lista para si algún día se admiten varias.
