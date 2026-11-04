-- schema_v27_aviso_version_inverso.sql (BORRADOR, 2026-11-04 — NO APLICADO)
-- Deshace exactamente lo que hace schema_v27_aviso_version.sql: borra la tabla app_version entera
-- (policy, GRANTs y fila incluidos -- todo cae con el DROP TABLE) y quita su registro de
-- supabase_migrations.schema_migrations.
--
-- Qué NO deshace: nada más -- esta migración no tocó ninguna otra tabla, columna ni función.
--
-- Qué SÍ borra: la fila de configuración de app_version (no es dato de un chofer/jornada real, es
-- config operativa -- perderla solo significa que hay que volver a insertarla si se reaplica la
-- migración). Por las dudas, la guardia de abajo para si alguien cambió `url_apk`/
-- `build_recomendado` a mano después de aplicar (más de 1 fila, o la fila no es exactamente la
-- fila inicial aprobada) -- en ese caso hay que revisar a mano antes de deshacer.

begin;

do $$
declare
  v_filas integer;
  v_coincide boolean;
begin
  if to_regclass('public.app_version') is null then
    raise exception 'schema_v27_inverso: public.app_version no existe -- nada que deshacer';
  end if;

  select count(*) into v_filas from public.app_version;

  select exists(
    select 1 from public.app_version
    where plataforma = 'android'
      and build_recomendado = 4
      and url_descarga = 'https://app.day2day.es/actualizar'
      and url_apk = 'https://tgmfopfekwlucofjlssn.supabase.co/storage/v1/object/public/builds/app-transp-1.0.0-build4.apk'
  ) into v_coincide;

  if v_filas <> 1 or not v_coincide then
    raise exception 'schema_v27_inverso: app_version tiene % fila(s) y no coincide exactamente con la fila inicial aprobada -- revisar a mano antes de deshacer (alguien pudo haber publicado un build nuevo)', v_filas;
  end if;
end $$;

drop table public.app_version;

delete from supabase_migrations.schema_migrations where name = 'schema_v27_aviso_version';

commit;

-- Verificación final (única sentencia que el editor muestra):
select
  (to_regclass('public.app_version') is null) as tabla_borrada,
  not exists(
    select 1 from supabase_migrations.schema_migrations where name = 'schema_v27_aviso_version'
  ) as registro_borrado;
