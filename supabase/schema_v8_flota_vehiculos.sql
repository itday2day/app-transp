-- Migración incremental: correr DESPUÉS de schema.sql + v2 a v7, en el SQL Editor. Tabla de
-- vehículos de la flota (spec_flota_vehiculos.md, contexto_proyecto.md §4). Es seguro reintentar.
--
-- Primera etapa: solo la tabla y su pantalla en el Dashboard. jornadas.matricula sigue siendo
-- texto suelto — enlazar la jornada a un vehiculo_id es una segunda etapa, deliberadamente fuera
-- de esta migración.

create table if not exists public.vehiculos (
  id uuid primary key default gen_random_uuid(),
  matricula text not null,
  tipo_propiedad text not null check (tipo_propiedad in ('propio', 'alquilado', 'autonomo')),
  capacidad_tanque_litros numeric check (capacidad_tanque_litros > 0),
  marca text,
  modelo text,
  anio smallint check (anio between 1970 and 2100),
  estado text not null default 'activo' check (estado in ('activo', 'baja')),
  created_at timestamptz not null default now()
);

-- Único sobre la matrícula NORMALIZADA (mayúsculas, sin caracteres no alfanuméricos) — no sobre
-- la columna cruda: "1234 ABC", "1234-abc" y "1234ABC" son el mismo camión, y el segundo intento
-- se rechaza. Vale también para los vehículos de baja (por eso NO lleva `where estado = 'activo'`)
-- — permitir el duplicado "porque uno está de baja" reintroduce el problema que este índice viene
-- a resolver; un vehículo de baja que vuelve a aparecer se REACTIVA (POST /api/vehiculos/editar),
-- nunca se duplica.
create unique index if not exists vehiculos_matricula_normalizada
  on public.vehiculos (upper(regexp_replace(matricula, '[^a-zA-Z0-9]', '', 'g')));

-- Sin RLS: se administra exclusivamente desde el Dashboard con la service_role key (Route
-- Handlers bajo app/api/vehiculos/), igual que `admins` (schema_v7_admins.sql) — la app móvil no
-- toca esta tabla en esta etapa.
