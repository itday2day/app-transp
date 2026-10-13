-- Migración incremental: correr DESPUÉS de schema.sql + v2 + v3 + v4 + v5, en
-- el SQL Editor. Vista de solo lectura para el Dashboard: expone TODOS los
-- pings de ubicaciones_tracking con lat/lng planos en vez del tipo geography
-- (mismo criterio que la vista ultimas_posiciones de schema_v2, que solo trae
-- la última posición por chofer — esta trae el histórico completo). El
-- filtrado por jornada y el orden por tiempo se hacen en la query desde
-- dashboard/app/api/tracking/ruta-jornada/route.ts, no acá.
--
-- ⚠️ Hallazgo #52 (schema_v20_seguridad_vistas_tracking.sql): esta vista corre con
-- security_invoker = true y sin grants a anon/authenticated. `create or replace view`
-- REEMPLAZA las opciones de la vista (reloptions) pero NO toca el ACL -- medido el 2026-10-13,
-- dentro de BEGIN…ROLLBACK, con una vista de prueba: has_table_privilege de anon/authenticated
-- para SELECT/INSERT/UPDATE/DELETE quedó en false antes Y después de un `create or replace view`
-- sin opciones; lo único que cambió fue reloptions, de {security_invoker=true} a null. Es decir,
-- volver a correr este archivo tal cual NO reabre el acceso de anon/authenticated (el revoke de
-- schema_v20 sigue vigente) -- solo pierde la segunda capa (security_invoker), que vuelve a
-- quedar en pie si se corre schema_v20 justo después.

create or replace view public.ubicaciones_tracking_planas as
select
  chofer_id,
  jornada_ids,
  ST_Y(ubicacion::geometry) as lat,
  ST_X(ubicacion::geometry) as lng,
  velocidad_kmh,
  "timestamp"
from public.ubicaciones_tracking;
