-- spec_bloque_b_alta_asistida_enlace_unico.md (ajuste al Hallazgo #51) -- Migración 1 de este
-- ajuste, va ANTES de la Migración 2 del Bloque B (schema_v19_invitaciones_alta_choferes.sql:176
-- deja dicho que el trigger "after insert on auth.users ... crear_chofer_desde_invitacion()" se
-- crea en esa Migración 2, todavía no aplicada -- confirmado de nuevo con pg_trigger, ver Fase 3).
-- Mientras ese trigger no exista, tocar crear_chofer_desde_invitacion() acá no afecta a nadie.
--
-- Qué hace:
--   1) Columnas nuevas en invitaciones (criterio 26), todas opcionales, misma RLS (sin policies
--      para anon/authenticated -- sigue sin haber ninguna, confirmado en la Fase 1).
--   2) Función nueva obtener_datos_invitacion(token) (criterio 27): solo un token de 32 hex
--      devuelve datos; cualquier otra entrada (código de 8, formato inválido, token inexistente,
--      vencido, usado, revocado) devuelve lo mismo (cero filas).
--   3) crear_chofer_desde_invitacion() con dos agregados, sin tocar ninguna validación existente:
--      a) DNI atado (criterio 28): si la invitación trae su propio dni, exige que coincida.
--      b) Borrado de datos personales al consumirse (criterio 29, primera de las tres rutas de
--         borrado aprobadas en la decisión 9 de la spec -- revocación y vencidas van en el
--         Dashboard, no en esta migración).
--
-- ⚠️ El bucket "builds" de Storage (decisión 10 de la spec) NO va acá -- va en
-- schema_v22_bucket_builds.sql, migración SEPARADA que solo se aplica cuando el usuario confirme
-- que el proyecto ya está en el plan Pro y subió el límite global de archivo (Actualización 2 de
-- la spec, 2026-10-14): el .apk real pesa ~87 MiB, por encima del límite de 50 MB del plan Free
-- de este proyecto -- la base de datos no debe quedar bloqueada por una acción que depende del
-- usuario (subir de plan), así que esta migración (v21) no toca Storage para nada.

-- ============================================================
-- 1) INVITACIONES: columnas nuevas (criterio 26)
-- ============================================================
alter table public.invitaciones
  add column if not exists dni text,
  add column if not exists nombre text,
  add column if not exists apellidos text,
  add column if not exists telefono text,
  add column if not exists email text,
  add column if not exists fecha_nacimiento date;

-- Ajuste obligatorio de la "Actualización 2" de la spec: el trigger compara v_dni <>
-- v_invitacion.dni con comparación exacta (sin volver a normalizar del lado de la invitación) --
-- sin este CHECK, un DNI guardado en minúsculas o con espacios en `invitaciones.dni` dejaría al
-- chofer sin poder registrarse nunca (el DNI que la app manda SIEMPRE llega normalizado), y de
-- noche, sin nadie de Administración para corregirlo a mano. Dos capas: el Dashboard valida al
-- invitar (criterio 31) y la base lo garantiza acá, igual que `choferes.dni` ya tiene su propio
-- CHECK de 9 caracteres (schema_v16_check_dni_9_caracteres.sql).
alter table public.invitaciones
  add constraint invitaciones_dni_normalizado_check
  check (dni is null or (dni = upper(regexp_replace(dni, '[\s-]', '', 'g')) and length(dni) = 9));

-- Sin policies nuevas: RLS sigue activa y sin policies para anon/authenticated (confirmado en la
-- Fase 1 con pg_policies) -- las columnas nuevas heredan esa misma falta total de acceso directo.

