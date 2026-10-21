-- schema_v23_trigger_auth_users.sql (APLICADO el 2026-10-16 por el SQL Editor, con el registro todavía cerrado)
-- spec_migracion_2_trigger_auth_users.md (Hallazgo #51, paso 4 del Bloque B), sección
-- "Resolución de la Fase 1 (2026-10-16)".
--
-- Un único bloque `do $$ ... $$`, sin `begin`/`commit` explícitos: la atomicidad la da el propio
-- bloque PL/pgSQL (confirmado con CREATE TRIGGER/REVOKE/GRANT/DROP POLICY corriendo directos
-- dentro de un `do $$...$$`, sin necesitar `EXECUTE` -- dos pruebas de sintaxis chicas, dentro de
-- BEGIN...ROLLBACK, antes de escribir este archivo). Se penso para aplicarse con
-- `apply_migration` (nombre "trigger_auth_users"), pero se aplico por el SQL Editor, igual que
-- v22: por eso NO figura en `list_migrations` (verificado el 2026-10-21; si figuran v19, v20,
-- v21 y v24).
do $$
declare
  v_triggers_auth_users int;
  v_columnas_choferes text[];
  v_num_columnas_choferes int;
  v_update_cols_sobrantes text[];
begin
  -- (a) El trigger que faltaba (Fase 1, punto 2: 0 triggers hoy en auth.users). La función ya es
  -- SECURITY DEFINER con search_path fijo (Fase 1, punto 3) -- esto solo la enlaza. No necesita
  -- GRANT EXECUTE para nadie: un trigger se dispara por el propio mecanismo de Postgres, no por
  -- una llamada SQL explícita de quien hace el INSERT (confirmado real en la Fase 1, punto 8).
  -- "on_auth_user_created": convención habitual de Supabase para este mismo patrón.
  create trigger on_auth_user_created
    after insert on auth.users
    for each row execute function public.crear_chofer_desde_invitacion();

  -- (b) Cierre de INSERT en choferes para `authenticated` (Fase 1, punto 4: hoy hay una policy
  -- "chofer crea su propio perfil" + GRANT INSERT). Con el trigger ya puesto, nadie necesita
  -- insertar su propia fila a mano -- la crea el trigger, que corre SECURITY DEFINER y no depende
  -- de esta policy ni de ningún GRANT de authenticated/anon.
  drop policy "chofer crea su propio perfil" on public.choferes;
  revoke insert on public.choferes from authenticated;

  -- Alcance ampliado, decisión del usuario (2026-10-16), SOLO sobre choferes: ningún flujo real
  -- usa DELETE/TRUNCATE con la sesión de un chofer (Fase 1, punto 5 -- la única escritura de
  -- `authenticated` es el UPDATE de debe_cambiar_contrasena, en src/services/authService.ts) --
  -- se quitan aunque hoy ninguna policy los habilitara (RLS no cubre TRUNCATE), por higiene y
  -- para que has_table_privilege ya no los liste como posibles.
  revoke delete, truncate on public.choferes from authenticated;

  -- `anon` no necesita escribir en choferes bajo ningún escenario (ni siquiera a través de una
  -- policy -- las tres existentes comparan auth.uid(), que es NULL para anon): se le quita
  -- INSERT/UPDATE/DELETE/TRUNCATE por completo. SELECT de anon NO se toca (fuera del alcance que
  -- pidió el usuario esta ronda -- ver "Fuera de alcance" de la spec).
  revoke insert, update, delete, truncate on public.choferes from anon;

  -- (c) Cierre de UPDATE de `authenticated` salvo la única columna que la app toca con la sesión
  -- del chofer (Fase 1, punto 5). La policy "chofer actualiza su propio perfil" (auth.uid() = id)
  -- queda SIN TOCAR -- el GRANT por columna ya impide que aparezca cualquier otra columna en el
  -- SET de un UPDATE de authenticated, antes de que la policy llegue a evaluarse.
  revoke update on public.choferes from authenticated;
  grant update (debe_cambiar_contrasena) on public.choferes to authenticated;

  -- (d) El script falla solo si algo no quedó como se espera -- nada queda a medias (criterio 5
  -- de la Fase 2). Permiso EFECTIVO (has_table_privilege / has_column_privilege /
  -- has_any_column_privilege), no solo lo que dice information_schema (criterio 7).

  select count(*) into v_triggers_auth_users
  from pg_trigger t
  join pg_class c on c.oid = t.tgrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'auth' and c.relname = 'users' and not t.tgisinternal;
  if v_triggers_auth_users <> 1 then
    raise exception 'auth.users tiene % trigger(s) no internos, se esperaba exactamente 1', v_triggers_auth_users;
  end if;

  if not exists (
    select 1
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    join pg_proc p on p.oid = t.tgfoid
    where n.nspname = 'auth' and c.relname = 'users' and t.tgname = 'on_auth_user_created'
      and p.proname = 'crear_chofer_desde_invitacion' and t.tgenabled = 'O'
  ) then
    raise exception 'el trigger on_auth_user_created no quedó con el nombre/función/estado esperado';
  end if;

  if (select count(*) from pg_policies where schemaname='public' and tablename='choferes') <> 2 then
    raise exception 'choferes tiene % policies, se esperaban exactamente 2 (SELECT y UPDATE)',
      (select count(*) from pg_policies where schemaname='public' and tablename='choferes');
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='choferes' and cmd='SELECT') then
    raise exception 'falta la policy de SELECT en choferes';
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='choferes' and cmd='UPDATE') then
    raise exception 'falta la policy de UPDATE en choferes';
  end if;
  if exists (select 1 from pg_policies where schemaname='public' and tablename='choferes' and cmd='INSERT') then
    raise exception 'todavía hay una policy de INSERT en choferes';
  end if;

  -- RLS tiene que seguir activo -- sin esto, las 2 policies que quedan (SELECT/UPDATE) no
  -- protegen nada: una tabla con relrowsecurity=false ignora sus policies por completo.
  if not (select relrowsecurity from pg_class where oid = 'public.choferes'::regclass) then
    raise exception 'public.choferes perdió relrowsecurity (RLS deshabilitado)';
  end if;

  if has_table_privilege('authenticated', 'public.choferes', 'INSERT') then
    raise exception 'authenticated todavía puede hacer INSERT en choferes';
  end if;
  if has_table_privilege('authenticated', 'public.choferes', 'DELETE') then
    raise exception 'authenticated todavía puede hacer DELETE en choferes';
  end if;
  if has_table_privilege('authenticated', 'public.choferes', 'TRUNCATE') then
    raise exception 'authenticated todavía puede hacer TRUNCATE en choferes';
  end if;
  if has_any_column_privilege('authenticated', 'public.choferes', 'INSERT') then
    raise exception 'authenticated todavía tiene INSERT por columna en choferes';
  end if;
  if not has_table_privilege('authenticated', 'public.choferes', 'SELECT') then
    raise exception 'authenticated perdió el SELECT de choferes (no debía tocarse)';
  end if;

  if has_table_privilege('anon', 'public.choferes', 'INSERT') then
    raise exception 'anon todavía puede hacer INSERT en choferes';
  end if;
  if has_table_privilege('anon', 'public.choferes', 'UPDATE') then
    raise exception 'anon todavía puede hacer UPDATE en choferes';
  end if;
  if has_table_privilege('anon', 'public.choferes', 'DELETE') then
    raise exception 'anon todavía puede hacer DELETE en choferes';
  end if;
  if has_table_privilege('anon', 'public.choferes', 'TRUNCATE') then
    raise exception 'anon todavía puede hacer TRUNCATE en choferes';
  end if;
  if has_any_column_privilege('anon', 'public.choferes', 'INSERT') then
    raise exception 'anon todavía tiene INSERT por columna en choferes';
  end if;
  if has_any_column_privilege('anon', 'public.choferes', 'UPDATE') then
    raise exception 'anon todavía tiene UPDATE por columna en choferes';
  end if;

  -- Columnas REALES de choferes (pg_attribute, no una lista escrita a mano que puede quedar
  -- desactualizada si alguien agrega/saca una columna sin tocar este archivo) -- attnum > 0
  -- descarta las columnas de sistema (tableoid, cmin, ...), not attisdropped descarta las
  -- borradas (que pg_attribute conserva como "fantasma" con un nombre interno).
  select array_agg(attname order by attname), count(*)
  into v_columnas_choferes, v_num_columnas_choferes
  from pg_attribute
  where attrelid = 'public.choferes'::regclass and attnum > 0 and not attisdropped;

  if v_num_columnas_choferes <> 16 then
    raise exception 'public.choferes tiene % columnas, se esperaban exactamente 16 (Fase 1, punto 4)', v_num_columnas_choferes;
  end if;

  -- UPDATE efectivo de authenticated, columna por columna: solo debe_cambiar_contrasena. Si
  -- sobra alguna, el mensaje las lista todas (no solo la primera que encuentre).
  select array_agg(column_name order by column_name) into v_update_cols_sobrantes
  from unnest(v_columnas_choferes) as column_name
  where has_column_privilege('authenticated', 'public.choferes', column_name, 'UPDATE')
    and column_name <> 'debe_cambiar_contrasena';
  if v_update_cols_sobrantes is not null then
    raise exception 'authenticated tiene UPDATE de más en estas columnas: %', v_update_cols_sobrantes;
  end if;
  if not has_column_privilege('authenticated', 'public.choferes', 'debe_cambiar_contrasena', 'UPDATE') then
    raise exception 'authenticated perdió el UPDATE de debe_cambiar_contrasena';
  end if;

  if not has_table_privilege('service_role', 'public.choferes', 'INSERT') then
    raise exception 'service_role perdió el INSERT de choferes (no debía tocarse)';
  end if;
  if not has_table_privilege('service_role', 'public.choferes', 'UPDATE') then
    raise exception 'service_role perdió el UPDATE de choferes (no debía tocarse)';
  end if;
end $$;
