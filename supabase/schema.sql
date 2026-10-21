-- Esquema inicial de app-transp para Supabase (Postgres + PostGIS + Auth + Storage).
-- Ejecutar completo en el SQL Editor de un proyecto nuevo, en orden de arriba a abajo.
--
-- ⚠️ El Dashboard tipa sus dos `createClient<Database>(...)` (dashboard/lib/supabase/client.ts
-- y server.ts) contra `dashboard/lib/supabase/database.types.ts`, generado desde la base REAL
-- (2026-09-22, cierra la deuda técnica que documentaba esto como pendiente). Ese archivo
-- HAY QUE REGENERARLO cada vez que se modifique una tabla acá abajo — es un solo comando,
-- corrido desde `dashboard/`:
--
--     npm run types:supabase
--
-- Un `Database` desactualizado es PEOR que no tenerlo: el compilador aprueba con confianza una
-- columna que ya no existe y rechaza una que sí existe — no es una advertencia que se pueda
-- ignorar "por ahora". Si migrás el esquema (un archivo `schema_vN_*.sql` nuevo, o un cambio
-- directo en el SQL Editor), regenerar es el último paso de esa migración, no un aparte.
--
-- Esta base tiene migraciones incrementales fuera de este archivo (`schema_v2` a `schema_v7` en
-- este mismo directorio) — cada una queda como documentación histórica, sin borrarse, aunque sus
-- cambios de columna ya estén plegados acá abajo (mismo criterio que ya existía para
-- `schema_v3_combustible_porcentaje.sql` y `schema_v4_fotos_incidencia.sql`; `schema_v5` se plegó
-- recién el 2026-09-22, después de confirmar con `npm run types:supabase` que este archivo venía
-- desactualizado en esas 4 columnas — ver `contexto_proyecto.md` §4). Si este archivo es tu única
-- referencia del esquema, verificá contra `npm run types:supabase` antes de confiar en él a
-- ciegas — es una representación que puede volver a quedar atrás, la base real siempre manda.

