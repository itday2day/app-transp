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
create table public.choferes (
  id uuid primary key references auth.users(id) on delete cascade,
  numero_empleado text unique not null,
  nombre text not null,
  apellidos text not null,
  dni text not null,
  fecha_nacimiento date not null,
  pais_nacimiento text not null,
  sexo text not null check (sexo in ('Masculino', 'Femenino', 'Otro')),
  -- activo=false impide el acceso en los dos sistemas a la vez: en la tabla Y baneando la
  -- credencial de Auth (ban_duration, ver dashboard/app/api/choferes/editar/route.ts) — marcar
  -- solo la columna no le impide a Supabase Auth dejarlo entrar.
  activo boolean not null default true,
  -- Se enciende al crear el perfil (contraseña temporal) o al resetearla; la app móvil no deja
  -- pasar de la pantalla de cambio de contraseña obligatorio mientras esté en true, y la apaga
  -- ella misma al completar el cambio (RootNavigator.tsx).
  debe_cambiar_contrasena boolean not null default false,
  created_at timestamptz not null default now()
);

-- ============================================================
-- JORNADAS
-- ============================================================
create table public.jornadas (
  id uuid primary key default gen_random_uuid(),
  chofer_id uuid not null references public.choferes(id) on delete cascade,
  chofer_nombre text not null,
  empresa text not null,
  matricula text not null,
  ruta text not null,
  incidencias text,

  km_inicial numeric not null,
  combustible_inicial smallint not null check (combustible_inicial between 0 and 100),
  foto_tacometro_inicial_url text not null,
  foto_ruta_url text,
  lat_inicial double precision not null,
  lng_inicial double precision not null,
  fecha_check_in timestamptz not null default now(),

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

  estado text not null default 'abierta' check (estado in ('abierta', 'cerrada')),
  created_at timestamptz not null default now()
);

create index jornadas_chofer_id_idx on public.jornadas (chofer_id);
create index jornadas_estado_idx on public.jornadas (estado);
create index jornadas_fecha_check_in_idx on public.jornadas (fecha_check_in desc);

-- ============================================================
-- VEHICULOS (flota)
-- ============================================================
-- Alta/edición/baja se administran desde el Dashboard (app/api/vehiculos/), no por SQL. Sin RLS:
-- solo se lee/escribe con la service_role key, igual que `admins` — la app móvil no toca esta
-- tabla en esta etapa. jornadas.matricula sigue siendo texto suelto; enlazar la jornada a un
-- vehiculo_id es una segunda etapa deliberadamente fuera de esta.
create table public.vehiculos (
  id uuid primary key default gen_random_uuid(),
  matricula text not null,
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

-- ============================================================
-- STORAGE (fotos de evidencias: tacómetro inicial/final, hoja de ruta)
-- ============================================================
insert into storage.buckets (id, name, public)
values ('evidencias', 'evidencias', true)
on conflict (id) do nothing;

create policy "lectura publica de evidencias"
  on storage.objects for select
  using (bucket_id = 'evidencias');

create policy "chofer autenticado sube evidencias"
  on storage.objects for insert
  with check (bucket_id = 'evidencias' and auth.role() = 'authenticated');

-- ============================================================
-- REALTIME (para el mapa en vivo del Dashboard)
-- ============================================================
alter publication supabase_realtime add table public.ubicaciones_tracking;
alter publication supabase_realtime add table public.jornadas;
