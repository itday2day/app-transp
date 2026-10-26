-- aplicar_v26_en_sql_editor.sql (2026-10-26)
-- Vía aprobada por el usuario para aplicar schema_v26_catalogo_por_chofer.sql a producción
-- (proyecto tgmfopfekwlucofjlssn), después de que apply_migration por MCP se rechazara (la
-- confirmación del MCP de Supabase no le llegaba al usuario).
--
-- USO: pegar este archivo ENTERO en el SQL Editor de Supabase y ejecutarlo UNA sola vez. El
-- editor solo muestra el resultado de la ÚLTIMA sentencia -- por eso el SELECT final (después del
-- COMMIT) es el que trae las 8 comprobaciones (a-h) en una sola tabla.
--
-- Al pegar en el editor, los saltos de línea de este archivo (LF) pasan a CRLF -- por eso la
-- comprobación (f) compara el cuerpo de crear_chofer_desde_invitacion() quitando chr(13) de los
-- dos lados antes de comparar, y además reporta cuántos chr(13) tiene la definición ya guardada
-- (para confirmar que el paste efectivamente los introdujo, sin que eso invalide la comparación).
--
-- El editor puede mostrar un aviso de "operación destructiva" por los DROP POLICY/REVOKE que trae
-- la migración (sección 3, más abajo): es esperado, son parte de la migración ya aprobada.
--
-- Script inverso de esta migración: schema_v26_catalogo_por_chofer_inverso.sql.

begin;

-- ================================================================
-- GUARDIA -- aborta TODO (ningún DDL/DML de abajo corre) si el estado de la base no es
-- exactamente el esperado antes de migrar.
-- ================================================================
do $$
declare
  v_choferes integer;
  v_jornadas integer;
  v_empresas integer;
  v_nombre_empresa text;
  v_rutas integer;
  v_hash text;
  v_ya_registrada boolean;
begin
  select count(*) into v_choferes from public.choferes;
  select count(*) into v_jornadas from public.jornadas;
  select count(*) into v_empresas from public.empresas;
  select nombre into v_nombre_empresa from public.empresas limit 1;
  select count(*) into v_rutas from public.rutas;
  select md5(pg_get_functiondef('public.crear_chofer_desde_invitacion()'::regprocedure)) into v_hash;
  select exists(
    select 1 from supabase_migrations.schema_migrations
    where name = 'schema_v26_catalogo_por_chofer'
  ) into v_ya_registrada;

  if v_choferes <> 4 then
    raise exception 'GUARDIA: choferes = % (esperado 4)', v_choferes;
  end if;

  if v_jornadas <> 0 then
    raise exception 'GUARDIA: jornadas = % (esperado 0)', v_jornadas;
  end if;

  if v_empresas <> 1 or v_nombre_empresa is distinct from 'JOPRIMSA' then
    raise exception 'GUARDIA: empresas = % (esperado 1), nombre = % (esperado JOPRIMSA)',
      v_empresas, v_nombre_empresa;
  end if;

  if v_rutas <> 0 then
    raise exception 'GUARDIA: rutas = % (esperado 0)', v_rutas;
  end if;

  if to_regclass('public.chofer_empresas') is not null then
    raise exception 'GUARDIA: public.chofer_empresas ya existe -- esta migración ya se aplicó';
  end if;

  if to_regclass('public.chofer_rutas') is not null then
    raise exception 'GUARDIA: public.chofer_rutas ya existe -- esta migración ya se aplicó';
  end if;

  if v_hash is distinct from '43e5275cf682d9896d051352b2b08c05' then
    raise exception 'GUARDIA: md5(pg_get_functiondef(crear_chofer_desde_invitacion)) = % (esperado 43e5275cf682d9896d051352b2b08c05)',
      v_hash;
  end if;

  if v_ya_registrada then
    raise exception 'GUARDIA: ya existe una fila en supabase_migrations.schema_migrations con name = schema_v26_catalogo_por_chofer';
  end if;
end $$;

-- ================================================================
-- MIGRACIÓN -- contenido IDÉNTICO a supabase\schema_v26_catalogo_por_chofer.sql (verificado con
-- diff/md5, ver el reporte de esta tarea). Empieza con su propia cabecera de comentarios, igual
-- que el archivo original.
-- ================================================================
-- schema_v26_catalogo_por_chofer.sql (2026-10-25)
-- spec_catalogo_por_chofer.md, Fase 2, criterios 1 a 9 (base de datos), con las decisiones del
-- usuario del 2026-10-25 que anulan el texto de la spec donde choque (ver specs\diag_catalogo_
-- por_chofer.md y specs\respuesta_etapa1_catalogo_por_chofer.md para el detalle de cada una):
--
--   1) Invariante (criterio 2): SIN funcion unica de escritura. Claves foraneas compuestas:
--      UNIQUE(id, empresa_id) en rutas; chofer_rutas(chofer_id, ruta_id, empresa_id) con
--      FK (chofer_id, empresa_id) -> chofer_empresas ON DELETE CASCADE y
--      FK (ruta_id, empresa_id) -> rutas(id, empresa_id). service_role conserva todo.
--   2) Clave normalizada (criterio 3): columna GENERATED ALWAYS AS (...) STORED con un wrapper
--      IMMUTABLE sobre unaccent, extension en el esquema "extensions". Se conservan los indices
--      lower(nombre) y los CHECK actuales -- nada de esto toca dashboard/lib/catalogo.ts.
--   3) Seguridad (criterio 4): REVOKE ALL ... FROM anon y REVOKE INSERT, UPDATE, DELETE,
--      TRUNCATE ... FROM authenticated sobre empresas, rutas, chofer_empresas y chofer_rutas
--      (authenticated conserva SELECT, REFERENCES y TRIGGER -- el mismo patron ya usado en
--      choferes). jornadas queda FUERA (higiene de permisos aparte, no tocada aqui).
--   4) Backfill (criterio 5, aclaracion del usuario que sustituye A1): TODOS los choferes que
--      existan al aplicar esta migracion quedan vinculados a JOPRIMSA con origen='admin'. No se
--      siembra chofer_rutas (la ruta de prueba "NUEVA" ya fue borrada antes de migrar).
--   5) Alta desde la jornada (criterios 6 y 7): trigger AFTER INSERT (nunca AFTER UPDATE -- ver
--      el comentario dentro de la funcion sobre por que) con ON CONFLICT DO NOTHING apoyado en el
--      indice unico de la clave normalizada, y todo el cuerpo envuelto en EXCEPTION WHEN OTHERS
--      para que un error aqui jamas impida guardar la jornada.
--
-- Orden de despliegue obligatorio: esta migracion -> Dashboard (etapas siguientes, no incluidas
-- aqui: pagina /empresas, menu "Mas", dialogo de chofer) -> app. El administrador tiene que poder
-- asignar empresas/rutas ANTES de que los choferes reciban la app con las politicas nuevas.
--
-- Sin begin/commit a nivel de archivo (misma convencion que schema_v19/schema_v20): apply_migration
-- envuelve todo el archivo en su propia transaccion implicita.
--
-- Script inverso: schema_v26_catalogo_por_chofer_inverso.sql.

