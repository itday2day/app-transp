-- aplicar_v27_en_sql_editor.sql (2026-11-04)
-- Vía aprobada por el usuario para aplicar schema_v27_aviso_version.sql a producción (proyecto
-- tgmfopfekwlucofjlssn) -- apply_migration por MCP se rechaza en este entorno (la confirmación del
-- MCP no le llega al usuario). Mismo patrón que aplicar_v26_en_sql_editor.sql.
--
-- USO: pegar este archivo ENTERO en el SQL Editor de Supabase y ejecutarlo UNA sola vez. El editor
-- solo muestra el resultado de la ÚLTIMA sentencia -- por eso la verificación va al final, después
-- del COMMIT.
--
-- Orden de despliegue obligatorio (spec_aviso_version_y_pagina_actualizar.md): esta migración ->
-- Dashboard (página /actualizar) -> app (franja del aviso).
--
-- Script inverso: schema_v27_aviso_version_inverso.sql.

begin;

-- ================================================================
-- GUARDIA -- aborta TODO si el estado de la base no es exactamente el esperado antes de migrar.
-- ================================================================
do $$
declare
  v_ultima_migracion text;
  v_ya_registrada boolean;
begin
  if to_regclass('public.app_version') is not null then
    raise exception 'GUARDIA: public.app_version ya existe -- esta migración ya se aplicó';
  end if;

  select name into v_ultima_migracion
    from supabase_migrations.schema_migrations
    order by version desc limit 1;

  if v_ultima_migracion is distinct from 'schema_v26_catalogo_por_chofer' then
    raise exception 'GUARDIA: la última migración registrada es % (esperada schema_v26_catalogo_por_chofer) -- orden inesperado, revisar a mano antes de seguir', v_ultima_migracion;
  end if;

  select exists(
    select 1 from supabase_migrations.schema_migrations
    where name = 'schema_v27_aviso_version'
  ) into v_ya_registrada;

  if v_ya_registrada then
    raise exception 'GUARDIA: ya existe una fila en supabase_migrations.schema_migrations con name = schema_v27_aviso_version';
  end if;
end $$;

-- ================================================================
-- MIGRACIÓN -- contenido IDÉNTICO a supabase\schema_v27_aviso_version.sql. Empieza con su propia
-- cabecera de comentarios, igual que el archivo original.
-- ================================================================
-- schema_v27_aviso_version.sql (2026-11-04)
-- spec_aviso_version_y_pagina_actualizar.md, Fase 2, criterios 1-3 (base de datos), con las
-- "Decisiones de César (2026-11-03)" que fija la numeración: este aviso sale como schema_v27
-- (antes de la migración grande del Bloque 1, que pasa a llamarse schema_v28) porque tiene que
-- llegar a los builds 3 y 4 (via EAS Update, sin bump de version) ANTES de cualquier build con
-- modulo nativo nuevo.
--
-- Tabla de una sola fila por plataforma: hoy solo 'android' (iOS queda fuera de alcance, no hay
-- CHECK que lo imponga -- agregar 'ios' el dia de manana es un INSERT, no una migracion nueva).
-- Lectura publica (anon + authenticated, sin nada sensible); ESCRITURA SOLO service_role (ningun
-- GRANT ni policy de INSERT/UPDATE/DELETE para los otros dos roles -- misma doble capa que el
-- resto del proyecto: RLS + GRANT de tabla).
--
-- Revisión 2026-11-04 (ajuste de César): el esquema `public` de este proyecto tiene privilegios
-- por defecto que conceden ALL (incluyendo INSERT/UPDATE/DELETE) a anon/authenticated sobre
-- CUALQUIER tabla nueva, apenas se crea -- no es algo que este CREATE TABLE pida, es el default
-- ACL del esquema (mismo tipo de trampa que ya documentó schema_v26 para EXECUTE de funciones,
-- ver aplicar_v26_en_sql_editor.sql). Con RLS activo y sin policy de escritura, esos dos roles YA
-- quedan bloqueados en la práctica (RLS deniega por defecto si ningún policy cubre el comando) --
-- el REVOKE de abajo no cierra un agujero real, es la MISMA segunda capa que ya usa el resto del
-- proyecto (ver schema_v26: `revoke insert, update, delete, truncate ... from authenticated`,
-- aunque RLS ya bloqueaba esas mismas operaciones): nunca depender de una sola capa de defensa.
-- El `grant select` de mas abajo tampoco alcanza por si solo para dejar esto en el estado
-- documentado (GRANT no resta privilegios, solo suma) -- hace falta el REVOKE ALL explicito ANTES.

create table public.app_version (
  plataforma text primary key,
  build_recomendado integer not null,
  url_descarga text not null,
  url_apk text not null,
  actualizado_at timestamptz not null default now()
);

alter table public.app_version enable row level security;

-- Segunda capa (RLS) sobre la primera (GRANT, mas abajo): sin politica de escritura para
-- anon/authenticated, INSERT/UPDATE/DELETE quedan bloqueados para esos dos roles aunque alguien
-- les concediera el privilegio de tabla por error.
create policy "lectura publica de app_version"
  on public.app_version for select
  to anon, authenticated
  using (true);

