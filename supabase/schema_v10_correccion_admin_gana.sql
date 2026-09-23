-- Migración incremental: correr DESPUÉS de schema.sql + v2 a v9, en el SQL Editor. Resuelve el
-- Hallazgo #28 (spec_correccion_gana_dashboard.md, contexto_proyecto.md §4): una corrección del
-- Dashboard sobre una jornada abierta se perdía sin aviso cuando el chofer hacía el check-out. Es
-- seguro reintentar (create or replace function / drop trigger if exists).
--
-- Diseño (decidido con el usuario, no unilateral):
--   - `campos_editados_admin jsonb`: qué campos tocó la última corrección del administrador, y
--     cuándo. Lo escribe el propio trigger de abajo — nunca el Route Handler a mano — así es
--     IMPOSIBLE que quede desincronizado del cambio real: se computa en la misma transacción/
--     statement que la corrección, no en un paso aparte que se pueda olvidar.
--   - El trigger distingue una escritura del Dashboard de una subida de la app por `auth.role()`:
--     `service_role` (Dashboard, `crearClienteSupabaseAdmin()`) siempre gana y nunca se protege
--     contra sí mismo — así el administrador puede corregir el mismo campo más de una vez, o
--     deshacer una corrección anterior, sin que el propio trigger se lo impida. Cualquier otro rol
--     (`authenticated`, la sesión del chofer — lo que manda `subirJornada()`) se trata como una
--     posible subida ciega: los campos listados en `campos_editados_admin` se restauran al valor
--     que tenían antes de esta escritura.
--   - `fotos_incidencia` es la excepción: es append-only por diseño (Hallazgo #6 — las fotos que
--     agrega el administrador se suman a las del chofer, nunca las reemplazan), así que no se
--     "protege" preservando OLD (eso borraría las fotos nuevas del chofer) ni se deja pasar NEW sin
--     más (eso borraría la que agregó el administrador) — se resuelve por UNIÓN de los dos arreglos.
--   - `foto_tacometro_final_url` sí va con preservar OLD sin más: ya es de escritura única desde el
--     Hallazgo #7 (ni la app ni el Dashboard la reemplazan si ya tiene valor), así que no hay nada
--     que unir.

alter table public.jornadas
  add column if not exists campos_editados_admin jsonb not null default '{}'::jsonb;

create or replace function public.jornadas_proteger_correcciones_admin()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  campos_editables constant text[] := array[
    'empresa', 'matricula', 'ruta', 'km_inicial', 'km_final',
    'combustible_inicial', 'combustible_final', 'lat_final', 'lng_final',
    'foto_tacometro_final_url', 'tuvo_incidencia', 'tipo_incidencia', 'detalle_incidencia',
    'fecha_check_out', 'estado'
  ];
  campo text;
  overrides jsonb := '{}'::jsonb;
begin
  if auth.role() = 'service_role' then
    -- Escritura del Dashboard: registra qué campos tocó ESTA corrección (para el badge del
    -- Dashboard y para que la app sepa qué bajar) y nunca se protege a sí misma.
    foreach campo in array campos_editables loop
      if (to_jsonb(NEW) -> campo) is distinct from (to_jsonb(OLD) -> campo) then
        NEW.campos_editados_admin :=
          coalesce(NEW.campos_editados_admin, OLD.campos_editados_admin, '{}'::jsonb)
          || jsonb_build_object(campo, to_jsonb(now()));
      end if;
    end loop;
    if NEW.fotos_incidencia is distinct from OLD.fotos_incidencia then
      NEW.campos_editados_admin :=
        coalesce(NEW.campos_editados_admin, OLD.campos_editados_admin, '{}'::jsonb)
        || jsonb_build_object('fotos_incidencia', to_jsonb(now()));
    end if;
  else
    -- Escritura de la app (subida de syncService.ts, con la sesión propia del chofer): protege
    -- cada campo que ya figura en campos_editados_admin, restaurando el valor que tenía antes de
    -- este intento de pisarlo. jsonb_populate_record reconstruye NEW con esos campos forzados a
    -- OLD y el resto (lo que la app sí puede escribir sin restricción) intacto.
    if OLD.campos_editados_admin is not null and OLD.campos_editados_admin <> '{}'::jsonb then
      foreach campo in array campos_editables loop
        if OLD.campos_editados_admin ? campo then
          overrides := overrides || jsonb_build_object(campo, to_jsonb(OLD) -> campo);
        end if;
      end loop;
      if overrides <> '{}'::jsonb then
        NEW := jsonb_populate_record(NEW, overrides);
      end if;

      if OLD.campos_editados_admin ? 'fotos_incidencia' then
        NEW.fotos_incidencia := (
          select array_agg(distinct foto)
          from unnest(
            coalesce(OLD.fotos_incidencia, array[]::text[])
              || coalesce(NEW.fotos_incidencia, array[]::text[])
          ) as foto
        );
      end if;
    end if;
  end if;
  return NEW;
end;
$$;

drop trigger if exists jornadas_proteger_correcciones_admin_trigger on public.jornadas;
create trigger jornadas_proteger_correcciones_admin_trigger
  before update on public.jornadas
  for each row
  execute function public.jornadas_proteger_correcciones_admin();