-- ============================================================
-- SECCIÓN 1 — chofer_empresas / chofer_rutas (criterios 1 y 2)
-- ============================================================
-- UNIQUE(id, empresa_id) en rutas: id ya es unico por si solo (PK); esta restriccion adicional
-- es exactamente la que necesita la FK compuesta de mas abajo para poder apuntar a (id, empresa_id)
-- como una unidad -- Postgres exige que las columnas referenciadas tengan una restriccion UNIQUE
-- o PK que cubra ESE conjunto exacto de columnas, no alcanza con que "id" ya sea unico por su lado.
alter table public.rutas
  add constraint rutas_id_empresa_id_unique unique (id, empresa_id);

create table public.chofer_empresas (
  chofer_id uuid not null references public.choferes(id) on delete cascade,
  empresa_id uuid not null references public.empresas(id),
  origen text not null check (origen in ('admin', 'chofer', 'invitacion')),
  created_at timestamptz not null default now(),
  primary key (chofer_id, empresa_id)
);

-- empresa_id SIN "on delete cascade": no se borra una empresa con vinculos (se desactiva o se
-- fusiona, criterio 9) -- intentar borrar una empresa vinculada falla por esta FK, a proposito.

-- chofer_rutas lleva "empresa_id" propio (denormalizado) SOLO para poder expresar el invariante
-- del criterio 2 como dos FK compuestas, sin trigger ni funcion unica de escritura (decision del
-- usuario): cada fila prueba, por construccion, que su chofer tiene la empresa vinculada Y que la
-- ruta pertenece a esa misma empresa. Las dos FK se verifican siempre contra el estado YA COMMITEADO
-- de rutas/chofer_empresas dentro de la misma transaccion (comportamiento estandar de Postgres para
-- restricciones NOT DEFERRABLE) -- por eso renombrar_empresa/renombrar_ruta/fusionar_empresas/
-- fusionar_rutas (mas abajo) mueven primero los vinculos hijos y recien despues el padre, nunca al
-- reves, para no violar la FK a mitad de camino.
create table public.chofer_rutas (
  chofer_id uuid not null,
  ruta_id uuid not null,
  empresa_id uuid not null,
  origen text not null check (origen in ('admin', 'chofer', 'invitacion')),
  created_at timestamptz not null default now(),
  primary key (chofer_id, ruta_id),
  foreign key (chofer_id, empresa_id)
    references public.chofer_empresas (chofer_id, empresa_id) on delete cascade,
  foreign key (ruta_id, empresa_id)
    references public.rutas (id, empresa_id)
);

-- Prueba obligatoria del usuario (ver specs\pruebas_catalogo_por_chofer.sql, sección invariante):
--   - insertar en chofer_rutas sin su fila de chofer_empresas -> falla por la primera FK.
--   - borrar la fila de chofer_empresas de una empresa -> CASCADE borra sus chofer_rutas.
--   - insertar una ruta con el empresa_id que no es el suyo -> falla por la segunda FK.

-- ============================================================
-- SECCIÓN 2 — Columnas nuevas y clave normalizada (criterio 3)
-- ============================================================
alter table public.empresas
  add column pendiente_revision boolean not null default false,
  add column creada_por_chofer_id uuid references public.choferes(id) on delete set null;

alter table public.rutas
  add column pendiente_revision boolean not null default false,
  add column creada_por_chofer_id uuid references public.choferes(id) on delete set null;

-- Lo existente (JOPRIMSA, sin rutas hoy) queda con pendiente_revision = false por el default.

-- unaccent es STABLE, no IMMUTABLE (depende del diccionario resuelto por search_path) -- Postgres
-- rechaza usarla directo en un indice o una columna generada. f_unaccent la envuelve fijando el
-- diccionario por nombre completamente calificado ("extensions.unaccent"), lo que la vuelve
-- determinista y por lo tanto segura de marcar IMMUTABLE. Patron documentado de PostgreSQL/Supabase,
-- no una invención de esta migración.
create extension if not exists unaccent with schema extensions;

create or replace function extensions.f_unaccent(text)
returns text
language sql
immutable
parallel safe
as $$
  select extensions.unaccent('extensions.unaccent', $1);
$$;

-- Clave de comparación: mayúsculas, sin acentos, espacios colapsados. El CHECK (nombre =
-- upper(nombre)) y los índices lower(nombre)/( empresa_id, lower(nombre)) existentes NO se tocan
-- (decisión del usuario) -- esta columna es una clave ADICIONAL, más estricta, no un remplazo.
alter table public.empresas
  add column clave_normalizada text generated always as (
    upper(extensions.f_unaccent(regexp_replace(trim(nombre), '\s+', ' ', 'g')))
  ) stored;

alter table public.rutas
  add column clave_normalizada text generated always as (
    upper(extensions.f_unaccent(regexp_replace(trim(nombre), '\s+', ' ', 'g')))
  ) stored;

-- Con 1 sola empresa (JOPRIMSA) y 0 rutas hoy (la ruta de prueba "NUEVA" ya se borró antes de
-- migrar, confirmado contra la base real el 2026-10-25), no hay ningún par que pueda colisionar:
-- los dos índices se crean limpios.
create unique index empresas_clave_normalizada_unique on public.empresas (clave_normalizada);
create unique index rutas_empresa_clave_normalizada_unique on public.rutas (empresa_id, clave_normalizada);

-- ⚠️ Riesgo anotado (no resuelto aquí, ver el reporte): estos dos índices son por su naturaleza
-- PERMANENTES -- una empresa o ruta fusionada/desactivada (criterio 9) sigue "reservando" su
-- clave_normalizada para siempre; nadie podrá crear una empresa nueva con exactamente ese nombre
-- normalizado. La spec no pidió un índice parcial (WHERE activo) y esta migración no lo agrega
-- por su cuenta.

