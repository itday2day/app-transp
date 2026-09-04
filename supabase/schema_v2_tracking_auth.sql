-- Migración incremental: correr DESPUÉS de schema.sql, en el SQL Editor.
-- Agrega lo necesario para que la app móvil (auth real + tracking GPS) y el
-- futuro Dashboard funcionen correctamente.

-- Permite que un chofer recién registrado (ya autenticado vía Supabase Auth
-- en el mismo signUp, con "Confirm email" desactivado) inserte su propia
-- fila de perfil. La tabla original solo tenía políticas de select/update.
drop policy if exists "chofer crea su propio perfil" on public.choferes;
create policy "chofer crea su propio perfil"
  on public.choferes for insert
  with check (auth.uid() = id);

-- RPC usada por trackingService.ts: encapsula la construcción del punto
-- PostGIS server-side para no tener que serializar WKT/GeoJSON desde el
-- cliente. security invoker (default) => sigue respetando RLS de
-- ubicaciones_tracking (auth.uid() = chofer_id).
create or replace function public.insertar_ubicacion(
  p_chofer_id uuid,
  p_jornada_ids uuid[],
  p_lat double precision,
  p_lng double precision,
  p_velocidad_kmh numeric,
  p_timestamp timestamptz
) returns void
language sql
security invoker
as $$
  insert into public.ubicaciones_tracking (chofer_id, jornada_ids, ubicacion, velocidad_kmh, "timestamp")
  values (
    p_chofer_id,
    p_jornada_ids,
    ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography,
    p_velocidad_kmh,
    p_timestamp
  );
$$;

-- Restringe la subida de evidencias a la propia carpeta del chofer
-- (bucket evidencias/{choferId}/...), reemplazando la política inicial que
-- permitía a cualquier autenticado escribir en cualquier ruta del bucket.
drop policy if exists "chofer autenticado sube evidencias" on storage.objects;
drop policy if exists "chofer sube evidencias en su propia carpeta" on storage.objects;
create policy "chofer sube evidencias en su propia carpeta"
  on storage.objects for insert
  with check (
    bucket_id = 'evidencias'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Vista de solo lectura para el Dashboard: última posición conocida de cada
-- chofer, con lat/lng planos en vez del tipo geography (más simple de
-- consumir desde el cliente). Reemplaza al endpoint del mock
-- /tracking/ultimas-posiciones.
create or replace view public.ultimas_posiciones as
select distinct on (chofer_id)
  chofer_id,
  jornada_ids,
  ST_Y(ubicacion::geometry) as lat,
  ST_X(ubicacion::geometry) as lng,
  velocidad_kmh,
  "timestamp"
from public.ubicaciones_tracking
order by chofer_id, "timestamp" desc;