create extension if not exists postgis;
-- gen_random_bytes() (sección INVITACIONES, Hallazgo #51) la necesita -- instalada por defecto
-- en este proyecto, pero este archivo se piensa para un proyecto nuevo, no hay que asumirlo.
create extension if not exists pgcrypto schema extensions;

-- ============================================================
-- CHOFERES
-- ============================================================
-- id = mismo uuid que auth.users.id (Supabase Auth). Los choferes se
-- autentican con numeroEmpleado, que se mapea a un correo sintético al crear el usuario en
-- Auth. ⚠️ Corrección (2026-09-23): este comentario decía
-- "{numeroEmpleado}@choferes.app-transp.internal" — no es la cadena real. El formato real,
-- confirmado contra src/services/authService.ts (móvil) y dashboard/lib/choferes.ts
-- (Dashboard, que la copia con este mismo costo escrito en los dos lados — ver
-- contexto_proyecto.md §4, spec_alta_choferes_dashboard.md): "apptransp.chofer.{numeroEmpleado}.f83a1c@gmail.com"
-- (dominio gmail.com real porque Supabase Auth rechaza dominios inventados; nunca se le
-- manda nada a esa dirección, "Confirm email" está desactivado).
--
-- Alta/edición/baja/reseteo de contraseña se administran desde el Dashboard
-- (dashboard/app/api/choferes/) — el registro propio desde la app móvil se deshabilitó.
-- dni: único, y desde schema_v14_normalizacion_dni_matricula_telefono.sql se guarda siempre ya
-- normalizado (mayúsculas, sin espacios ni guiones -- ver normalizarDni() en
-- dashboard/lib/choferes.ts). Desde schema_v16_check_dni_9_caracteres.sql, además, CHECK de
-- longitud = 9 (DNI/NIE español) validado -- solo el largo, no el formato (8 dígitos + letra):
-- hay un NIE real en la base (letra + 7 dígitos + letra) que un formato estricto rechazaría.
-- telefono: nullable -- no se le exige retroactivo a los choferes ya cargados antes de esa
-- migración; el Dashboard es el que exige completarlo en el alta de un chofer nuevo desde ahí.
-- Desde schema_v15_telefono_e164.sql, formato E.164 (CHECK validado de entrada -- las 5 filas
-- reales tenían telefono = null al aplicarlo, sin necesidad de NOT VALID). pais_nacimiento sigue
-- siendo texto libre a nivel de base (el Dashboard lo restringe a una lista fija desde esa misma
-- migración, ver PAISES en dashboard/lib/paises.ts, pero no se migran los valores ya cargados).
-- numero_empleado/pais_nacimiento/sexo: NULL-ables desde schema_v19_invitaciones_alta_choferes.sql
-- (Hallazgo #51) -- el alta por invitación no los pide. Se conservan (con su UNIQUE/CHECK) solo
-- por los choferes de prueba creados antes de ese hallazgo; se eliminan en el barrido posterior
-- a la segunda presentación.
create table public.choferes (
  id uuid primary key references auth.users(id) on delete cascade,
  numero_empleado text unique,
  nombre text not null,
  apellidos text not null,
  dni text not null unique check (length(dni) = 9),
  fecha_nacimiento date not null,
  pais_nacimiento text,
  sexo text check (sexo in ('Masculino', 'Femenino', 'Otro')),
  telefono text check (telefono is null or telefono ~ '^\+[1-9]\d{7,14}$'),
  -- activo=false impide el acceso en los dos sistemas a la vez: en la tabla Y baneando la
  -- credencial de Auth (ban_duration, ver dashboard/app/api/choferes/editar/route.ts) — marcar
  -- solo la columna no le impide a Supabase Auth dejarlo entrar.
  activo boolean not null default true,
  -- Se enciende al crear el perfil (contraseña temporal) o al resetearla; la app móvil no deja
  -- pasar de la pantalla de cambio de contraseña obligatorio mientras esté en true, y la apaga
  -- ella misma al completar el cambio (RootNavigator.tsx).
  debe_cambiar_contrasena boolean not null default false,
  created_at timestamptz not null default now(),
  -- NULL = etiqueta "Nuevo — sin revisar" en /choferes. No bloquea nada: el chofer puede trabajar
  -- desde que confirma su correo: es solo informativo para Administración (criterio 21). Los 5
  -- choferes de prueba existentes antes de este hallazgo se marcaron revisados en la misma
  -- migración que agregó esta columna.
  revisado_at timestamptz,
  revisado_por text
  -- empresa_defecto_id/ruta_defecto_id (Hallazgo #51, D3 = b) se agregan más abajo con ALTER
  -- TABLE, después de que exista el catálogo de empresas/rutas -- referenciarlas acá arriba
  -- rompería una ejecución de este archivo de punta a punta en un proyecto nuevo (choferes se
  -- crea antes que esas tablas).
);

-- ============================================================
-- JORNADAS
-- ============================================================
create table public.jornadas (
  id uuid primary key default gen_random_uuid(),
  chofer_id uuid not null references public.choferes(id) on delete cascade,
  chofer_nombre text not null,
  empresa text not null,
  -- Desde schema_v14_normalizacion_dni_matricula_telefono.sql, 7 caracteres, ya normalizada
  -- (mayúsculas, sin espacios ni guiones -- ver normalizarMatricula() en dashboard/lib/vehiculos.ts).
  -- CHECK agregado NOT VALID contra la base real (no exige corregir jornadas ya cargadas) -- en un
  -- proyecto nuevo, sin datos legado, no hace falta ese NOT VALID.
  matricula text not null check (length(matricula) = 7),
  ruta text not null,
  incidencias text,

  km_inicial numeric not null,
  -- opcional desde schema_v25_combustible_inicial_opcional.sql (spec_ajustes_previos_apk.md, A1)
  combustible_inicial smallint check (combustible_inicial between 0 and 100),
  -- foto_tacometro_inicial_url/lat_inicial/lng_inicial: nullable desde
  -- schema_v13_jornadas_creadas_admin.sql (spec_rutas_asignadas_admin.md) -- una jornada cargada
  -- por Administración desde el Dashboard no tiene foto real de tacómetro ni GPS real.
  foto_tacometro_inicial_url text,
  foto_ruta_url text,
  lat_inicial double precision,
  lng_inicial double precision,
  fecha_check_in timestamptz not null default now(),
  -- Incidencia estructurada del check-in (schema_v12_incidencia_checkin.sql,
  -- spec_incidencia_en_checkin.md) — mismo patrón que la incidencia de check-out más abajo,
  -- independiente de ella (una jornada puede tener 0, 1 o 2). `incidencias` (arriba) queda de
  -- solo lectura para jornadas viejas, ya no se escribe desde el check-in.
  -- schema_v18_tipos_incidencia_checkin.sql (Hallazgo #50): el check-in ofrece sus propios 6 tipos
  -- (pensados para la carga) -- 'Tráfico/Retraso'/'Cliente ausente' siguen siendo valores válidos
  -- acá (filas históricas, ampliación solo aditiva) pero ya no se ofrecen en la app.
  tuvo_incidencia_checkin boolean,
  tipo_incidencia_checkin text check (
    tipo_incidencia_checkin in (
      'Avería vehículo', 'Tráfico/Retraso', 'Cliente ausente', 'Otro',
      'Mercancía dañada', 'Faltante/Sobrante', 'Temperatura fuera de rango', 'Pedido/Documentación'
    )
  ),
  detalle_incidencia_checkin text,
  fotos_incidencia_checkin text[],

  km_final numeric,
  combustible_final smallint check (combustible_final between 0 and 100),
  foto_tacometro_final_url text,
  lat_final double precision,
  lng_final double precision,
  fecha_check_out timestamptz,
  tuvo_incidencia boolean,
  tipo_incidencia text check (tipo_incidencia in ('Avería vehículo', 'Tráfico/Retraso', 'Cliente ausente', 'Otro')),
  detalle_incidencia text,
  fotos_incidencia text[],

  -- Auditoría de correcciones manuales desde el Dashboard (POST
  -- /api/jornadas/editar). editado_por es texto libre con el nombre/correo
  -- del admin autenticado (lib/auth.ts), no una FK a admins: se resolvió
  -- así antes de que existieran cuentas individuales (ver
  -- schema_v7_admins.sql) y no se migró después.
  fue_editado boolean not null default false,
  editado_por text,
  editado_en timestamptz,
  motivo_edicion text,
  -- Qué campos tocó la ÚLTIMA corrección del administrador, y cuándo — lo escribe el trigger
  -- jornadas_proteger_correcciones_admin_trigger más abajo, nunca un Route Handler a mano (ver
  -- ese trigger para el razonamiento completo: Hallazgo #28, spec_correccion_gana_dashboard.md).
  campos_editados_admin jsonb not null default '{}'::jsonb,

  -- Jornada cargada por Administración desde el Dashboard (spec_rutas_asignadas_admin.md), nunca
  -- por el check-in del chofer en el celular -- mismo patrón de auditoría que fue_editado/
  -- editado_por de arriba, en vez de un tercer valor de `estado` que obligaría a revisar cada
  -- lugar del código que hoy asume que solo hay "abierta"/"cerrada".
  creada_por_admin boolean not null default false,
  creada_por text,

  estado text not null default 'abierta' check (estado in ('abierta', 'cerrada')),
  created_at timestamptz not null default now()
);

create index jornadas_chofer_id_idx on public.jornadas (chofer_id);
create index jornadas_estado_idx on public.jornadas (estado);
create index jornadas_fecha_check_in_idx on public.jornadas (fecha_check_in desc);

-- Protege campo por campo una corrección del administrador contra una subida ciega de la app —
-- ver el razonamiento completo (por qué jsonb, por qué auth.role(), por qué fotos_incidencia es
-- la excepción) en supabase/schema_v10_correccion_admin_gana.sql, que aplica esto mismo contra la
-- base real.
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

-- ============================================================
-- VEHICULOS (flota)
-- ============================================================
-- Alta/edición/baja se administran desde el Dashboard (app/api/vehiculos/), no por SQL. Sin RLS:
-- solo se lee/escribe con la service_role key, igual que `admins` — la app móvil no toca esta
-- tabla en esta etapa. jornadas.matricula sigue siendo texto suelto; enlazar la jornada a un
-- vehiculo_id es una segunda etapa deliberadamente fuera de esta.
create table public.vehiculos (
  id uuid primary key default gen_random_uuid(),
  -- Desde schema_v14_normalizacion_dni_matricula_telefono.sql, 7 caracteres, ya normalizada --
  -- mismo criterio que jornadas.matricula arriba.
  matricula text not null check (length(matricula) = 7),
  tipo_propiedad text not null check (tipo_propiedad in ('propio', 'alquilado', 'autonomo')),
  capacidad_tanque_litros numeric check (capacidad_tanque_litros > 0),
  marca text,
  modelo text,
  anio smallint check (anio between 1970 and 2100),
  estado text not null default 'activo' check (estado in ('activo', 'baja')),
  created_at timestamptz not null default now()
);

-- Único sobre la matrícula NORMALIZADA (mayúsculas, sin caracteres no alfanuméricos), vale
-- también para los vehículos de baja — ver el razonamiento completo en
-- schema_v8_flota_vehiculos.sql, que aplica esto mismo contra la base real.
create unique index vehiculos_matricula_normalizada
  on public.vehiculos (upper(regexp_replace(matricula, '[^a-zA-Z0-9]', '', 'g')));

-- ============================================================
-- TRACKING GPS (pings de posición en vivo, telemetría efímera)
-- ============================================================
create table public.ubicaciones_tracking (
  id bigserial primary key,
  chofer_id uuid not null references public.choferes(id) on delete cascade,
  jornada_ids uuid[] not null default '{}',
  ubicacion geography(Point, 4326) not null,
  velocidad_kmh numeric,
  "timestamp" timestamptz not null,
  created_at timestamptz not null default now()
);

create index ubicaciones_tracking_chofer_idx on public.ubicaciones_tracking (chofer_id, "timestamp" desc);
create index ubicaciones_tracking_geom_idx on public.ubicaciones_tracking using gist (ubicacion);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
-- El Dashboard admin usa la service_role key desde el servidor (Next.js
-- Route Handlers), que ignora RLS por diseño de Supabase — no hace falta
-- una tabla de roles/admins para el MVP. Estas políticas solo cubren el
-- acceso de la app móvil (cada chofer ve y escribe únicamente lo suyo).

alter table public.choferes enable row level security;
alter table public.jornadas enable row level security;
alter table public.ubicaciones_tracking enable row level security;

create policy "chofer lee su propio perfil"
  on public.choferes for select
  using (auth.uid() = id);

create policy "chofer actualiza su propio perfil"
  on public.choferes for update
  using (auth.uid() = id);

create policy "chofer lee sus jornadas"
  on public.jornadas for select
  using (auth.uid() = chofer_id);

create policy "chofer crea sus jornadas"
  on public.jornadas for insert
  with check (auth.uid() = chofer_id);

create policy "chofer actualiza sus jornadas"
  on public.jornadas for update
  using (auth.uid() = chofer_id);

create policy "chofer inserta su propio tracking"
  on public.ubicaciones_tracking for insert
  with check (auth.uid() = chofer_id);

create policy "chofer lee su propio tracking"
  on public.ubicaciones_tracking for select
  using (auth.uid() = chofer_id);

-- Vistas de solo lectura para el Dashboard: última posición conocida de cada chofer, y el
-- histórico completo de pings, con lat/lng planos en vez del tipo geography (más simple de
-- consumir desde el cliente). Reemplazan al endpoint del mock /tracking/ultimas-posiciones
-- (schema_v2_tracking_auth.sql, schema_v6_ruta_jornada.sql).
--
-- ⚠️ Hallazgo #52 (schema_v20_seguridad_vistas_tracking.sql): security_invoker = true desde la
-- creación, y sin grant a anon/authenticated (revoke explícito, no solo "no conceder" -- los
-- privilegios por defecto de Supabase conceden ALL en toda tabla/vista nueva de public a esos dos
-- roles, así que omitir el grant no alcanza). Sin esto, las dos vistas corren con los privilegios
-- de su dueño y se saltan el RLS de ubicaciones_tracking de arriba.
create view public.ultimas_posiciones
  with (security_invoker = true)
  as
select distinct on (chofer_id)
  chofer_id,
  jornada_ids,
  ST_Y(ubicacion::geometry) as lat,
  ST_X(ubicacion::geometry) as lng,
  velocidad_kmh,
  "timestamp"
from public.ubicaciones_tracking
order by chofer_id, "timestamp" desc;

revoke all on public.ultimas_posiciones from anon, authenticated;

create view public.ubicaciones_tracking_planas
  with (security_invoker = true)
  as
select
  chofer_id,
  jornada_ids,
  ST_Y(ubicacion::geometry) as lat,
  ST_X(ubicacion::geometry) as lng,
  velocidad_kmh,
  "timestamp"
from public.ubicaciones_tracking;

revoke all on public.ubicaciones_tracking_planas from anon, authenticated;

-- ============================================================
-- CATÁLOGO DE EMPRESAS Y RUTAS (schema_v17_catalogo_empresas_rutas.sql, Hallazgo #48)
-- ============================================================
-- jornadas.empresa/ruta SIGUEN siendo texto libre, sin FK a este catálogo -- alimenta solo las
-- listas de selección (Dashboard y app) y evita variantes nuevas hacia adelante, nunca reescribe
-- el historial. Empresas Y rutas en MAYÚSCULAS (CHECK validado en las dos -- el seed ya cumple;
-- el de rutas se agregó después de aplicar la migración original, ver el UPDATE + ALTER TABLE
-- documentado en schema_v17_catalogo_empresas_rutas.sql). Solo escribe el Dashboard
-- (service_role, bypassa RLS); los choferes solo leen.
create table public.empresas (
  id uuid primary key default gen_random_uuid(),
  nombre text not null check (nombre = upper(nombre)),
  activo boolean not null default true,
  created_at timestamptz not null default now()
);

create unique index empresas_nombre_normalizado on public.empresas (lower(nombre));

create table public.rutas (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id),
  nombre text not null check (nombre = upper(nombre)),
  activo boolean not null default true,
  created_at timestamptz not null default now()
);

create unique index rutas_empresa_nombre_normalizado on public.rutas (empresa_id, lower(nombre));

alter table public.empresas enable row level security;
alter table public.rutas enable row level security;

create policy "choferes leen el catalogo de empresas"
  on public.empresas for select
  to authenticated
  using (true);

create policy "choferes leen el catalogo de rutas"
  on public.rutas for select
  to authenticated
  using (true);

-- Hallazgo #51 (D3 = b): recién acá, con empresas/rutas ya creadas -- ver el comentario en la
-- definición de la tabla choferes, más arriba, sobre por qué no van en el CREATE TABLE.
alter table public.choferes
  add column empresa_defecto_id uuid references public.empresas(id),
  add column ruta_defecto_id uuid references public.rutas(id);

-- ============================================================
-- INVITACIONES (schema_v19_invitaciones_alta_choferes.sql, Hallazgo #51)
-- ============================================================
-- Esta sección incluye el trigger crear_chofer_desde_invitacion() y el cierre de policies de
-- choferes (Migración 2, más abajo): aplicado en producción el 2026-10-16
-- (schema_v23_trigger_auth_users.sql, por el SQL Editor -- igual que schema_v22, no figura en
-- list_migrations). Lo aplicado en producción hoy es la Migración 1
-- (schema_v19_invitaciones_alta_choferes.sql: la tabla invitaciones, las columnas nuevas de
-- choferes, y validar_invitacion()/generar_codigo_invitacion()/listar_estado_choferes()) MÁS
-- schema_v21_alta_asistida_dni_atado.sql (ajuste del Hallazgo #51, 2026-10-14: las 6 columnas de
-- datos personales de invitaciones, su CHECK de normalización, la función
-- obtener_datos_invitacion(), y el cuerpo ya actualizado -- con DNI atado y borrado al consumir --
-- de crear_chofer_desde_invitacion()) MÁS schema_v23_trigger_auth_users.sql (Migración 2: el
-- trigger sobre auth.users y el cierre de policies/privilegios de choferes).
--
-- Alta de choferes por invitación en vez del alta con contraseña temporal del Dashboard: el
-- chofer se registra solo (signUp público de Supabase) con una invitación generada desde
-- /choferes; un trigger en auth.users (Migración 2, instalada -- ver más abajo) valida y consume
-- la invitación y crea la fila de choferes en la misma transacción. RLS activa
-- SIN ninguna policy para anon/authenticated: ni siquiera pueden intentar un select (con RLS
-- encendida y cero policies, esos dos roles no bypasean nada). Solo service_role (que bypasea
-- RLS) y las funciones security definer de abajo (dueñas de la tabla, también bypasean) la tocan.
--
-- La función del código va PRIMERO, antes de la tabla: la usa como DEFAULT de la columna
-- "codigo" -- en orden inverso, una ejecución de este archivo de punta a punta en un proyecto
-- nuevo fallaría ("function public.generar_codigo_invitacion() does not exist").
--
-- Un DEFAULT de columna no admite una subconsulta con FROM (error real de Postgres al probarlo:
-- "cannot use subquery in DEFAULT expression") -- de ahí esta función chica en vez de calcular
-- el código en línea. "random()" no es criptográficamente seguro (es un PRNG común, no un
-- CSPRNG) -- un código de invitación de 8 caracteres es justo el tipo de valor que alguien
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

create table public.invitaciones (
  id uuid primary key default gen_random_uuid(),
  -- 32 hex de gen_random_bytes(16) -- pgcrypto ya está instalada, en el esquema "extensions" (no
  -- "public"): calificado explícito para no depender del search_path.
  token text not null unique default encode(extensions.gen_random_bytes(16), 'hex'),
  -- 8 caracteres del alfabeto sin ambiguos (sin I/O/0/1) -- código de respaldo para cuando el
  -- enlace profundo no abre la app.
  codigo text not null unique default public.generar_codigo_invitacion(),
  empresa_id uuid references public.empresas(id),
  ruta_id uuid references public.rutas(id),
  -- Mismo criterio que jornadas.editado_por/creada_por: texto libre con el nombre/correo del
  -- admin autenticado, no una FK a admins.
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
  -- ON DELETE SET NULL, no una FK sin acción: "Anular registro sin confirmar" borra el usuario
  -- de Auth, y esa fila de invitaciones no tiene por qué desaparecer ni bloquear el borrado --
  -- queda como "usada" igual (usada_at se conserva), solo se pierde la referencia a quién la usó.
  usada_por uuid references auth.users(id) on delete set null,
  -- Datos personales prellenados (ajuste del Hallazgo #51, schema_v21_alta_asistida_dni_atado.sql,
  -- 2026-10-14): todas opcionales -- una invitación "abierta" (como en el Bloque B original) las
  -- deja en NULL, el chofer completa todo él mismo. Se anulan al consumirse, al revocarse y en las
  -- vencidas (ver crear_chofer_desde_invitacion() más abajo y el Dashboard) -- nunca quedan
  -- colgadas una vez que ya no hacen falta.
  dni text,
  nombre text,
  apellidos text,
  telefono text,
  email text,
  fecha_nacimiento date,
  -- El trigger compara v_dni <> v_invitacion.dni con comparación EXACTA, sin volver a normalizar
  -- del lado de la invitación -- sin este CHECK, un dni guardado en minúsculas o con espacios
  -- dejaría al chofer sin poder registrarse nunca. Mismo criterio que choferes.dni (CHECK de 9
  -- caracteres, schema_v16_check_dni_9_caracteres.sql).
  constraint invitaciones_dni_normalizado_check
    check (dni is null or (dni = upper(regexp_replace(dni, '[\s-]', '', 'g')) and length(dni) = 9))
);

alter table public.invitaciones enable row level security;

-- Explícito, no solo confiado a "RLS activa + cero policies" -- un REVOKE a la vista documenta
-- la intención y no depende de que el comportamiento por defecto de Postgres/Supabase se
-- mantenga igual hacia adelante.
revoke all on public.invitaciones from anon, authenticated;

create index invitaciones_pendientes_idx on public.invitaciones (created_at desc)
  where usada_at is null and revocada_at is null;

-- Validación SIN consumir -- la pantalla de registro la llama antes de mostrar el formulario y
-- antes de llamar a signUp. Nunca devuelve token/código/id/creada_por: solo lo que el chofer
-- necesita ver. Acepta token O código, sin distinguir cuál (normalizado a mayúsculas y sin
-- espacios/guiones).
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

-- Datos personales prellenados -- acepta token de 32 hex O código de 8 caracteres
-- (spec_precarga_con_codigo_8_caracteres.md, 2026-10-20, migración obtener_datos_por_codigo).
-- Antes (schema_v21_alta_asistida_dni_atado.sql, Hallazgo #51) solo aceptaba el token -- con el
-- código de respaldo (el que existe para cuando falla el enlace) el formulario quedaba vacío.
-- Mismo criterio de "nada distinto" que antes: un valor mal formado, un código o token
-- inexistente, vencido, usado o revocado cae en el mismo "nada" (cero filas) -- nunca se
-- distingue por la forma de la respuesta si la invitación existe. No devuelve token, código, id
-- ni creada_por.
create or replace function public.obtener_datos_invitacion(p_token text)
returns table (
  dni text,
  nombre text,
  apellidos text,
  telefono text,
  email text,
  fecha_nacimiento date
)
language plpgsql
security definer
set search_path = public
as $$
declare
  -- Mismo criterio de limpieza que validar_invitacion(): quita espacios y guiones antes de
  -- decidir nada -- el código de respaldo se suele dictar o copiar con un guion de separación
  -- visual ("ABCD-2345").
  v_limpio text := regexp_replace(coalesce(p_token, ''), '[\s-]', '', 'g');
  v_token text := lower(v_limpio);
  v_codigo text := upper(v_limpio);
  v_fila public.invitaciones%rowtype;
begin
  -- Un valor nunca puede cumplir las dos formas a la vez (32 caracteres contra exactamente 8),
  -- así que el orden if/elsif no es ambiguo -- se prueba primero como token (mismo patrón exacto
  -- que ya usaba esta función), después como código (alfabeto de 32 símbolos de
  -- generar_codigo_invitacion()). Cualquier otro valor (vacío, NULL, mal formado) cae al `return`
  -- de abajo sin tocar la tabla.
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

  if v_fila.id is null then
    return;
  end if;

  return query
    select v_fila.dni, v_fila.nombre, v_fila.apellidos, v_fila.telefono, v_fila.email,
           v_fila.fecha_nacimiento;
end;
$$;

-- Función del trigger de alta (instalada, Migración 2 -- ver el CREATE TRIGGER justo después de
-- esta función). Consume la invitación con un UPDATE de un solo paso: no hay "leer y después
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
  v_dni text := upper(regexp_replace(coalesce(v_meta->>'dni', ''), '[\s-]', '', 'g'));
  v_nombre text := trim(coalesce(v_meta->>'nombre', ''));
  v_apellidos text := trim(coalesce(v_meta->>'apellidos', ''));
  -- Texto crudo primero, SIN el ::date todavía -- Postgres acepta formatos ambiguos
  -- ("01/02/2000") en un cast directo, interpretándolos según el datestyle de la sesión en vez
  -- de rechazarlos; exigir el patrón ISO estricto antes de castear evita esa ambigüedad.
  v_fecha_nacimiento_texto text := trim(coalesce(v_meta->>'fecha_nacimiento', ''));
  v_fecha_nacimiento date;
  v_telefono text := trim(coalesce(v_meta->>'telefono', ''));
  -- Solo para discriminar en el catch de más abajo -- choferes tiene tres UNIQUE/PK (pkey, dni,
  -- numero_empleado). numero_empleado no lo toca este INSERT (queda NULL, y NULL nunca choca
  -- contra UNIQUE), pero igual se discrimina por nombre real de constraint, no se asume a ciegas
  -- que "unique_violation" = DNI.
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

  -- DNI atado (ajuste del Hallazgo #51, schema_v21_alta_asistida_dni_atado.sql, 2026-10-14): si
  -- la invitación trae su propio DNI, el registro tiene que usar EXACTAMENTE ese DNI -- no
  -- alcanza con que el DNI enviado sea válido o nuevo, tiene que ser el mismo que el encargado ya
  -- cargó al invitar. Va INMEDIATAMENTE después de confirmar la invitación (primero la
  -- invitación, después el resto) y ANTES del chequeo de formato/duplicado de más abajo, porque
  -- es una validación DE LA INVITACIÓN, no del dato en sí. Si la invitación no trae dni (abierta,
  -- como en el Bloque B original), esta condición nunca se cumple y nada cambia.
  if v_invitacion.dni is not null and v_dni <> v_invitacion.dni then
    raise exception 'dni_no_coincide' using errcode = 'P0001';
  end if;

  if length(v_dni) <> 9 then
    raise exception 'dni_invalido' using errcode = 'P0001';
  end if;

  if exists (select 1 from public.choferes c where c.dni = v_dni) then
    raise exception 'dni_duplicado' using errcode = 'P0001';
  end if;

  -- Fecha ausente cuenta como dato incompleto, junto con nombre/apellidos -- todavía no es un
  -- problema de formato (eso es el siguiente chequeo), es simplemente que no vino nada.
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

  -- Europe/Madrid explícito, no current_date -- current_date depende del timezone de SESIÓN de
  -- quien ejecuta, que para un trigger disparado por el proceso de Auth no tiene por qué ser
  -- Madrid.
  if v_fecha_nacimiento > ((now() at time zone 'Europe/Madrid')::date - interval '18 years') then
    raise exception 'edad_minima' using errcode = 'P0001';
  end if;

  if v_telefono !~ '^\+[1-9]\d{7,14}$' then
    raise exception 'telefono_invalido' using errcode = 'P0001';
  end if;

  -- El pre-chequeo "exists (...)" de arriba no cubre dos registros simultáneos con el mismo DNI
  -- (TOCTOU): si ambos lo pasan antes de que cualquiera inserte, el segundo INSERT choca contra
  -- el UNIQUE real de la columna. Envuelto para traducir ese choque al mismo código limpio
  -- "dni_duplicado", en vez de dejar pasar el mensaje crudo de Postgres.
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

  -- Borrado de datos personales al consumirse (ajuste del Hallazgo #51,
  -- schema_v21_alta_asistida_dni_atado.sql, 2026-10-14): ya viven en choferes (recién insertados
  -- arriba) -- no hace falta conservarlos en la invitación. Misma transacción que el INSERT.
  update public.invitaciones
  set dni = null, nombre = null, apellidos = null, telefono = null, email = null,
      fecha_nacimiento = null
  where id = v_invitacion.id;

  return new;
end;
$$;

-- Migración 2 (schema_v23_trigger_auth_users.sql, aplicada el 2026-10-16): el enlace que faltaba
-- -- sin esto, la función de arriba existía y estaba probada, pero nada la ejecutaba. No necesita
-- GRANT EXECUTE para nadie (ver el revoke de más abajo): un trigger se dispara por el propio
-- mecanismo de Postgres, no por una llamada SQL explícita de quien hace el INSERT.
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.crear_chofer_desde_invitacion();

-- Estado de cada chofer para /choferes (email/email_confirmed_at desde auth.users) -- evita que
-- el Dashboard llame a la API de administración de Auth una vez por fila.
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

-- Grants consolidados: primero se revoca TODO (incluido "public") de las cinco, incluyendo
-- anon/authenticated explícitos, y después se concede exactamente lo que cada una necesita.
revoke execute on function public.generar_codigo_invitacion()    from public, anon, authenticated;
revoke execute on function public.crear_chofer_desde_invitacion() from public, anon, authenticated;
revoke execute on function public.listar_estado_choferes()        from public, anon, authenticated;
revoke execute on function public.validar_invitacion(text)        from public, anon, authenticated;
revoke execute on function public.obtener_datos_invitacion(text)  from public, anon, authenticated;

-- validar_invitacion: la pantalla de registro la llama SIN sesión (vía enlace/código, antes de
-- signUp) Y el login también la puede necesitar para un chofer que ya tiene sesión pero pega un
-- código de invitación nueva.
grant execute on function public.validar_invitacion(text) to anon, authenticated;

-- obtener_datos_invitacion: la app la llama SIN sesión, con el token del enlace, para prellenar
-- el formulario de registro (ajuste del Hallazgo #51, 2026-10-14) -- mismo motivo que
-- validar_invitacion, antes de signUp.
grant execute on function public.obtener_datos_invitacion(text) to anon, authenticated;

-- listar_estado_choferes: solo el Dashboard (service_role).
grant execute on function public.listar_estado_choferes() to service_role;

-- crear_chofer_desde_invitacion y generar_codigo_invitacion: a nadie explícito -- la primera solo
-- la invoca el trigger de la Migración 2 (y, siendo "returns trigger", Postgres ni permite
-- llamarla por RPC); la segunda solo la usa el DEFAULT de la columna "codigo". service_role
-- conserva en las dos lo que ya tuviera por su propio default privilege (no están en la lista de
-- REVOKE de arriba para ese rol), que es justo lo que necesitan para funcionar.

-- Migración 2 (schema_v23_trigger_auth_users.sql, aplicada el 2026-10-16): cierre de privilegios
-- de choferes frente a anon/authenticated -- el trigger de arriba es la única vía de alta, ya no
-- hace falta que ningún rol de sesión pueda insertar. anon pierde INSERT/UPDATE/DELETE/TRUNCATE
-- por completo (nunca tuvo una policy que lo dejara pasar, pero ahora tampoco tiene el privilegio
-- de tabla). authenticated pierde INSERT/DELETE/TRUNCATE, y su UPDATE queda recortado a la única
-- columna que la app toca con la sesión del chofer (debe_cambiar_contrasena -- ver
-- src/services/authService.ts) en vez de la tabla completa; su SELECT no se toca (lo usa el
-- login). service_role no cambia. v23 se aplicó el 2026-10-16 por el SQL Editor con el registro
-- todavía CERRADO -- antes de aplicar, ese cierre lo confirmó el usuario desde el panel, sin
-- lectura por API; una lectura de GET /auth/v1/settings hecha DESPUÉS de aplicar v23 (y antes de
-- la reapertura) confirmó disable_signup: true. La reapertura de "Allow new users to sign up" fue
-- un paso APARTE, hecho por el usuario en el panel después de verificar el trigger y las policies.
-- Una lectura posterior de GET /auth/v1/settings confirmó disable_signup: false,
-- mailer_autoconfirm: false, phone_autoconfirm: false, y "email" como único proveedor externo en
-- true.
revoke insert, delete, truncate on public.choferes from authenticated;
revoke insert, update, delete, truncate on public.choferes from anon;
revoke update on public.choferes from authenticated;
grant update (debe_cambiar_contrasena) on public.choferes to authenticated;

-- ============================================================
-- STORAGE (fotos de evidencias: tacómetro inicial/final, hoja de ruta)
-- ============================================================
insert into storage.buckets (id, name, public)
values ('evidencias', 'evidencias', true)
on conflict (id) do nothing;

-- builds (Hallazgo #51, ajuste, schema_v22_bucket_builds.sql): bucket público para el .apk de
-- distribución estable (ruta fija "builds/app-transp-latest.apk", que se sobrescribe en cada
-- build nuevo -- lo sube el usuario a mano desde el panel, nunca un script con service_role).
-- Sin policies de storage.objects (un bucket público sirve su URL sin necesitar una; nadie más
-- que quien tiene acceso directo al panel escribe acá).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('builds', 'builds', true, 209715200, array['application/vnd.android.package-archive'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "lectura publica de evidencias"
  on storage.objects for select
  using (bucket_id = 'evidencias');

-- Restringida a la propia carpeta del chofer (bucket evidencias/{choferId}/...) desde
-- schema_v2_tracking_auth.sql -- plegada acá ahora (regla del #23; este archivo venía mintiendo,
-- mostrando la policy original sin esa restricción, encontrado resolviendo el Hallazgo #29).
create policy "chofer sube evidencias en su propia carpeta"
  on storage.objects for insert
  with check (bucket_id = 'evidencias' and (storage.foldername(name))[1] = auth.uid()::text);

-- Permite reintentar una subida cortada a medias: si una foto ya llegó a Storage en un intento
-- anterior, upload(..., {upsert:true}) hace un UPDATE de storage.objects, no un INSERT -- sin esta
-- policy, ese reintento se rechazaba con "new row violates row-level security policy" y la jornada
-- quedaba trabada para siempre (Hallazgo #29, schema_v11_evidencias_reintentables.sql). Misma
-- condición de carpeta que el INSERT, nada de DELETE.
create policy "chofer sobrescribe sus propias evidencias"
  on storage.objects for update
  using (bucket_id = 'evidencias' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'evidencias' and (storage.foldername(name))[1] = auth.uid()::text);

-- ============================================================
-- REALTIME (para el mapa en vivo del Dashboard)
-- ============================================================
alter publication supabase_realtime add table public.ubicaciones_tracking;
alter publication supabase_realtime add table public.jornadas;
