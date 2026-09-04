-- Migración incremental: correr DESPUÉS de schema.sql + schema_v2_tracking_auth.sql,
-- en el SQL Editor. Convierte combustible_inicial/combustible_final de un enum de
-- texto ("Reserva"|"1/4"|"1/2"|"3/4"|"Lleno") a porcentaje 0-100 (smallint).
-- Mapeo: Reserva->0, 1/4->25, 1/2->50, 3/4->75, Lleno->100.
--
-- Es seguro reintentar: si ya se corrió, las columnas ya son smallint y el
-- bloque de DROP CONSTRAINT dinámico no encuentra nada que borrar (no falla).

-- Borra cualquier CHECK existente sobre esas dos columnas, sea cual sea su
-- nombre real — evita depender del nombre autogenerado por Postgres.
do $$
declare
  r record;
begin
  for r in
    select distinct con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_attribute att on att.attrelid = rel.oid and att.attnum = any(con.conkey)
    where rel.relname = 'jornadas'
      and att.attname in ('combustible_inicial', 'combustible_final')
      and con.contype = 'c'
  loop
    execute format('alter table public.jornadas drop constraint %I', r.conname);
  end loop;
end $$;

-- ALTER COLUMN TYPE con un CASE que compara contra texto solo tiene sentido
-- si la columna todavía es texto — en un reintento (ya convertida a smallint)
-- ese CASE fallaría al comparar smallint con 'Reserva'. Cada bloque revisa el
-- tipo actual antes de intentarlo.
do $$
begin
  if (select data_type from information_schema.columns
      where table_schema = 'public' and table_name = 'jornadas' and column_name = 'combustible_inicial') = 'text'
  then
    alter table public.jornadas
      alter column combustible_inicial type smallint using (
        case combustible_inicial
          when 'Reserva' then 0
          when '1/4' then 25
          when '1/2' then 50
          when '3/4' then 75
          when 'Lleno' then 100
        end
      );
  end if;

  if (select data_type from information_schema.columns
      where table_schema = 'public' and table_name = 'jornadas' and column_name = 'combustible_final') = 'text'
  then
    alter table public.jornadas
      alter column combustible_final type smallint using (
        case combustible_final
          when 'Reserva' then 0
          when '1/4' then 25
          when '1/2' then 50
          when '3/4' then 75
          when 'Lleno' then 100
        end
      );
  end if;
end $$;

alter table public.jornadas
  drop constraint if exists jornadas_combustible_inicial_check;
alter table public.jornadas
  add constraint jornadas_combustible_inicial_check check (combustible_inicial between 0 and 100);

alter table public.jornadas
  drop constraint if exists jornadas_combustible_final_check;
alter table public.jornadas
  add constraint jornadas_combustible_final_check check (combustible_final between 0 and 100);