-- ============================================================
-- SECCIÓN 3 — Seguridad: RLS y permisos de tabla (criterio 4, decisión del usuario sobre GRANT)
-- ============================================================
-- RLS: la política "cualquier chofer autenticado" se reemplaza por "solo lo vinculado". anon no
-- lee nada de estas 4 tablas (ver GRANT/REVOKE más abajo: a anon no le queda ni el privilegio de
-- tabla, así que la policy de RLS es una segunda capa, no la única).
drop policy "choferes leen el catalogo de empresas" on public.empresas;
drop policy "choferes leen el catalogo de rutas" on public.rutas;

create policy "chofer lee sus empresas vinculadas"
  on public.empresas for select
  to authenticated
  using (
    exists (
      select 1 from public.chofer_empresas ce
      where ce.empresa_id = empresas.id
        and ce.chofer_id = auth.uid()
    )
  );

create policy "chofer lee sus rutas vinculadas"
  on public.rutas for select
  to authenticated
  using (
    exists (
      select 1 from public.chofer_rutas cr
      where cr.ruta_id = rutas.id
        and cr.chofer_id = auth.uid()
    )
  );

-- chofer_empresas/chofer_rutas: el chofer solo puede LEER sus propias filas de vínculo (hace
-- falta para que las dos políticas de arriba puedan evaluar su EXISTS bajo RLS); nunca puede
-- escribir -- ninguna política de INSERT/UPDATE/DELETE para authenticated ni anon, así que con
-- RLS habilitado esos comandos quedan bloqueados para cualquier rol salvo el dueño de la tabla y
-- service_role (que además, aparte de bypassar RLS, es el único con privilegio de escritura, ver
-- GRANT/REVOKE más abajo).
alter table public.chofer_empresas enable row level security;
alter table public.chofer_rutas enable row level security;

create policy "chofer lee sus propios vinculos de empresa"
  on public.chofer_empresas for select
  to authenticated
  using (chofer_id = auth.uid());

create policy "chofer lee sus propios vinculos de ruta"
  on public.chofer_rutas for select
  to authenticated
  using (chofer_id = auth.uid());

-- GRANT/REVOKE -- decisión explícita del usuario (anula lo que decía el diagnóstico): jornadas
-- queda FUERA, no se toca en esta migración.
revoke all on table
  public.empresas, public.rutas, public.chofer_empresas, public.chofer_rutas
from anon;

revoke insert, update, delete, truncate on table
  public.empresas, public.rutas, public.chofer_empresas, public.chofer_rutas
from authenticated;

-- authenticated ya tenía SELECT/REFERENCES/TRIGGER sobre empresas y rutas; se vuelven a conceder
-- de forma explícita (idempotente) para que el estado final no dependa de lo que hubiera antes, y
-- para que chofer_empresas/chofer_rutas (tablas nuevas) terminen con EXACTAMENTE el mismo patrón
-- que ya tiene choferes/authenticated.
grant select, references, trigger on table
  public.empresas, public.rutas, public.chofer_empresas, public.chofer_rutas
to authenticated;

-- service_role no pierde nada (decisión explícita del usuario): se concede ALL sobre las dos
-- tablas nuevas para que quede en el mismo estado que ya tienen empresas/rutas/jornadas.
grant all on table public.chofer_empresas, public.chofer_rutas to service_role;

-- ============================================================
-- SECCIÓN 4 — Backfill (criterio 5, aclaración del usuario del 2026-10-25 sobre A1)
-- ============================================================
-- TODOS los choferes que existan al aplicar esta migración (hoy 4; la ruta de prueba y el chofer
-- de prueba, si existieran, el usuario los borra ANTES de aplicar) quedan vinculados a JOPRIMSA
-- con origen='admin'. Por NOMBRE, no por id fijo: si JOPRIMSA no existiera (entorno distinto),
-- esto es un no-op en vez de un error.
insert into public.chofer_empresas (chofer_id, empresa_id, origen)
select c.id, e.id, 'admin'
from public.choferes c
cross join public.empresas e
where e.nombre = 'JOPRIMSA'
on conflict (chofer_id, empresa_id) do nothing;

-- No se siembra chofer_rutas (no hay ninguna ruta real todavía).

-- ============================================================
-- SECCIÓN 5 — Alta de empresa/ruta desde la jornada (criterios 6 y 7, opción A)
-- ============================================================
create or replace function public.jornadas_alta_catalogo_desde_chofer()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_clave_empresa text;
  v_nombre_empresa text;
  v_empresa_id uuid;
  v_empresa_activa boolean;
  v_clave_ruta text;
  v_nombre_ruta text;
  v_ruta_id uuid;
