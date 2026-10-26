-- schema_v26_catalogo_por_chofer_inverso.sql (BORRADOR, 2026-10-25 — NO APLICADO)
-- Deshace exactamente lo que hace schema_v26_catalogo_por_chofer.sql, devolviendo el estado al
-- medido antes de aplicarla: políticas "cualquier chofer autenticado" en empresas/rutas, los
-- privilegios de tabla anchos que tenían anon/authenticated antes (confirmados el 2026-10-25:
-- DELETE/INSERT/REFERENCES/SELECT/TRIGGER/TRUNCATE/UPDATE los dos), crear_chofer_desde_invitacion()
-- sin los vínculos de invitación, y ninguna de las tablas/columnas/funciones nuevas.
--
-- Qué SÍ borra (a diferencia de schema_v23_trigger_auth_users_inverso.sql, que nunca borra filas
-- de choferes/auth.users): chofer_empresas y chofer_rutas son tablas NUEVAS de esta migración, así
-- que no hay "dato previo" que preservar en ellas -- se van enteras con el DROP TABLE de más abajo.
-- Por seguridad, el bloque de guardia de abajo RECHAZA aplicar este inverso si esas tablas tienen
-- más filas que las del backfill esperado (origen='admin', todas hacia JOPRIMSA) o si hay empresas
-- u rutas nacidas pendientes de revisión (pendiente_revision = true, es decir ya hubo actividad
-- real del trigger o de un alta desde la invitación) -- en ese caso hay que decidir a mano qué
-- hacer con esos datos antes de deshacer la estructura.
--
-- Qué NO deshace: ninguna jornada, ningún chofer ni ninguna invitación se borra -- solo estructura,
-- permisos y las dos tablas de vínculo nuevas (bajo la guardia de arriba).
do $$
begin
  if exists (
    select 1 from public.chofer_empresas where origen <> 'admin'
  ) or exists (
    select 1 from public.chofer_rutas
  ) or exists (
    select 1 from public.empresas where pendiente_revision
  ) or exists (
    select 1 from public.rutas where pendiente_revision
  ) then
    raise exception 'schema_v26_inverso: hay datos reales mas alla del backfill (vinculos no-admin, rutas, o pendientes de revision) -- decidir a mano antes de deshacer la estructura';
  end if;
end $$;

-- ============================================================
-- Renombrar y fusionar (criterio 9)
-- ============================================================
drop function if exists public.fusionar_empresas(uuid, uuid);
drop function if exists public.fusionar_rutas(uuid, uuid);
drop function if exists public.renombrar_ruta(uuid, text);
drop function if exists public.renombrar_empresa(uuid, text);

-- ============================================================
-- Invitaciones (criterio 8) — vuelve a la definición ANTERIOR a esta migración, literal
-- (verificado el 2026-10-26: cuerpo byte a byte igual al de producción, md5(pg_get_functiondef)
-- = 43e5275cf682d9896d051352b2b08c05 -- ver specs\crear_chofer_desde_invitacion_produccion.sql;
-- la versión anterior de este archivo decía "literal" pero le faltaban los dos bloques de
-- comentarios "NUEVO (criterio 28...)" y "NUEVO (criterio 29...)" que sí tiene producción -- la
-- lógica era idéntica, pero md5 compara texto, no comportamiento).
-- ============================================================
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

-- ============================================================
-- Trigger de alta desde la jornada (criterios 6 y 7)
-- ============================================================
drop trigger if exists jornadas_alta_catalogo_desde_chofer_trigger on public.jornadas;
drop function if exists public.jornadas_alta_catalogo_desde_chofer();

-- ============================================================
-- Seguridad: RLS y permisos (criterio 4) — vuelve a "cualquier chofer autenticado lee todo".
-- ============================================================
drop policy if exists "chofer lee sus empresas vinculadas" on public.empresas;
drop policy if exists "chofer lee sus rutas vinculadas" on public.rutas;

create policy "choferes leen el catalogo de empresas"
  on public.empresas for select
  to authenticated
  using (true);

create policy "choferes leen el catalogo de rutas"
  on public.rutas for select
  to authenticated
  using (true);

-- Privilegios de tabla: vuelven exactamente a lo medido el 2026-10-25 antes de esta migración
-- (anon y authenticated con DELETE/INSERT/REFERENCES/SELECT/TRIGGER/TRUNCATE/UPDATE los dos).
grant delete, insert, references, select, trigger, truncate, update
  on table public.empresas, public.rutas
  to anon, authenticated;

-- ============================================================
-- Clave normalizada y columnas nuevas (criterio 3)
-- ============================================================
drop index if exists public.rutas_empresa_clave_normalizada_unique;
drop index if exists public.empresas_clave_normalizada_unique;

alter table public.rutas drop column if exists clave_normalizada;
alter table public.empresas drop column if exists clave_normalizada;

-- f_unaccent/unaccent NO se tocan por defecto (podrían estar en uso por otra cosa para cuando se
-- corra este inverso); si de verdad hace falta quitarlos, descomentar a mano:
-- drop function if exists extensions.f_unaccent(text);
-- drop extension if exists unaccent;

alter table public.rutas
  drop column if exists pendiente_revision,
  drop column if exists creada_por_chofer_id;

alter table public.empresas
  drop column if exists pendiente_revision,
  drop column if exists creada_por_chofer_id;

-- ============================================================
-- chofer_empresas / chofer_rutas (criterios 1 y 2) — se van enteras (ver la guardia del comienzo).
-- ============================================================
drop table if exists public.chofer_rutas;
drop table if exists public.chofer_empresas;

alter table public.rutas drop constraint if exists rutas_id_empresa_id_unique;
