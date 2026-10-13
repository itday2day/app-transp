-- spec_bloque_b_invitacion_registro_login_correo.md (Hallazgo #51) — Migración 1 de 2.
-- Esta migración NO instala el trigger sobre auth.users (eso es la Migración 2, junto con el
-- cierre de policies de choferes y la reapertura de signUp) -- a propósito, para que el Dashboard
-- ("Invitar chofer") y la pantalla pública de invitación puedan desplegarse y probarse antes de
-- tocar el camino de alta real. Orden de despliegue completo en la spec.

-- ============================================================
-- CHOFERES: columnas heredadas opcionales + nuevas (D3 = b, criterio 3)
-- ============================================================
-- numero_empleado/pais_nacimiento/sexo dejan de ser obligatorios -- el registro nuevo no los
-- pide. Se conservan (con su UNIQUE/CHECK existente) para los 5 choferes de prueba; se eliminan
-- en el barrido posterior a la segunda presentación, no acá.
alter table public.choferes
  alter column numero_empleado drop not null,
  alter column pais_nacimiento drop not null,
  alter column sexo drop not null;

alter table public.choferes
  add column if not exists revisado_por text,
  add column if not exists empresa_defecto_id uuid references public.empresas(id),
  add column if not exists ruta_defecto_id uuid references public.rutas(id);

-- revisado_at va en su propio bloque condicional: el backfill "marcar revisados a los 5 de
-- prueba" tiene que correr UNA sola vez, la primera vez que se agrega la columna -- si esta
-- migración se vuelve a correr después de que ya exista un chofer nuevo real sin revisar, un
-- "update ... where revisado_at is null" sin esta guarda lo marcaría revisado por error, sin que
-- Administración lo haya tocado.
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'choferes' and column_name = 'revisado_at'
  ) then
    alter table public.choferes add column revisado_at timestamptz;
    -- El WHERE es redundante acá (la columna recién se agregó, todas las filas son NULL) -- se
    -- deja igual, nunca un UPDATE sin WHERE sobre una tabla real.
    update public.choferes set revisado_at = now() where revisado_at is null;
  end if;
end $$;

comment on column public.choferes.revisado_at is
  'NULL = etiqueta "Nuevo — sin revisar" en /choferes (Hallazgo #51). No bloquea nada: solo informa a Administración.';