revoke all on table public.app_version from anon, authenticated;
grant select on table public.app_version to anon, authenticated;
grant all on table public.app_version to service_role;

-- Fila inicial aprobada por Cesar el 2026-11-03 (ver la seccion "Decisiones de Cesar" de la spec):
-- build_recomendado=4 es el build mas alto real hoy (confirmado contra EAS y el bucket Storage).
-- url_apk con nombre propio por build (nunca el latest.apk que se sobrescribe) para que la cache
-- de la CDN nunca sirva un .apk viejo con nombre nuevo.
insert into public.app_version (plataforma, build_recomendado, url_descarga, url_apk, actualizado_at)
values (
  'android',
  4,
  'https://app.day2day.es/actualizar',
  'https://tgmfopfekwlucofjlssn.supabase.co/storage/v1/object/public/builds/app-transp-1.0.0-build4.apk',
  now()
);

-- ================================================================
-- REGISTRO DEL HISTORIAL
-- ================================================================
insert into supabase_migrations.schema_migrations (version, name, statements)
values (to_char(now() at time zone 'utc', 'YYYYMMDDHH24MISS'), 'schema_v27_aviso_version', '{}'::text[]);

commit;

-- ================================================================
-- VERIFICACIÓN FINAL (única sentencia que el editor muestra) -- 4 comprobaciones (a-d).
-- ================================================================
select row_number() over () as n, comprobacion, esperado, obtenido, resultado
from (
  select
    'a) app_version existe con la fila inicial android/build 4' as comprobacion,
    'plataforma=android, build_recomendado=4' as esperado,
    format('plataforma=%s, build_recomendado=%s, url_apk=%s',
      (select plataforma from public.app_version where plataforma = 'android'),
      (select build_recomendado from public.app_version where plataforma = 'android'),
      (select url_apk from public.app_version where plataforma = 'android')
    ) as obtenido,
    case when exists(
      select 1 from public.app_version
      where plataforma = 'android' and build_recomendado = 4
        and url_apk = 'https://tgmfopfekwlucofjlssn.supabase.co/storage/v1/object/public/builds/app-transp-1.0.0-build4.apk'
    ) then 'OK' else 'FALLO' end as resultado

  union all

  select
    'b) RLS activo y SOLO una politica de SELECT (anon, authenticated) -- sin politica de escritura',
    'rowsecurity=true, policies=1 (cmd=SELECT, roles incluye anon y authenticated)',
    format('rowsecurity=%s, policies=%s, cmds=%s',
      (select relrowsecurity from pg_class where oid = 'public.app_version'::regclass),
      (select count(*) from pg_policies where schemaname = 'public' and tablename = 'app_version'),
      (select string_agg(distinct cmd, ',') from pg_policies where schemaname = 'public' and tablename = 'app_version')
    ),
    case when (select relrowsecurity from pg_class where oid = 'public.app_version'::regclass) = true
      and (select count(*) from pg_policies where schemaname = 'public' and tablename = 'app_version') = 1
      and (select cmd from pg_policies where schemaname = 'public' and tablename = 'app_version') = 'SELECT'
      then 'OK' else 'FALLO' end

  union all

  select
    'c) GRANT de tabla: anon/authenticated solo SELECT; sin INSERT/UPDATE/DELETE para ninguno de los dos (comprobado dos veces: role_table_grants y has_table_privilege, por si el REVOKE no alcanzó a limpiar el default ACL)',
    'anon=SELECT, authenticated=SELECT, sin escritura; has_table_privilege(INSERT/UPDATE/DELETE)=false para los dos',
    format('privilegios=%s; anon(I,U,D)=%s; authenticated(I,U,D)=%s',
      (select string_agg(distinct grantee || ':' || privilege_type, ', ' order by grantee || ':' || privilege_type)
        from information_schema.role_table_grants
        where table_schema = 'public' and table_name = 'app_version' and grantee in ('anon', 'authenticated')),
      has_table_privilege('anon', 'public.app_version', 'INSERT,UPDATE,DELETE'),
      has_table_privilege('authenticated', 'public.app_version', 'INSERT,UPDATE,DELETE')
    ),
    case when not exists (
      select 1 from information_schema.role_table_grants
      where table_schema = 'public' and table_name = 'app_version'
        and grantee in ('anon', 'authenticated')
        and privilege_type not in ('SELECT')
    )
      and has_table_privilege('anon', 'public.app_version', 'INSERT,UPDATE,DELETE') = false
      and has_table_privilege('authenticated', 'public.app_version', 'INSERT,UPDATE,DELETE') = false
    then 'OK' else 'FALLO' end

  union all

  select
    'd) supabase_migrations.schema_migrations tiene la fila name=schema_v27_aviso_version',
    '= 1 fila',
    format('filas=%s', (select count(*) from supabase_migrations.schema_migrations
      where name = 'schema_v27_aviso_version')),
    case when (select count(*) from supabase_migrations.schema_migrations
      where name = 'schema_v27_aviso_version') = 1
      then 'OK' else 'FALLO' end
) t
order by n;