-- ============================================================
-- 2) FUNCIÓN NUEVA: obtener_datos_invitacion (criterio 27, Fase 1 punto 2)
-- ============================================================
-- Misma normalización que validar_invitacion() (minúsculas, sin espacios ni guiones), más un
-- chequeo de FORMATO que validar_invitacion() no tiene: acá un código de 8 caracteres o cualquier
-- texto que no sean 32 hexadecimales cae en el mismo "nada" que un token inexistente -- nunca se
-- distingue por la forma de la respuesta si la invitación existe, está vencida, usada o revocada.
-- No devuelve token, código, id ni creada_por (criterio 27).
create or replace function public.obtener_datos_invitacion(p_token text)
returns table(
  dni text,
  nombre text,
  apellidos text,
  telefono text,
  email text,
  fecha_nacimiento date
)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_token text := lower(regexp_replace(coalesce(p_token, ''), '[\s-]', '', 'g'));
  v_fila public.invitaciones%rowtype;
begin
  if v_token !~ '^[0-9a-f]{32}$' then
    return;
  end if;

  select i.* into v_fila
  from public.invitaciones i
  where lower(i.token) = v_token
    and i.usada_at is null
    and i.revocada_at is null
    and i.vence_at > now()
  limit 1;

  if v_fila.id is null then
    return;
  end if;

  return query
    select v_fila.dni, v_fila.nombre, v_fila.apellidos, v_fila.telefono, v_fila.email,
           v_fila.fecha_nacimiento;
end;
$function$;

revoke execute on function public.obtener_datos_invitacion(text) from public;
grant execute on function public.obtener_datos_invitacion(text) to anon, authenticated;

-- ============================================================
-- 3) crear_chofer_desde_invitacion(): DNI atado + borrado al consumir
-- ============================================================
-- Mismo cuerpo que ya corre hoy (confirmado con pg_get_functiondef en la Fase 1), con dos
-- agregados exactos, marcados "NUEVO" abajo. El resto -- normalización, orden de validaciones,
-- mensajes de error, el INSERT en choferes -- no cambia una sola línea.
create or replace function public.crear_chofer_desde_invitacion()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_meta jsonb := new.raw_user_meta_data;
  v_invitacion_valor text := upper(regexp_replace(coalesce(v_meta->>'invitacion', ''), '[\s-]', '', 'g'));
  v_invitacion public.invitaciones%rowtype;
  v_dni text := upper(regexp_replace(coalesce(v_meta->>'dni', ''), '[\s-]', '', 'g'));
  v_nombre text := trim(coalesce(v_meta->>'nombre', ''));
  v_apellidos text := trim(coalesce(v_meta->>'apellidos', ''));
  v_fecha_nacimiento_texto text := trim(coalesce(v_meta->>'fecha_nacimiento', ''));
  v_fecha_nacimiento date;
  v_telefono text := trim(coalesce(v_meta->>'telefono', ''));
  v_constraint_violado text;
