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
--
-- Orden de despliegue obligatorio: esta migracion -> Dashboard (pagina /actualizar) -> app (franja
-- del aviso, por EAS Update sin bump de version).
--
-- Sin begin/commit a nivel de archivo (misma convencion que schema_v19/schema_v20/schema_v26):
-- quien aplica esto en el SQL Editor lo envuelve en su propia transaccion (ver
-- aplicar_v27_en_sql_editor.sql).
--
-- Script inverso: schema_v27_aviso_version_inverso.sql.

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
