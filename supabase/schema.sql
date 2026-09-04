-- Esquema inicial de app-transp para Supabase (Postgres + PostGIS + Auth + Storage).
-- Ejecutar completo en el SQL Editor de un proyecto nuevo, en orden de arriba a abajo.

create extension if not exists postgis;

-- ============================================================
-- CHOFERES
-- ============================================================
-- id = mismo uuid que auth.users.id (Supabase Auth). Los choferes se
-- autentican con numeroEmpleado, que se mapea a un correo sintético
-- "{numeroEmpleado}@choferes.app-transp.internal" al crear el usuario
-- en Auth (ver notas de integración en el cliente).
create table public.choferes (
  id uuid primary key references auth.users(id) on delete cascade,
  numero_empleado text unique not null,
  nombre text not null,
  apellidos text not null,
  dni text not null,
  fecha_nacimiento date not null,
  pais_nacimiento text not null,
  sexo text not null check (sexo in ('Masculino', 'Femenino', 'Otro')),
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

  estado text not null default 'abierta' check (estado in ('abierta', 'cerrada')),
  created_at timestamptz not null default now()
);

create index jornadas_chofer_id_idx on public.jornadas (chofer_id);
create index jornadas_estado_idx on public.jornadas (estado);
create index jornadas_fecha_check_in_idx on public.jornadas (fecha_check_in desc);

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