begin
  if v_invitacion_valor = '' then
    raise exception 'invitacion_invalida' using errcode = 'P0001';
  end if;

  update public.invitaciones
  set usada_at = now(), usada_por = new.id
  where (upper(token) = v_invitacion_valor or codigo = v_invitacion_valor)
    and usada_at is null
    and revocada_at is null
    and vence_at > now()
  returning * into v_invitacion;

  if v_invitacion.id is null then
    raise exception 'invitacion_invalida' using errcode = 'P0001';
  end if;

  -- NUEVO (criterio 28, ajuste del 2026-10-14): DNI atado. Si la invitación trae su propio DNI,
  -- el registro tiene que usar EXACTAMENTE ese DNI -- no alcanza con que el DNI enviado sea
  -- válido o nuevo, tiene que ser el mismo que el encargado ya cargó al invitar. Va INMEDIATAMENTE
  -- después de confirmar la invitación (orden del criterio: primero la invitación, después el
  -- resto) y ANTES del chequeo de formato/duplicado de más abajo, porque es una validación DE LA
  -- INVITACIÓN, no del dato en sí -- si no coincide, no importa si además es válido o no.
  if v_invitacion.dni is not null and v_dni <> v_invitacion.dni then
    raise exception 'dni_no_coincide' using errcode = 'P0001';
  end if;

  if length(v_dni) <> 9 then
    raise exception 'dni_invalido' using errcode = 'P0001';
  end if;

  if exists (select 1 from public.choferes c where c.dni = v_dni) then
    raise exception 'dni_duplicado' using errcode = 'P0001';
  end if;

  if v_nombre = '' or v_apellidos = '' or v_fecha_nacimiento_texto = '' then
    raise exception 'datos_incompletos' using errcode = 'P0001';
  end if;

  if v_fecha_nacimiento_texto !~ '^\d{4}-\d{2}-\d{2}$' then
    raise exception 'fecha_nacimiento_invalida' using errcode = 'P0001';
  end if;

  begin
    v_fecha_nacimiento := v_fecha_nacimiento_texto::date;
  exception when others then
    raise exception 'fecha_nacimiento_invalida' using errcode = 'P0001';
  end;

  if v_fecha_nacimiento < date '1900-01-01' then
    raise exception 'fecha_nacimiento_invalida' using errcode = 'P0001';
  end if;

  if v_fecha_nacimiento > ((now() at time zone 'Europe/Madrid')::date - interval '18 years') then
    raise exception 'edad_minima' using errcode = 'P0001';
  end if;

  if v_telefono !~ '^\+[1-9]\d{7,14}$' then
    raise exception 'telefono_invalido' using errcode = 'P0001';
  end if;

  begin
    insert into public.choferes (
      id, dni, nombre, apellidos, fecha_nacimiento, telefono,
      activo, debe_cambiar_contrasena, empresa_defecto_id, ruta_defecto_id
    ) values (
      new.id, v_dni, v_nombre, v_apellidos, v_fecha_nacimiento, v_telefono,
      true, false, v_invitacion.empresa_id, v_invitacion.ruta_id
    );
  exception when unique_violation then
    get stacked diagnostics v_constraint_violado = constraint_name;
    if v_constraint_violado = 'choferes_dni_unique' then
      raise exception 'dni_duplicado' using errcode = 'P0001';
    else
      raise;
    end if;
  end;

  -- NUEVO (criterio 29, ajuste del 2026-10-14): borrado de datos personales al consumirse. Ya
  -- viven en choferes (recién insertados arriba) -- no hace falta conservarlos en la invitación.
  -- Misma transacción que el INSERT: si algo de esta función fallara más abajo (no hay nada más
  -- abajo, pero por si se agrega algo en el futuro), esto se revierte junto con el resto.
  update public.invitaciones
  set dni = null, nombre = null, apellidos = null, telefono = null, email = null,
      fecha_nacimiento = null
  where id = v_invitacion.id;

  return new;
end;
$function$;

-- Sin EXECUTE para nadie (criterio 30) -- CREATE OR REPLACE no cambia los permisos de una
-- función existente, pero se repite explícito por si esta migración corriera contra una base
-- donde la función no existiera todavía con esos permisos ya puestos.
revoke execute on function public.crear_chofer_desde_invitacion() from public, anon, authenticated;


