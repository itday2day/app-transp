-- schema_v24_obtener_datos_por_codigo.sql (APLICADO, 2026-10-20 (migracion 20261020132711,
-- nombre obtener_datos_por_codigo))
-- spec_precarga_con_codigo_8_caracteres.md, Fase 2, Paso 1 (criterios 1 a 4). Nace de que el
-- codigo de respaldo (8 caracteres) hoy NO precarga nada -- obtener_datos_invitacion(p_token
-- text) solo acepta el token de 32 hex (confirmado contra la base real en la Fase 1 de esa spec:
-- pg_get_functiondef mostraba `if v_token !~ '^[0-9a-f]{32}$' then return; end if;` sin ninguna
-- rama para el codigo).
--
-- Ensayado dentro de BEGIN...ROLLBACK antes de aplicarse (no se afirma nada que no se haya medido
-- asi): token valido, codigo en mayusculas, codigo en minusculas con guion ("abcd-2345"), codigo
-- inexistente, invitacion vencida, usada, revocada, valor vacio/NULL, e invitacion abierta -- los
-- 9 casos de la Fase 2, criterio 4 de la spec. Probado tambien por HTTP real con la clave anon
-- (Paso 2, criterio 4 de la spec): token, codigo en mayusculas, codigo en minusculas con guion,
-- codigo inexistente, vencida, usada, revocada e invitacion abierta -- 8 de los 9 casos, todos
-- con el resultado esperado; valor vacio y NULL solo se probaron en el ensayo con
-- BEGIN...ROLLBACK, no por HTTP (un body HTTP sin p_token o con p_token:"" no se repitio ahi).
--
-- Mismo nombre y firma que antes (CREATE OR REPLACE, no se puede cambiar el RETURNS TABLE sin
-- romper a quien ya lo llama) -- la app y la pagina de enlace no cambian nada de su lado.
create or replace function public.obtener_datos_invitacion(p_token text)
returns table(dni text, nombre text, apellidos text, telefono text, email text, fecha_nacimiento date)
language plpgsql
security definer
set search_path = public
as $$
declare
  -- Mismo criterio de limpieza que validar_invitacion() (schema.sql): quita espacios y guiones
  -- antes de decidir nada -- el codigo de respaldo se suele dictar o copiar con un guion de
  -- separacion visual ("ABCD-2345").
  v_limpio text := regexp_replace(coalesce(p_token, ''), '[\s-]', '', 'g');
  v_token text := lower(v_limpio);
  v_codigo text := upper(v_limpio);
  v_fila public.invitaciones%rowtype;
begin
  -- Un valor nunca puede cumplir las dos formas a la vez (32 caracteres contra exactamente 8),
  -- asi que el orden if/elsif no es ambiguo -- se prueba primero como token (mismo patron exacto
  -- que ya usaba esta funcion), despues como codigo (alfabeto de 32 simbolos de
  -- generar_codigo_invitacion(), medido en la Fase 1 de spec_ajustes_pantalla_registro_limites_campos.md).
  -- Cualquier otro valor (vacio, NULL, mal formado) cae al `return` de abajo sin tocar la tabla.
  if v_token ~ '^[0-9a-f]{32}$' then
    select i.* into v_fila
    from public.invitaciones i
    where lower(i.token) = v_token
      and i.usada_at is null
      and i.revocada_at is null
      and i.vence_at > now()
    limit 1;
  elsif v_codigo ~ '^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$' then
    select i.* into v_fila
    from public.invitaciones i
    where i.codigo = v_codigo
      and i.usada_at is null
      and i.revocada_at is null
      and i.vence_at > now()
    limit 1;
  else
    return;
  end if;

  -- Misma forma de respuesta ante CUALQUIER fallo (no existe, vencida, usada, revocada, o aqui
  -- arriba, mal formada): cero filas, nunca un mensaje distinto -- igual que hoy.
  if v_fila.id is null then
    return;
  end if;

  return query
    select v_fila.dni, v_fila.nombre, v_fila.apellidos, v_fila.telefono, v_fila.email,
           v_fila.fecha_nacimiento;
end;
$$;

-- Los GRANT no cambian -- CREATE OR REPLACE FUNCTION conserva los privilegios ya otorgados sobre
-- el mismo nombre+firma (confirmado contra la base real antes de escribir esto:
-- information_schema.routine_privileges ya tiene EXECUTE para anon y authenticated). No se repite
-- ningun GRANT/REVOKE aca a proposito -- repetirlos sin necesidad no es lo mismo que "no tocarlos".
-- crear_chofer_desde_invitacion() no se toca en absoluto, ni se le otorga EXECUTE a nadie.

-- ============================================================
-- ROLLBACK -- para volver exactamente al cuerpo de ANTES de esta migracion, descomentar y
-- correr el bloque de abajo completo. Capturado con pg_get_functiondef('public.
-- obtener_datos_invitacion(text)'::regprocedure) contra la base real el 2026-10-20, antes de
-- aplicar este archivo -- no reconstruido de memoria.
-- ============================================================
-- create or replace function public.obtener_datos_invitacion(p_token text)
--  returns table(dni text, nombre text, apellidos text, telefono text, email text, fecha_nacimiento date)
--  language plpgsql
--  security definer
--  set search_path to 'public'
-- as $function$
-- declare
--   v_token text := lower(regexp_replace(coalesce(p_token, ''), '[\s-]', '', 'g'));
--   v_fila public.invitaciones%rowtype;
-- begin
--   if v_token !~ '^[0-9a-f]{32}$' then
--     return;
--   end if;
--
--   select i.* into v_fila
--   from public.invitaciones i
--   where lower(i.token) = v_token
--     and i.usada_at is null
--     and i.revocada_at is null
--     and i.vence_at > now()
--   limit 1;
--
--   if v_fila.id is null then
--     return;
--   end if;
--
--   return query
--     select v_fila.dni, v_fila.nombre, v_fila.apellidos, v_fila.telefono, v_fila.email,
--            v_fila.fecha_nacimiento;
-- end;
-- $function$
