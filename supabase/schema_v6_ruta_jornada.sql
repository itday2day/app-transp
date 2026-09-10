-- Migración incremental: correr DESPUÉS de schema.sql + v2 + v3 + v4 + v5, en
-- el SQL Editor. Vista de solo lectura para el Dashboard: expone TODOS los
-- pings de ubicaciones_tracking con lat/lng planos en vez del tipo geography
-- (mismo criterio que la vista ultimas_posiciones de schema_v2, que solo trae
-- la última posición por chofer — esta trae el histórico completo). El
-- filtrado por jornada y el orden por tiempo se hacen en la query desde
-- dashboard/app/api/tracking/ruta-jornada/route.ts, no acá.

create or replace view public.ubicaciones_tracking_planas as
select
  chofer_id,
  jornada_ids,
  ST_Y(ubicacion::geometry) as lat,
  ST_X(ubicacion::geometry) as lng,
  velocidad_kmh,
  "timestamp"
from public.ubicaciones_tracking;