-- ============================================================
-- ROLLBACK (uso manual, NO se ejecuta junto con lo de arriba -- revierte todo lo de este archivo)
-- ============================================================
-- -- Vuelve crear_chofer_desde_invitacion() a su versión anterior a este ajuste (la confirmada
-- -- con pg_get_functiondef en la Fase 1, sin DNI atado ni borrado al consumir):
-- create or replace function public.crear_chofer_desde_invitacion()
--  returns trigger
--  language plpgsql
--  security definer
--  set search_path to 'public'
-- as $function$
-- declare
--   v_meta jsonb := new.raw_user_meta_data;
--   v_invitacion_valor text := upper(regexp_replace(coalesce(v_meta->>'invitacion', ''), '[\s-]', '', 'g'));
--   v_invitacion public.invitaciones%rowtype;
--   v_dni text := upper(regexp_replace(coalesce(v_meta->>'dni', ''), '[\s-]', '', 'g'));
--   v_nombre text := trim(coalesce(v_meta->>'nombre', ''));
--   v_apellidos text := trim(coalesce(v_meta->>'apellidos', ''));
--   v_fecha_nacimiento_texto text := trim(coalesce(v_meta->>'fecha_nacimiento', ''));
--   v_fecha_nacimiento date;
--   v_telefono text := trim(coalesce(v_meta->>'telefono', ''));
--   v_constraint_violado text;
-- begin
--   if v_invitacion_valor = '' then
--     raise exception 'invitacion_invalida' using errcode = 'P0001';
--   end if;
--
--   update public.invitaciones
--   set usada_at = now(), usada_por = new.id
--   where (upper(token) = v_invitacion_valor or codigo = v_invitacion_valor)
--     and usada_at is null and revocada_at is null and vence_at > now()
--   returning * into v_invitacion;
--
--   if v_invitacion.id is null then
--     raise exception 'invitacion_invalida' using errcode = 'P0001';
--   end if;
--
--   if length(v_dni) <> 9 then
--     raise exception 'dni_invalido' using errcode = 'P0001';
--   end if;
--
--   if exists (select 1 from public.choferes c where c.dni = v_dni) then
--     raise exception 'dni_duplicado' using errcode = 'P0001';
--   end if;
--
--   if v_nombre = '' or v_apellidos = '' or v_fecha_nacimiento_texto = '' then
--     raise exception 'datos_incompletos' using errcode = 'P0001';
--   end if;
--
--   if v_fecha_nacimiento_texto !~ '^\d{4}-\d{2}-\d{2}$' then
--     raise exception 'fecha_nacimiento_invalida' using errcode = 'P0001';
--   end if;
--
--   begin
--     v_fecha_nacimiento := v_fecha_nacimiento_texto::date;
--   exception when others then
--     raise exception 'fecha_nacimiento_invalida' using errcode = 'P0001';
--   end;
--
--   if v_fecha_nacimiento < date '1900-01-01' then
--     raise exception 'fecha_nacimiento_invalida' using errcode = 'P0001';
--   end if;
--
--   if v_fecha_nacimiento > ((now() at time zone 'Europe/Madrid')::date - interval '18 years') then
--     raise exception 'edad_minima' using errcode = 'P0001';
--   end if;
--
--   if v_telefono !~ '^\+[1-9]\d{7,14}$' then
--     raise exception 'telefono_invalido' using errcode = 'P0001';
--   end if;
--
--   begin
--     insert into public.choferes (
--       id, dni, nombre, apellidos, fecha_nacimiento, telefono,
--       activo, debe_cambiar_contrasena, empresa_defecto_id, ruta_defecto_id
--     ) values (
--       new.id, v_dni, v_nombre, v_apellidos, v_fecha_nacimiento, v_telefono,
--       true, false, v_invitacion.empresa_id, v_invitacion.ruta_id
--     );
--   exception when unique_violation then
--     get stacked diagnostics v_constraint_violado = constraint_name;
--     if v_constraint_violado = 'choferes_dni_unique' then
--       raise exception 'dni_duplicado' using errcode = 'P0001';
--     else
--       raise;
--     end if;
--   end;
--
--   return new;
-- end;
-- $function$;
--
-- revoke execute on function public.crear_chofer_desde_invitacion() from public, anon, authenticated;
--
-- drop function if exists public.obtener_datos_invitacion(text);
--
-- alter table public.invitaciones
--   drop constraint if exists invitaciones_dni_normalizado_check;
--
-- alter table public.invitaciones
--   drop column if exists dni,
--   drop column if exists nombre,
--   drop column if exists apellidos,
--   drop column if exists telefono,
--   drop column if exists email,
--   drop column if exists fecha_nacimiento;