begin
  -- Solo actúa cuando la jornada la crea el propio chofer autenticado (NUNCA cuando la crea el
  -- Dashboard, que usa service_role -- auth.uid() es NULL en ese camino, confirmado empíricamente
  -- en specs\diag_catalogo_por_chofer.md, diagnóstico 4).
  if auth.role() is distinct from 'authenticated' or auth.uid() is distinct from new.chofer_id then
    return new;
  end if;

  -- Todo el resto, envuelto en EXCEPTION: un error aquí NUNCA debe impedir que la jornada se
  -- guarde (criterio 7) -- una jornada perdida es peor que una empresa sin vincular.
  begin
    v_clave_empresa := upper(extensions.f_unaccent(regexp_replace(trim(new.empresa), '\s+', ' ', 'g')));

    if length(v_clave_empresa) >= 2 and length(v_clave_empresa) <= 60 then
      select id, activo into v_empresa_id, v_empresa_activa
        from public.empresas where clave_normalizada = v_clave_empresa;

      if v_empresa_id is null then
        v_nombre_empresa := upper(regexp_replace(trim(new.empresa), '\s+', ' ', 'g'));

        insert into public.empresas (nombre, pendiente_revision, creada_por_chofer_id)
          values (v_nombre_empresa, true, new.chofer_id)
          on conflict (clave_normalizada) do nothing
          returning id into v_empresa_id;

        if v_empresa_id is null then
          -- Carrera con otra jornada/chofer creando la misma empresa a la vez: releer.
          select id, activo into v_empresa_id, v_empresa_activa
            from public.empresas where clave_normalizada = v_clave_empresa;
        else
          v_empresa_activa := true;
        end if;
      end if;

      if v_empresa_id is not null and v_empresa_activa then
        insert into public.chofer_empresas (chofer_id, empresa_id, origen)
          values (new.chofer_id, v_empresa_id, 'chofer')
          on conflict (chofer_id, empresa_id) do nothing;

        -- Lo mismo, dentro de esa empresa, para la ruta.
        v_clave_ruta := upper(extensions.f_unaccent(regexp_replace(trim(new.ruta), '\s+', ' ', 'g')));

        if length(v_clave_ruta) >= 2 and length(v_clave_ruta) <= 60 then
          select id into v_ruta_id
            from public.rutas
            where empresa_id = v_empresa_id and clave_normalizada = v_clave_ruta and activo;

          if v_ruta_id is null then
            v_nombre_ruta := upper(regexp_replace(trim(new.ruta), '\s+', ' ', 'g'));

            insert into public.rutas (empresa_id, nombre, pendiente_revision, creada_por_chofer_id)
              values (v_empresa_id, v_nombre_ruta, true, new.chofer_id)
              on conflict (empresa_id, clave_normalizada) do nothing
              returning id into v_ruta_id;

            if v_ruta_id is null then
              select id into v_ruta_id
                from public.rutas
                where empresa_id = v_empresa_id and clave_normalizada = v_clave_ruta and activo;
            end if;
          end if;

          if v_ruta_id is not null then
            insert into public.chofer_rutas (chofer_id, ruta_id, empresa_id, origen)
              values (new.chofer_id, v_ruta_id, v_empresa_id, 'chofer')
              on conflict (chofer_id, ruta_id) do nothing;
          end if;
          -- Si la ruta existe pero está inactiva (v_ruta_id queda null porque el "where ... and
          -- activo" no la encuentra, y el insert de arriba puede chocar con una fila inactiva de
          -- la misma clave): no se reactiva ni se vincula, igual que la empresa. La jornada se
          -- guarda igual con su texto -- no hay ningún "return" ni "raise" en esta rama.
        end if;
      end if;
      -- Si la empresa existe pero está inactiva (v_empresa_activa = false): no se reactiva ni se
      -- vincula, y tampoco se procesa la ruta (no hay un empresa_id activo al que colgarla).
    end if;
    -- ON CONFLICT DO NOTHING en los tres inserts (empresas, rutas, chofer_empresas/chofer_rutas)
    -- es lo que hace que un UPSERT repetido de la misma jornada (mismo texto de empresa/ruta) no
    -- duplique nada -- probado en specs\pruebas_catalogo_por_chofer.sql, sección "trigger".
    --
    -- ⚠️ Este trigger es SOLO AFTER INSERT (decisión del usuario): hoy empresa/ruta de una jornada
    -- se fijan una sola vez y nunca se reescriben en ningún reintento (confirmado contra
    -- jornadasRepo.ts/syncService.ts). Si algún día la app permite EDITAR empresa/ruta de una
    -- jornada ya sincronizada, hace falta espejar esta misma lógica en un trigger AFTER UPDATE
    -- (con el mismo filtro auth.role()='authenticated' and auth.uid()=NEW.chofer_id) -- hoy NO
    -- existe ese trigger y no hace falta, porque ese escenario no puede ocurrir todavía.
  exception when others then
    raise warning 'jornadas_alta_catalogo_desde_chofer: error no bloqueante para la jornada % (chofer %): %',
      new.id, new.chofer_id, sqlerrm;
  end;

  return new;
end;
$$;

create trigger jornadas_alta_catalogo_desde_chofer_trigger
  after insert on public.jornadas
  for each row
  execute function public.jornadas_alta_catalogo_desde_chofer();

