-- Migración incremental: correr DESPUÉS de schema.sql + v2 a v12, en el SQL Editor. Resuelve
-- spec_rutas_asignadas_admin.md: Administración puede cargar una jornada desde el Dashboard (ruta
-- planificada a futuro, o entrega ya hecha que se avisa tarde) sin pasar por el check-in del
-- chofer en el celular.
--
-- Una jornada creada así no tiene foto real de tacómetro ni GPS real -- de ahí que las tres
-- columnas pasen a nullable. No se inventa un tercer valor de `estado`: se distingue con una
-- columna booleana nueva, mismo patrón de auditoría que fue_editado/editado_por del Hallazgo #28.

alter table public.jornadas
  alter column foto_tacometro_inicial_url drop not null,
  alter column lat_inicial drop not null,
  alter column lng_inicial drop not null,
  add column if not exists creada_por_admin boolean not null default false,
  add column if not exists creada_por text;
