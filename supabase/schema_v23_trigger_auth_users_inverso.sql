-- schema_v23_trigger_auth_users_inverso.sql (BORRADOR, 2026-10-16 — NO APLICADO)
-- Deshace exactamente lo que hace schema_v23_trigger_auth_users.sql, devolviendo el estado al
-- medido en la Fase 1 (puntos 2, 3 y 4 de spec_migracion_2_trigger_auth_users.md): 0 triggers en
-- auth.users, 3 policies en choferes (SELECT/INSERT/UPDATE), y los privilegios de tabla
-- originales para anon/authenticated (INSERT, UPDATE, DELETE, TRUNCATE los cuatro, además de
-- SELECT/REFERENCES/TRIGGER que v23 nunca toca).
--
-- Uso manual (no se aplica junto con v23): o bien ALTER TABLE auth.users DISABLE TRIGGER
-- on_auth_user_created; para solo pausarlo sin deshacer las policies/privilegios, o bien este
-- archivo completo para volver al estado anterior a v23 en todo.
--
-- Qué NO deshace: cualquier chofer/usuario ya creado por el trigger mientras estuvo activo sigue
-- existiendo -- esto no borra filas de auth.users ni de choferes, solo revierte la
-- estructura/permisos. Tampoco toca disable_signup del panel (paso aparte, manual).
do $$
declare
  v_columnas_choferes text[];
  v_update_cols_faltantes text[];
begin
  -- Vuelve a abrir INSERT para authenticated y anon, con la policy que existía antes de v23.
  create policy "chofer crea su propio perfil"
    on public.choferes for insert
    with check (auth.uid() = id);
  grant insert on public.choferes to authenticated;
  grant insert on public.choferes to anon;

  -- Vuelve a dar DELETE/TRUNCATE a authenticated (los tenía antes de v23, aunque RLS los dejara
  -- inertes en la práctica).
  grant delete, truncate on public.choferes to authenticated;

  -- Vuelve a dar UPDATE/DELETE/TRUNCATE de tabla completa a anon.
  grant update, delete, truncate on public.choferes to anon;

  -- Vuelve el UPDATE de authenticated a TODAS las columnas (no solo debe_cambiar_contrasena) --
  -- el estado anterior a v23 no tenía ninguna restricción por columna.
  revoke update on public.choferes from authenticated;
  grant update on public.choferes to authenticated;

  -- El inverso también falla solo si no devolvió el estado original -- mismo criterio que v23
  -- (nada queda a medias), medido con permiso EFECTIVO, no information_schema.
  if (select count(*) from pg_policies where schemaname='public' and tablename='choferes') <> 3 then
    raise exception 'choferes tiene % policies, se esperaban exactamente 3 (SELECT, INSERT, UPDATE)',
      (select count(*) from pg_policies where schemaname='public' and tablename='choferes');
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='choferes' and cmd='SELECT') then
    raise exception 'falta la policy de SELECT en choferes';
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='choferes' and cmd='INSERT') then
    raise exception 'falta la policy de INSERT en choferes (no quedó restaurada)';
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='choferes' and cmd='UPDATE') then
    raise exception 'falta la policy de UPDATE en choferes';
  end if;

  if not has_table_privilege('anon', 'public.choferes', 'INSERT') then
    raise exception 'anon no recuperó el INSERT de choferes';
  end if;
  if not has_table_privilege('anon', 'public.choferes', 'UPDATE') then
    raise exception 'anon no recuperó el UPDATE de choferes';
  end if;
  if not has_table_privilege('anon', 'public.choferes', 'DELETE') then
    raise exception 'anon no recuperó el DELETE de choferes';
  end if;
  if not has_table_privilege('anon', 'public.choferes', 'TRUNCATE') then
    raise exception 'anon no recuperó el TRUNCATE de choferes';
  end if;

  if not has_table_privilege('authenticated', 'public.choferes', 'INSERT') then
    raise exception 'authenticated no recuperó el INSERT de choferes';
  end if;
  if not has_table_privilege('authenticated', 'public.choferes', 'UPDATE') then
    raise exception 'authenticated no recuperó el UPDATE de choferes';
  end if;
  if not has_table_privilege('authenticated', 'public.choferes', 'DELETE') then
    raise exception 'authenticated no recuperó el DELETE de choferes';
  end if;
  if not has_table_privilege('authenticated', 'public.choferes', 'TRUNCATE') then
    raise exception 'authenticated no recuperó el TRUNCATE de choferes';
  end if;

  -- UPDATE efectivo de authenticated en las 16 columnas (mismo origen de columnas, pg_attribute,
  -- que usa schema_v23_trigger_auth_users.sql -- no una lista escrita a mano aparte).
  select array_agg(attname order by attname) into v_columnas_choferes
  from pg_attribute
  where attrelid = 'public.choferes'::regclass and attnum > 0 and not attisdropped;

  select array_agg(column_name order by column_name) into v_update_cols_faltantes
  from unnest(v_columnas_choferes) as column_name
  where not has_column_privilege('authenticated', 'public.choferes', column_name, 'UPDATE');

  if v_update_cols_faltantes is not null then
    raise exception 'authenticated no recuperó el UPDATE en estas columnas: %', v_update_cols_faltantes;
  end if;
end $$;

-- El trigger se quita aparte (no en el mismo bloque): un DROP TRIGGER definitivo, o la versión
-- reversible con ALTER TABLE ... DISABLE TRIGGER si solo se lo quiere pausar sin perder la
-- definición.
-- drop trigger on_auth_user_created on auth.users;
-- alter table auth.users disable trigger on_auth_user_created;