-- ============================================================
-- INVITACIONES (Hallazgo #51)
-- ============================================================
-- Un DEFAULT de columna no admite una subconsulta con FROM (error real de Postgres al probar
-- esto: "cannot use subquery in DEFAULT expression") -- de ahí esta función chica en vez de
-- calcular el código en línea. "random()" no es criptográficamente seguro (es un PRNG común, no
-- un CSPRNG) -- un código de invitación de 8 caracteres es justo el tipo de valor que alguien
-- podría intentar adivinar/forzar por fuerza bruta, así que cada carácter sale de un byte de
-- extensions.gen_random_bytes() (el mismo CSPRNG que ya usa el token) en vez de random().
create or replace function public.generar_codigo_invitacion()
returns text
language sql
volatile
set search_path = ''
as $$
  select string_agg(
    substr(
      'ABCDEFGHJKLMNPQRSTUVWXYZ23456789',
      1 + (get_byte(extensions.gen_random_bytes(1), 0) % 32),
      1
    ),
    ''
  )
  from generate_series(1, 8);
$$;

-- RLS activa SIN ninguna policy para anon/authenticated: ni siquiera pueden intentar un select
-- (con RLS encendida y cero policies, esos dos roles no bypasean nada). Solo service_role (que
-- bypasea RLS) y las funciones security definer de abajo (dueñas de la tabla, también bypasean)
-- la tocan. Por eso NO hace falta ninguna policy explícita, a diferencia de empresas/rutas.
create table if not exists public.invitaciones (
  id uuid primary key default gen_random_uuid(),
  -- 32 hex de gen_random_bytes(16) -- pgcrypto ya está instalada (confirmado en Fase 1), en el
  -- esquema "extensions" (no "public"): calificado explícito para no depender del search_path.
  token text not null unique default encode(extensions.gen_random_bytes(16), 'hex'),
  -- 8 caracteres del alfabeto sin ambiguos (sin I/O/0/1) -- código de respaldo para cuando el
  -- enlace profundo no abre la app (criterio 14).
  codigo text not null unique default public.generar_codigo_invitacion(),
  empresa_id uuid references public.empresas(id),
  ruta_id uuid references public.rutas(id),
  -- Mismo criterio que jornadas.editado_por/creada_por (#28/#rutas_admin): texto libre con el
  -- nombre/correo del admin autenticado, no una FK a admins -- no se migró a FK cuando se
  -- resolvió por primera vez, y no vale la pena hacerlo solo para esto.
  creada_por text,
  created_at timestamptz not null default now(),
  -- NO es columna generada: Postgres exige que la expresión de una columna "generated always"
  -- sea IMMUTABLE, y "timestamptz + interval" es solo STABLE en el catálogo (probado: error real
  -- "generation expression is not immutable"), aunque el intervalo sea fijo en horas. Dos
  -- defaults en vez de uno, pero sin desalinearse entre sí: now() se congela una sola vez por
  -- transacción, así que created_at y vence_at siempre quedan exactamente 48 h aparte.
  vence_at timestamptz not null default now() + interval '48 hours',
  revocada_at timestamptz,
  usada_at timestamptz,
  -- ON DELETE SET NULL, no una FK sin acción: "Anular registro sin confirmar" (criterio 20) borra
  -- el usuario de Auth, y esa fila de invitaciones NO tiene por qué desaparecer ni bloquear el
  -- borrado -- queda como "usada" igual (usada_at se conserva), solo se pierde la referencia a
  -- quién la usó.
  usada_por uuid references auth.users(id) on delete set null
);

alter table public.invitaciones enable row level security;

-- Explícito, no solo confiado a "RLS activa + cero policies" -- aunque ese combo ya deniega por
-- sí solo (probado), un REVOKE a la vista documenta la intención y no depende de que el
-- comportamiento por defecto de Postgres/Supabase se mantenga igual hacia adelante.
revoke all on public.invitaciones from anon, authenticated;

create index if not exists invitaciones_pendientes_idx on public.invitaciones (created_at desc)
  where usada_at is null and revocada_at is null;

-- ============================================================
-- FUNCIONES SECURITY DEFINER
-- ============================================================
-- Ninguna de las cuatro permisos por defecto a PUBLIC -- se otorgan explícitos más abajo.

-- 1) Validación SIN consumir -- la pantalla de registro la llama antes de mostrar el formulario
-- (criterio 7) y antes de llamar a signUp. Nunca devuelve token/código/id/creada_por: solo lo que
-- el chofer necesita ver. Acepta token O código, sin distinguir cuál (normalizado a mayúsculas y
-- sin espacios -- el token es hex en minúsculas al generarse, por eso la comparación es
-- case-insensitive de los dos lados, no solo del valor recibido).
create or replace function public.validar_invitacion(p_valor text)
returns table (
  estado text,
  empresa_nombre text,
  ruta_nombre text,
  vence_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  -- Quita espacios Y guiones -- el código de respaldo se suele dictar/copiar con guiones de
  -- separación visual ("ABCD-2345"), y el token podría pegarse con algún separador también.
  v_valor text := upper(regexp_replace(coalesce(p_valor, ''), '[\s-]', '', 'g'));
  v_fila public.invitaciones%rowtype;
begin
  select i.* into v_fila
  from public.invitaciones i
  where upper(i.token) = v_valor or i.codigo = v_valor
  limit 1;

  if v_fila.id is null then
    return query select 'no_existe'::text, null::text, null::text, null::timestamptz;
    return;
  end if;

  if v_fila.revocada_at is not null then
    return query select 'revocada'::text, null::text, null::text, v_fila.vence_at;
    return;
  end if;

  if v_fila.usada_at is not null then
    return query select 'usada'::text, null::text, null::text, v_fila.vence_at;
    return;
  end if;

  if v_fila.vence_at <= now() then
    return query select 'vencida'::text, null::text, null::text, v_fila.vence_at;
    return;
  end if;

  return query
    select
      'valida'::text,
      (select e.nombre from public.empresas e where e.id = v_fila.empresa_id),
      (select r.nombre from public.rutas r where r.id = v_fila.ruta_id),
      v_fila.vence_at;
end;
$$;

-- 2) Trigger de alta -- SIN instalar todavía (eso es la Migración 2: "create trigger ... execute
-- function public.crear_chofer_desde_invitacion()" sobre auth.users). Se crea ya la función para
-- poder revisarla/probarla por separado del momento en que empieza a correr de verdad.
-- Consume la invitación con el UPDATE de un solo paso (criterio 2): no hay "leer y después
-- escribir" en ningún punto -- la fila gana o no gana la carrera exactamente en esa sentencia.
create or replace function public.crear_chofer_desde_invitacion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_meta jsonb := new.raw_user_meta_data;
  v_invitacion_valor text := upper(regexp_replace(coalesce(v_meta->>'invitacion', ''), '[\s-]', '', 'g'));
  v_invitacion public.invitaciones%rowtype;
  -- Mismo criterio de normalización que spec_normalizacion_dni_matricula_telefono: sin espacios
  -- ni guiones, para que "12345678-A" y "12345678 A" lleguen al mismo valor.
  v_dni text := upper(regexp_replace(coalesce(v_meta->>'dni', ''), '[\s-]', '', 'g'));
  v_nombre text := trim(coalesce(v_meta->>'nombre', ''));
  v_apellidos text := trim(coalesce(v_meta->>'apellidos', ''));
  -- Texto crudo primero, SIN el ::date todavía -- Postgres acepta formatos ambiguos ("01/02/2000")
  -- en un cast directo, interpretándolos según el `datestyle` de la sesión en vez de rechazarlos;
  -- exigir el patrón ISO estricto ANTES de castear evita esa ambigüedad por completo.
  v_fecha_nacimiento_texto text := trim(coalesce(v_meta->>'fecha_nacimiento', ''));
  v_fecha_nacimiento date;
  v_telefono text := trim(coalesce(v_meta->>'telefono', ''));
  -- Solo para discriminar en el catch de más abajo -- hoy choferes tiene tres UNIQUE/PK (pkey,
  -- dni, numero_empleado; confirmado contra pg_constraint antes de escribir esto). numero_empleado
  -- no lo toca este INSERT (queda NULL, y NULL nunca choca contra UNIQUE), pero igual se
  -- discrimina por nombre real de constraint, no se asume a ciegas que "unique_violation" = DNI.
  v_constraint_violado text;
begin
  if v_invitacion_valor = '' then
    raise exception 'invitacion_invalida' using errcode = 'P0001';
  end if;

  -- Un solo UPDATE: gana exactamente una fila entre dos registros simultáneos con la misma
  -- invitación (prueba 8 de la Fase 3). "RETURNING *" evita una segunda consulta.
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

  if length(v_dni) <> 9 then
    raise exception 'dni_invalido' using errcode = 'P0001';
  end if;

  if exists (select 1 from public.choferes c where c.dni = v_dni) then
    raise exception 'dni_duplicado' using errcode = 'P0001';
  end if;

  -- Fecha ausente cuenta como dato incompleto, junto con nombre/apellidos -- todavía no es un
  -- problema de FORMATO (eso es el siguiente chequeo), es simplemente que no vino nada.
  if v_nombre = '' or v_apellidos = '' or v_fecha_nacimiento_texto = '' then
    raise exception 'datos_incompletos' using errcode = 'P0001';
  end if;

  -- Formato ISO estricto antes de castear (ver el comentario de la declaración de la variable).
  if v_fecha_nacimiento_texto !~ '^\d{4}-\d{2}-\d{2}$' then
    raise exception 'fecha_nacimiento_invalida' using errcode = 'P0001';
  end if;

  begin
    v_fecha_nacimiento := v_fecha_nacimiento_texto::date;
  exception when others then
    -- Formato ISO pero fecha inexistente (ej. "2024-02-30") -- el regex de arriba no lo detecta,
    -- el cast sí.
    raise exception 'fecha_nacimiento_invalida' using errcode = 'P0001';
  end;

  if v_fecha_nacimiento < date '1900-01-01' then
    raise exception 'fecha_nacimiento_invalida' using errcode = 'P0001';
  end if;

  -- Europe/Madrid explícito, no current_date -- mismo criterio ("declarar, no heredar") que el
  -- resto del proyecto: current_date depende del timezone de SESIÓN de quien ejecuta, que para
  -- un trigger disparado por el proceso de Auth no tiene por qué ser Madrid.
  if v_fecha_nacimiento > ((now() at time zone 'Europe/Madrid')::date - interval '18 years') then
    raise exception 'edad_minima' using errcode = 'P0001';
  end if;

  if v_telefono !~ '^\+[1-9]\d{7,14}$' then
    raise exception 'telefono_invalido' using errcode = 'P0001';
  end if;

  -- El pre-chequeo "exists (...)" de arriba no cubre dos registros simultáneos con el mismo DNI
  -- (TOCTOU): si ambos lo pasan antes de que cualquiera inserte, el segundo INSERT choca contra
  -- el UNIQUE real de la columna. Envuelto para traducir ese choque al mismo código limpio
  -- "dni_duplicado", en vez de dejar pasar el mensaje crudo de Postgres ("duplicate key value...").
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
      -- Un UNIQUE distinto al de DNI (hoy, por descarte, solo podría ser el pkey o
      -- numero_empleado) es un caso que esta función no entiende -- relanzar el error ORIGINAL
      -- de Postgres, nunca disfrazarlo de "dni_duplicado".
      raise;
    end if;
  end;

  return new;
end;
$$;

-- 3) Estado de cada chofer para /choferes (email/email_confirmed_at desde auth.users) -- evita
-- que el Dashboard llame a la API de administración de Auth una vez por fila.
create or replace function public.listar_estado_choferes()
returns table (
  id uuid,
  email text,
  email_confirmed_at timestamptz,
  revisado_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
    select c.id, u.email::text, u.email_confirmed_at, c.revisado_at
    from public.choferes c
    join auth.users u on u.id = c.id;
end;
$$;

-- ============================================================
-- GRANTS -- consolidados acá al final, no uno por función, para que el estado final de permisos
-- se pueda auditar leyendo un solo bloque en vez de rastrearlo función por función.
-- ============================================================
-- Primero se revoca TODO (incluido de "public", que es lo que cualquier rol nuevo hereda por
-- default) de las cuatro, incluyendo anon/authenticated explícitos -- no alcanza con revocar de
-- "public" si alguna ya tenía un grant directo a esos dos roles por una default privilege de
-- Supabase. Después se concede exactamente lo que cada una necesita.
revoke execute on function public.generar_codigo_invitacion()    from public, anon, authenticated;
revoke execute on function public.crear_chofer_desde_invitacion() from public, anon, authenticated;
revoke execute on function public.listar_estado_choferes()        from public, anon, authenticated;
revoke execute on function public.validar_invitacion(text)        from public, anon, authenticated;

-- validar_invitacion: la pantalla de registro la llama SIN sesión (vía enlace/código, antes de
-- signUp) Y el login también la puede necesitar para un chofer que ya tiene sesión pero pega un
-- código de invitación nueva -- de ahí los dos roles, tal como se pidió.
grant execute on function public.validar_invitacion(text) to anon, authenticated;

-- listar_estado_choferes: solo el Dashboard (service_role), nunca el chofer ni un cliente público.
grant execute on function public.listar_estado_choferes() to service_role;

-- crear_chofer_desde_invitacion: a nadie explícito -- solo la invoca el trigger de la Migración 2
-- (y, siendo "returns trigger", Postgres ni permite llamarla por RPC aunque alguien tuviera
-- EXECUTE). service_role conserva lo que ya tuviera por su propio default privilege: no se
-- revoca ni se concede nada más para ese rol acá.

-- generar_codigo_invitacion: tampoco a nadie explícito -- solo la usa el DEFAULT de la columna
-- "codigo" cuando service_role inserta una invitación nueva desde el Dashboard. service_role
-- conserva su grant por defecto (no está en la lista de REVOKE de arriba), que es justo lo que
-- ese DEFAULT necesita para funcionar.
