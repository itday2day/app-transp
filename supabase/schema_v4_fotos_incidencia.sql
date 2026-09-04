-- Migración incremental: correr DESPUÉS de schema.sql + schema_v2 + schema_v3,
-- en el SQL Editor. Agrega el arreglo de fotos de respaldo de una incidencia
-- (capturadas en IncidenciasForm, solo durante check-out).
-- Es seguro reintentar: "add column if not exists" no falla si ya se corrió.

alter table public.jornadas
  add column if not exists fotos_incidencia text[];
