-- spec_bloque_b_alta_asistida_enlace_unico.md (ajuste al Hallazgo #51), "Actualización 2
-- (2026-10-14)" -- bucket de Storage para el .apk estable (decisión 10 de la spec), separado de
-- schema_v21_alta_asistida_dni_atado.sql a propósito.
--
-- Estado (2026-10-16): plan Pro de la organización, confirmado por API el 2026-10-15. El límite
-- GLOBAL de tamaño de archivo de Storage (Settings → Storage del panel) NO se puede leer por API
-- -- medido: no hay ninguna tabla en el esquema `storage` con ese valor (es un ajuste de
-- plataforma, no vive en Postgres); leerlo requeriría la Management API con un Personal Access
-- Token, que esta sesión no pide ni usa. El usuario informa 200 MB como límite global en Storage
-- → Settings (2026-10-16); dato dicho por él, no medido. No se verifica por lectura: se demuestra
-- con la subida real del .apk al bucket desde el panel -- si una subida de ~87 MiB se completa,
-- el límite global ya está por encima de este bucket; si Supabase la rechaza, el límite global lo
-- sigue bloqueando aunque este bucket diga 200 MiB.
--
-- Qué hace: bucket público "builds", solo para el .apk de distribución (ruta fija
-- "builds/app-transp-latest.apk", que se sobrescribe en cada build nuevo -- la sube el usuario a
-- mano desde el panel, nunca un script con service_role). file_size_limit en 209715200 bytes
-- (200 MiB, ~2x margen sobre el último .apk real medido, 91 605 771 bytes / ~87 MiB).
-- allowed_mime_types solo el tipo de un .apk. SIN policy de SELECT (un bucket público sirve su
-- URL pública sin necesitar una policy -- una policy de SELECT acá solo serviría para LISTAR el
-- contenido del bucket vía la API, que no hace falta) y SIN policies de escritura (nadie más que
-- quien tiene acceso directo a Supabase Storage -- el panel, con la sesión del usuario -- sube
-- ahí; ni anon ni authenticated tienen ningún privilegio sobre este bucket).
--
-- El INSERT vive DENTRO del bloque `do $$ ... $$` de abajo, junto con su propia verificación --
-- no son dos sentencias separadas: la atomicidad la da el propio bloque PL/pgSQL (una excepción
-- sin capturar deshace TODO lo hecho dentro del bloque, incluido el INSERT); no se midió si la
-- herramienta que aplique este archivo además agrupa las sentencias en una transacción propia.
do $$
declare
  v_policies_antes int;
  v_policies_despues int;
  v_bucket record;
begin
  select count(*) into v_policies_antes
  from pg_policies where schemaname = 'storage' and tablename = 'objects';

  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values (
    'builds',
    'builds',
    true,
    209715200,
    array['application/vnd.android.package-archive']
  )
  on conflict (id) do update set
    public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

  select public, file_size_limit, allowed_mime_types into v_bucket
  from storage.buckets where id = 'builds';

  if not found then
    raise exception 'builds no quedó creado';
  end if;

  if v_bucket.public is not true then
    raise exception 'builds.public no es true (es %)', v_bucket.public;
  end if;

  if v_bucket.file_size_limit is distinct from 209715200 then
    raise exception 'builds.file_size_limit no es 209715200 (es %)', v_bucket.file_size_limit;
  end if;

  if v_bucket.allowed_mime_types is distinct from array['application/vnd.android.package-archive'] then
    raise exception 'builds.allowed_mime_types no es el esperado (es %)', v_bucket.allowed_mime_types;
  end if;

  -- Sin número fijo: compara el recuento ANTES vs. DESPUÉS dentro de esta misma corrida -- v22 no
  -- agrega ni quita ninguna policy de storage.objects (son las 3 de "evidencias", sin tocar).
  select count(*) into v_policies_despues
  from pg_policies where schemaname = 'storage' and tablename = 'objects';

  if v_policies_despues <> v_policies_antes then
    raise exception 'v22 cambió las policies de storage.objects: antes % después % (deberían quedar iguales)',
      v_policies_antes, v_policies_despues;
  end if;
end $$;

-- Visible por el MCP (RAISE NOTICE del bloque de arriba no se ve ahí) -- confirma el resultado
-- final: si el bloque de arriba falló, esta sentencia nunca llega a correr (ver prueba de
-- atomicidad) y storage.buckets no tiene ninguna fila "builds".
select
  b.id,
  b.public,
  b.file_size_limit,
  b.allowed_mime_types,
  (select count(*) from pg_policies where schemaname = 'storage' and tablename = 'objects')
    as policies_storage_objects
from storage.buckets b
where b.id = 'builds';


-- ============================================================
-- ROLLBACK (uso manual, NO se ejecuta junto con lo de arriba)
-- ============================================================
-- ⚠️ NO es un DELETE por SQL -- medido en solo lectura (pg_trigger sobre storage.objects y
-- storage.buckets, sin ejecutar ningún DELETE): existen "protect_objects_delete" y
-- "protect_buckets_delete" (función protect_delete()), activos en las dos tablas, y bloquean el
-- borrado directo ("usa la API de Storage" es el mensaje real de Supabase). Para deshacer este
-- archivo:
--   1) Vaciar el bucket "builds" (borrar el archivo "app-transp-latest.apk" y cualquier otro que
--      tenga) desde el panel de Supabase (Storage → builds → seleccionar → Delete) o con la API
--      de Storage (`DELETE /storage/v1/object/builds/<ruta>`, con la service_role key -- nunca
--      con un DELETE SQL directo sobre storage.objects).
--   2) Borrar el bucket "builds" ya vacío, desde el mismo panel (Storage → builds → Delete bucket)
--      o con la API de Storage (`DELETE /storage/v1/bucket/builds`).