-- Este proyecto tiene un default ACL (pg_default_acl, rol postgres, esquema public, objtype 'f')
-- que concede EXECUTE a anon/authenticated/service_role sobre TODA función nueva, en el momento
-- en que se crea -- no es un privilegio heredado de PUBLIC, es un GRANT explícito ya puesto al
-- crear la función. "revoke execute ... from public" (visto más abajo, antes de este fix) NO
-- toca esos grants explícitos -- hace falta revocarlos a anon/authenticated por su nombre.
-- jornadas_alta_catalogo_desde_chofer() es una función de trigger (RETURNS TRIGGER): nadie puede
-- llamarla directo por SQL aunque tuviera EXECUTE (Postgres lo rechaza siempre, "trigger
-- functions can only be called as triggers") -- este REVOKE es higiene/consistencia con el
-- default ACL, no una vulnerabilidad real que cierre.
revoke execute on function public.jornadas_alta_catalogo_desde_chofer()
  from public, anon, authenticated;

-- ============================================================
-- SECCIÓN 6 — Invitaciones (criterio 8)
-- ============================================================
-- Única función tocada: crear_chofer_desde_invitacion(). Se agregan SOLO los dos inserts de
-- vínculo, en el mismo bloque try/exception ya existente del alta del chofer (misma transacción:
-- si el chofer no llega a crearse, tampoco se crean sus vínculos). Ninguna validación, ningún
-- mensaje de error ni ningún otro comportamiento existente cambia -- diff literal completo en
-- specs\diff_crear_chofer_desde_invitacion.txt.
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

  -- NUEVO (spec_catalogo_por_chofer.md, criterio 8, 2026-10-25): vínculos de la invitación. Si la
  -- invitación traía empresa (y, dentro de ella, ruta), el chofer recién creado queda vinculado
  -- con origen='invitacion' -- mismo mecanismo que usará el Dashboard (origen='admin') y el
  -- trigger de jornadas (origen='chofer'). No cambia ninguna validación ni mensaje de error de
  -- arriba; si esto fallara, rompe el alta completa igual que cualquier otro paso de esta función
  -- (la función entera corre en una sola transacción, por diseño -- criterio 8, "un error aquí
  -- rompe todos los registros").
  -- 2026-10-25: el INSERT se envuelve en su propio BEGIN/EXCEPTION -- un vinculo que fallara
  -- (por ejemplo, una ruta que no perteneciera a la empresa de la invitacion) jamas debe romper
  -- el alta del chofer. Un fallo deshace los dos INSERT de este bloque (misma sub-transaccion
  -- implicita de plpgsql) pero nunca el resto de la funcion.
  if v_invitacion.empresa_id is not null then
    begin
      insert into public.chofer_empresas (chofer_id, empresa_id, origen)
        values (new.id, v_invitacion.empresa_id, 'invitacion')
        on conflict (chofer_id, empresa_id) do nothing;

      if v_invitacion.ruta_id is not null then
        insert into public.chofer_rutas (chofer_id, ruta_id, empresa_id, origen)
          values (new.id, v_invitacion.ruta_id, v_invitacion.empresa_id, 'invitacion')
          on conflict (chofer_id, ruta_id) do nothing;
      end if;
    exception when others then
      raise warning 'crear_chofer_desde_invitacion: no se pudo crear el vinculo de la invitacion % para el chofer %: %',
        v_invitacion.id, new.id, sqlerrm;
    end;
  end if;

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
-- SECCIÓN 7 — Renombrar y fusionar (criterio 9, solo service_role)
-- ============================================================
-- "Solo service_role" se garantiza en DOS capas: (1) el GRANT/REVOKE de más abajo le quita
-- EXECUTE a cualquier otro rol; (2) la función igual comprueba auth.role() adentro, por si algún
-- día alguien le concede EXECUTE a authenticated por error (mismo principio de "dos capas" que el
-- resto del proyecto). Cada función es una sola llamada: ya es atómica por construcción (si algo
-- falla adentro, Postgres revierte TODOS sus efectos, sin necesitar BEGIN/COMMIT explícitos, que
-- tampoco se pueden usar dentro de una function -- solo dentro de una procedure con CALL).

create or replace function public.renombrar_empresa(p_empresa_id uuid, p_nombre_nuevo text)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_nombre_viejo text;
  v_nombre_normalizado text;
  v_filas integer;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'renombrar_empresa: solo service_role';
  end if;

  v_nombre_normalizado := upper(regexp_replace(trim(p_nombre_nuevo), '\s+', ' ', 'g'));
  if length(v_nombre_normalizado) < 2 or length(v_nombre_normalizado) > 60 then
    raise exception 'renombrar_empresa: el nombre debe tener entre 2 y 60 caracteres tras normalizar';
  end if;

  select nombre into v_nombre_viejo from public.empresas where id = p_empresa_id;
  if v_nombre_viejo is null then
    raise exception 'renombrar_empresa: la empresa % no existe', p_empresa_id;
  end if;

  update public.empresas set nombre = v_nombre_normalizado where id = p_empresa_id;

  -- Actualiza también el texto de jornadas.empresa que coincidía EXACTAMENTE con el nombre viejo
  -- (interpretación literal del criterio 9; jornadas.empresa sigue siendo texto libre, sin FK).
  update public.jornadas set empresa = v_nombre_normalizado where empresa = v_nombre_viejo;
  get diagnostics v_filas = row_count;

  return v_filas;
end;
$$;

create or replace function public.renombrar_ruta(p_ruta_id uuid, p_nombre_nuevo text)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_nombre_viejo text;
  v_empresa_id uuid;
  v_nombre_empresa text;
  v_nombre_normalizado text;
  v_filas integer;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'renombrar_ruta: solo service_role';
  end if;

  v_nombre_normalizado := upper(regexp_replace(trim(p_nombre_nuevo), '\s+', ' ', 'g'));
  if length(v_nombre_normalizado) < 2 or length(v_nombre_normalizado) > 60 then
    raise exception 'renombrar_ruta: el nombre debe tener entre 2 y 60 caracteres tras normalizar';
  end if;

  select r.nombre, r.empresa_id, e.nombre
    into v_nombre_viejo, v_empresa_id, v_nombre_empresa
    from public.rutas r
    join public.empresas e on e.id = r.empresa_id
    where r.id = p_ruta_id;

  if v_nombre_viejo is null then
    raise exception 'renombrar_ruta: la ruta % no existe', p_ruta_id;
  end if;

  update public.rutas set nombre = v_nombre_normalizado where id = p_ruta_id;

  -- Solo dentro de la misma empresa (en texto): dos empresas distintas pueden tener una ruta con
  -- el mismo nombre viejo por coincidencia, y esa otra no debe tocarse.
  update public.jornadas
    set ruta = v_nombre_normalizado
    where empresa = v_nombre_empresa and ruta = v_nombre_viejo;
  get diagnostics v_filas = row_count;

  return v_filas;
end;
$$;

create or replace function public.fusionar_rutas(p_origen_id uuid, p_destino_id uuid)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_nombre_origen text;
  v_nombre_destino text;
  v_empresa_origen uuid;
  v_empresa_destino uuid;
  v_nombre_empresa text;
  v_filas integer;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'fusionar_rutas: solo service_role';
  end if;

  if p_origen_id = p_destino_id then
    raise exception 'fusionar_rutas: origen y destino no pueden ser la misma ruta';
  end if;

  select nombre, empresa_id into v_nombre_origen, v_empresa_origen
    from public.rutas where id = p_origen_id;
  select nombre, empresa_id into v_nombre_destino, v_empresa_destino
    from public.rutas where id = p_destino_id;

  if v_nombre_origen is null or v_nombre_destino is null then
    raise exception 'fusionar_rutas: origen o destino no existen';
  end if;

  if v_empresa_origen <> v_empresa_destino then
    raise exception 'fusionar_rutas: las dos rutas deben pertenecer a la misma empresa';
  end if;

  select nombre into v_nombre_empresa from public.empresas where id = v_empresa_origen;

  -- Mover los vínculos (chofer_rutas) de la ruta de origen a la de destino, sin duplicar si un
  -- chofer ya estaba vinculado a las dos.
  insert into public.chofer_rutas (chofer_id, ruta_id, empresa_id, origen)
    select chofer_id, p_destino_id, empresa_id, origen
    from public.chofer_rutas where ruta_id = p_origen_id
    on conflict (chofer_id, ruta_id) do nothing;
  delete from public.chofer_rutas where ruta_id = p_origen_id;

  update public.choferes set ruta_defecto_id = p_destino_id where ruta_defecto_id = p_origen_id;
  update public.invitaciones set ruta_id = p_destino_id where ruta_id = p_origen_id;

  update public.jornadas
    set ruta = v_nombre_destino
    where empresa = v_nombre_empresa and ruta = v_nombre_origen;
  get diagnostics v_filas = row_count;

  update public.rutas set activo = false where id = p_origen_id;

  return v_filas;
end;
$$;

create or replace function public.fusionar_empresas(p_origen_id uuid, p_destino_id uuid)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_nombre_origen text;
  v_nombre_destino text;
  v_filas integer;
  r record;
  v_ruta_destino_id uuid;
  v_nombre_ruta_destino text;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'fusionar_empresas: solo service_role';
  end if;

  if p_origen_id = p_destino_id then
    raise exception 'fusionar_empresas: origen y destino no pueden ser la misma empresa';
  end if;

  select nombre into v_nombre_origen from public.empresas where id = p_origen_id;
  select nombre into v_nombre_destino from public.empresas where id = p_destino_id;

  if v_nombre_origen is null or v_nombre_destino is null then
    raise exception 'fusionar_empresas: origen o destino no existen';
  end if;

  drop table if exists pg_temp._tmp_vinculos_ruta;
  create temp table _tmp_vinculos_ruta (chofer_id uuid, origen text);

  -- Vínculos de empresa PRIMERO, antes del bucle de rutas: el bucle de más abajo reinserta
  -- chofer_rutas con empresa_id = p_destino_id (líneas "combinar" y "mover") -- esa reinserción
  -- exige que cada chofer que tenía chofer_empresas(chofer_id, origen) YA tenga también
  -- chofer_empresas(chofer_id, destino), por la FK compuesta (chofer_id, empresa_id) ->
  -- chofer_empresas. Si este INSERT corriera después del bucle (como antes), un chofer vinculado
  -- SOLO a la empresa de origen (sin vínculo previo a destino) haría fallar la reinserción con
  -- foreign_key_violation (23503) -- bug real encontrado el 2026-10-26 con un fixture de prueba
  -- que lo tapaba al vincular de más. El DELETE de la fila de origen se queda DESPUÉS del bucle
  -- (ver el comentario de más abajo): para entonces ya no queda ningún chofer_rutas apuntando a
  -- esa empresa, así que borrarla no deja nada colgado.
  insert into public.chofer_empresas (chofer_id, empresa_id, origen)
    select chofer_id, p_destino_id, origen from public.chofer_empresas where empresa_id = p_origen_id
    on conflict (chofer_id, empresa_id) do nothing;

  -- Rutas de la empresa de origen, una por una: si la de destino ya tiene una ruta con la misma
  -- clave (combinar), se desactiva la de origen y sus vínculos pasan a la de destino que ya
  -- existía; si no, la ruta se MUEVE entera (conserva su id) a la empresa de destino.
  for r in select * from public.rutas where empresa_id = p_origen_id loop
    select id, nombre into v_ruta_destino_id, v_nombre_ruta_destino
      from public.rutas
      where empresa_id = p_destino_id and clave_normalizada = r.clave_normalizada;

    truncate _tmp_vinculos_ruta;
    insert into _tmp_vinculos_ruta
      select chofer_id, origen from public.chofer_rutas where ruta_id = r.id;
    delete from public.chofer_rutas where ruta_id = r.id;

    if v_ruta_destino_id is not null then
      -- Combinar: los vínculos de la ruta de origen pasan a la ya existente en destino.
      insert into public.chofer_rutas (chofer_id, ruta_id, empresa_id, origen)
        select chofer_id, v_ruta_destino_id, p_destino_id, origen from _tmp_vinculos_ruta
        on conflict (chofer_id, ruta_id) do nothing;

      update public.jornadas
        set ruta = v_nombre_ruta_destino
        where empresa = v_nombre_origen and ruta = r.nombre;

      update public.choferes set ruta_defecto_id = v_ruta_destino_id where ruta_defecto_id = r.id;
      update public.invitaciones set ruta_id = v_ruta_destino_id where ruta_id = r.id;

      update public.rutas set activo = false where id = r.id;
    else
      -- Mover: la ruta pasa entera a la empresa de destino, conservando su id (sus vínculos no
      -- necesitan remapearse por eso -- choferes.ruta_defecto_id/invitaciones.ruta_id que ya
      -- apuntaban a r.id siguen siendo válidos sin tocarlos).
      update public.rutas set empresa_id = p_destino_id where id = r.id;

      insert into public.chofer_rutas (chofer_id, ruta_id, empresa_id, origen)
        select chofer_id, r.id, p_destino_id, origen from _tmp_vinculos_ruta
        on conflict (chofer_id, ruta_id) do nothing;
    end if;
  end loop;

  drop table if exists pg_temp._tmp_vinculos_ruta;

  -- Vínculos de empresa: el INSERT que los mueve a destino ya corrió ANTES del bucle (ver
  -- arriba) -- aquí solo queda borrar la fila de origen. Para este punto ya no queda ningún
  -- chofer_rutas apuntando a empresa_id = origen (todas sus rutas ya se movieron o se
  -- combinaron arriba), así que borrarla no deja ningún chofer_rutas colgado.
  delete from public.chofer_empresas where empresa_id = p_origen_id;

  update public.choferes set empresa_defecto_id = p_destino_id where empresa_defecto_id = p_origen_id;
  update public.invitaciones set empresa_id = p_destino_id where empresa_id = p_origen_id;

  -- Único conteo de jornadas: para este punto, todo renombrado de ruta (rama "combinar" del loop)
  -- ya se aplicó sobre filas que todavía tenían empresa = v_nombre_origen -- este UPDATE final
  -- cuenta cada fila de jornadas de esa empresa exactamente una vez.
  update public.jornadas set empresa = v_nombre_destino where empresa = v_nombre_origen;
  get diagnostics v_filas = row_count;

  update public.empresas set activo = false where id = p_origen_id;

  return v_filas;
end;
$$;

-- "from public" NO alcanza: el default ACL de este proyecto (pg_default_acl, rol postgres,
-- esquema public) le da EXECUTE a anon y authenticated, como GRANT EXPLÍCITO, en el momento en
-- que Postgres crea cada función nueva -- revocar solo PUBLIC deja esos dos grants intactos, y
-- "solo service_role" quedaría sostenido únicamente por el chequeo auth.role() de adentro, no
-- por el privilegio real (bug encontrado el 2026-10-26, antes de aplicar). Se revoca a los tres
-- explícitamente.
revoke execute on function
  public.renombrar_empresa(uuid, text),
  public.renombrar_ruta(uuid, text),
  public.fusionar_empresas(uuid, uuid),
  public.fusionar_rutas(uuid, uuid)
from public, anon, authenticated;

grant execute on function
  public.renombrar_empresa(uuid, text),
  public.renombrar_ruta(uuid, text),
  public.fusionar_empresas(uuid, uuid),
  public.fusionar_rutas(uuid, uuid)
to service_role;

-- ================================================================
-- REGISTRO DEL HISTORIAL
-- ================================================================
insert into supabase_migrations.schema_migrations (version, name, statements)
values (to_char(now() at time zone 'utc', 'YYYYMMDDHH24MISS'), 'schema_v26_catalogo_por_chofer', '{}'::text[]);

commit;

-- ================================================================
-- VERIFICACIÓN FINAL (única sentencia que el editor muestra) -- 8 comprobaciones (a-h).
-- ================================================================
with cuerpo as (
  select
    pg_get_functiondef('public.crear_chofer_desde_invitacion()'::regprocedure) as def_vivo,
    $CUERPOLIT$
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

  -- NUEVO (spec_catalogo_por_chofer.md, criterio 8, 2026-10-25): vínculos de la invitación. Si la
  -- invitación traía empresa (y, dentro de ella, ruta), el chofer recién creado queda vinculado
  -- con origen='invitacion' -- mismo mecanismo que usará el Dashboard (origen='admin') y el
  -- trigger de jornadas (origen='chofer'). No cambia ninguna validación ni mensaje de error de
  -- arriba; si esto fallara, rompe el alta completa igual que cualquier otro paso de esta función
  -- (la función entera corre en una sola transacción, por diseño -- criterio 8, "un error aquí
  -- rompe todos los registros").
  -- 2026-10-25: el INSERT se envuelve en su propio BEGIN/EXCEPTION -- un vinculo que fallara
  -- (por ejemplo, una ruta que no perteneciera a la empresa de la invitacion) jamas debe romper
  -- el alta del chofer. Un fallo deshace los dos INSERT de este bloque (misma sub-transaccion
  -- implicita de plpgsql) pero nunca el resto de la funcion.
  if v_invitacion.empresa_id is not null then
    begin
      insert into public.chofer_empresas (chofer_id, empresa_id, origen)
        values (new.id, v_invitacion.empresa_id, 'invitacion')
        on conflict (chofer_id, empresa_id) do nothing;

      if v_invitacion.ruta_id is not null then
        insert into public.chofer_rutas (chofer_id, ruta_id, empresa_id, origen)
          values (new.id, v_invitacion.ruta_id, v_invitacion.empresa_id, 'invitacion')
          on conflict (chofer_id, ruta_id) do nothing;
      end if;
    exception when others then
      raise warning 'crear_chofer_desde_invitacion: no se pudo crear el vinculo de la invitacion % para el chofer %: %',
        v_invitacion.id, new.id, sqlerrm;
    end;
  end if;

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
$CUERPOLIT$ as cuerpo_esperado
),
calc as (
  select
    def_vivo,
    replace(split_part(def_vivo, '$function$', 2), chr(13), '') as cuerpo_vivo_sin_cr,
    replace(cuerpo_esperado, chr(13), '') as cuerpo_esperado_sin_cr,
    length(def_vivo) - length(replace(def_vivo, chr(13), '')) as cr_count
  from cuerpo
)
select row_number() over () as n, comprobacion, esperado, obtenido, resultado
from (
  select
    'a) chofer_empresas (4 filas, admin/JOPRIMSA) y chofer_rutas (0 filas)' as comprobacion,
    'chofer_empresas=4 (admin/JOPRIMSA), chofer_rutas=0' as esperado,
    format('chofer_empresas=%s (admin/JOPRIMSA=%s), chofer_rutas=%s',
      (select count(*) from public.chofer_empresas),
      (select count(*) from public.chofer_empresas ce join public.empresas e on e.id = ce.empresa_id
        where ce.origen = 'admin' and e.nombre = 'JOPRIMSA'),
      (select count(*) from public.chofer_rutas)
    ) as obtenido,
    case when (select count(*) from public.chofer_empresas) = 4
      and (select count(*) from public.chofer_empresas ce join public.empresas e on e.id = ce.empresa_id
        where ce.origen = 'admin' and e.nombre = 'JOPRIMSA') = 4
      and (select count(*) from public.chofer_rutas) = 0
      then 'OK' else 'FALLO' end as resultado

  union all

  select
    'b) columnas nuevas (pendiente_revision, creada_por_chofer_id, clave_normalizada) en empresas y rutas',
    '6',
    (select count(*)::text from information_schema.columns
      where table_schema = 'public' and table_name in ('empresas', 'rutas')
        and column_name in ('pendiente_revision', 'creada_por_chofer_id', 'clave_normalizada')),
    case when (select count(*) from information_schema.columns
      where table_schema = 'public' and table_name in ('empresas', 'rutas')
        and column_name in ('pendiente_revision', 'creada_por_chofer_id', 'clave_normalizada')) = 6
      then 'OK' else 'FALLO' end

  union all

  select
    'c) anon sin privilegios; authenticated solo SELECT/REFERENCES/TRIGGER (empresas, rutas, chofer_empresas, chofer_rutas)',
    'anon=0 filas; authenticated=12 filas (3 privilegios x 4 tablas), sin otros privilegios',
    format('anon=%s filas; authenticated=%s filas; privilegios_authenticated=%s',
      (select count(*) from information_schema.role_table_grants
        where grantee = 'anon' and table_schema = 'public'
          and table_name in ('empresas', 'rutas', 'chofer_empresas', 'chofer_rutas')),
      (select count(*) from information_schema.role_table_grants
        where grantee = 'authenticated' and table_schema = 'public'
          and table_name in ('empresas', 'rutas', 'chofer_empresas', 'chofer_rutas')),
      (select string_agg(distinct privilege_type, ',' order by privilege_type) from information_schema.role_table_grants
        where grantee = 'authenticated' and table_schema = 'public'
          and table_name in ('empresas', 'rutas', 'chofer_empresas', 'chofer_rutas'))
    ),
    case when (select count(*) from information_schema.role_table_grants
        where grantee = 'anon' and table_schema = 'public'
          and table_name in ('empresas', 'rutas', 'chofer_empresas', 'chofer_rutas')) = 0
      and (select count(*) from information_schema.role_table_grants
        where grantee = 'authenticated' and table_schema = 'public'
          and table_name in ('empresas', 'rutas', 'chofer_empresas', 'chofer_rutas')) = 12
      and not exists (select 1 from information_schema.role_table_grants
        where grantee = 'authenticated' and table_schema = 'public'
          and table_name in ('empresas', 'rutas', 'chofer_empresas', 'chofer_rutas')
          and privilege_type not in ('SELECT', 'REFERENCES', 'TRIGGER'))
      then 'OK' else 'FALLO' end

  union all

  select
    'd) trigger jornadas_alta_catalogo_desde_chofer_trigger sobre jornadas (AFTER INSERT)',
    'AFTER INSERT',
    (select coalesce(string_agg(action_timing || ' ' || event_manipulation, ', '), '(no existe)')
      from information_schema.triggers
      where event_object_schema = 'public' and event_object_table = 'jornadas'
        and trigger_name = 'jornadas_alta_catalogo_desde_chofer_trigger'),
    case when exists (select 1 from information_schema.triggers
      where event_object_schema = 'public' and event_object_table = 'jornadas'
        and trigger_name = 'jornadas_alta_catalogo_desde_chofer_trigger'
        and action_timing = 'AFTER' and event_manipulation = 'INSERT')
      then 'OK' else 'FALLO' end

  union all

  select
    'e) renombrar_empresa/renombrar_ruta/fusionar_empresas/fusionar_rutas: EXECUTE solo service_role; jornadas_alta_catalogo_desde_chofer: EXECUTE ni para anon ni para authenticated',
    'anon=false, authenticated=false, service_role=true (las 4 funciones); jornadas_alta_catalogo_desde_chofer: anon=false, authenticated=false',
    format('anon=%s, authenticated=%s, service_role=%s; jornadas_alta_catalogo_desde_chofer(anon=%s, authenticated=%s)',
      (has_function_privilege('anon', 'public.renombrar_empresa(uuid,text)', 'execute')
        or has_function_privilege('anon', 'public.renombrar_ruta(uuid,text)', 'execute')
        or has_function_privilege('anon', 'public.fusionar_empresas(uuid,uuid)', 'execute')
        or has_function_privilege('anon', 'public.fusionar_rutas(uuid,uuid)', 'execute')),
      (has_function_privilege('authenticated', 'public.renombrar_empresa(uuid,text)', 'execute')
        or has_function_privilege('authenticated', 'public.renombrar_ruta(uuid,text)', 'execute')
        or has_function_privilege('authenticated', 'public.fusionar_empresas(uuid,uuid)', 'execute')
        or has_function_privilege('authenticated', 'public.fusionar_rutas(uuid,uuid)', 'execute')),
      (has_function_privilege('service_role', 'public.renombrar_empresa(uuid,text)', 'execute')
        and has_function_privilege('service_role', 'public.renombrar_ruta(uuid,text)', 'execute')
        and has_function_privilege('service_role', 'public.fusionar_empresas(uuid,uuid)', 'execute')
        and has_function_privilege('service_role', 'public.fusionar_rutas(uuid,uuid)', 'execute')),
      has_function_privilege('anon', 'public.jornadas_alta_catalogo_desde_chofer()', 'execute'),
      has_function_privilege('authenticated', 'public.jornadas_alta_catalogo_desde_chofer()', 'execute')
    ),
    case when not (has_function_privilege('anon', 'public.renombrar_empresa(uuid,text)', 'execute')
        or has_function_privilege('anon', 'public.renombrar_ruta(uuid,text)', 'execute')
        or has_function_privilege('anon', 'public.fusionar_empresas(uuid,uuid)', 'execute')
        or has_function_privilege('anon', 'public.fusionar_rutas(uuid,uuid)', 'execute'))
      and not (has_function_privilege('authenticated', 'public.renombrar_empresa(uuid,text)', 'execute')
        or has_function_privilege('authenticated', 'public.renombrar_ruta(uuid,text)', 'execute')
        or has_function_privilege('authenticated', 'public.fusionar_empresas(uuid,uuid)', 'execute')
        or has_function_privilege('authenticated', 'public.fusionar_rutas(uuid,uuid)', 'execute'))
      and (has_function_privilege('service_role', 'public.renombrar_empresa(uuid,text)', 'execute')
        and has_function_privilege('service_role', 'public.renombrar_ruta(uuid,text)', 'execute')
        and has_function_privilege('service_role', 'public.fusionar_empresas(uuid,uuid)', 'execute')
        and has_function_privilege('service_role', 'public.fusionar_rutas(uuid,uuid)', 'execute'))
      and not has_function_privilege('anon', 'public.jornadas_alta_catalogo_desde_chofer()', 'execute')
      and not has_function_privilege('authenticated', 'public.jornadas_alta_catalogo_desde_chofer()', 'execute')
      then 'OK' else 'FALLO' end

  union all

  select
    'f) crear_chofer_desde_invitacion: contiene chofer_empresas; cuerpo (sin chr(13)) = al de la migración',
    format('contiene chofer_empresas=true; cuerpo_sin_cr md5=%s', (select md5(cuerpo_esperado_sin_cr) from calc)),
    format('contiene chofer_empresas=%s; cuerpo_sin_cr md5=%s; chr(13) en pg_get_functiondef=%s',
      (select position('chofer_empresas' in def_vivo) > 0 from calc),
      (select md5(cuerpo_vivo_sin_cr) from calc),
      (select cr_count from calc)
    ),
    case when (select position('chofer_empresas' in def_vivo) > 0 from calc)
      and (select cuerpo_vivo_sin_cr = cuerpo_esperado_sin_cr from calc)
      then 'OK' else 'FALLO' end

  union all

  select
    'g) choferes=4 y jornadas=0 (no se perdió nada con la migración)',
    'choferes=4, jornadas=0',
    format('choferes=%s, jornadas=%s',
      (select count(*) from public.choferes),
      (select count(*) from public.jornadas)
    ),
    case when (select count(*) from public.choferes) = 4 and (select count(*) from public.jornadas) = 0
      then 'OK' else 'FALLO' end

  union all

  select
    'h) supabase_migrations.schema_migrations tiene la fila name=schema_v26_catalogo_por_chofer',
    '>= 1 fila',
    format('filas=%s', (select count(*) from supabase_migrations.schema_migrations
      where name = 'schema_v26_catalogo_por_chofer')),
    case when (select count(*) from supabase_migrations.schema_migrations
      where name = 'schema_v26_catalogo_por_chofer') >= 1
      then 'OK' else 'FALLO' end
) t
order by n;
