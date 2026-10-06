-- Migración incremental: correr DESPUÉS de schema.sql + v2 a v16, en el SQL Editor / apply_migration.
-- Resuelve spec_catalogo_empresas_rutas.md (Hallazgo #48): catálogo compartido de empresas y
-- rutas en Supabase -- hoy la app tiene una lista fija en el código (src/data/empresas.ts) y el
-- Dashboard dos <Input> de texto libre, sin ninguna fuente única (confirmado en la base real:
-- variantes de mayúsculas ya existentes -- CORNELLA/Hospitallet frente a CORNELLA/Hospitalet,
-- SEUR/BARCELONA frente a COSAEN/Barcelona).
--
-- jornadas.empresa/ruta SIGUEN siendo texto libre, sin FK a este catálogo (decisión del usuario):
-- este catálogo solo alimenta las listas de selección y evita variantes nuevas hacia adelante --
-- no se toca el historial, la sincronización offline de la app ni el Excel exportado. Ninguna fila
-- de jornadas cambia con esta migración.

-- ============================================================
-- EMPRESAS
-- ============================================================
-- CHECK de mayúsculas, validado -- medido contra la base real (upper('ñáéíóúü') = 'ÑÁÉÍÓÚÜ') y con
-- un script en Node (toLocaleUpperCase("es")) que las 19 empresas de src/data/empresas.ts y las 8
-- que aparecen en jornadas reales ya están en mayúsculas, sin ningún cambio al aplicar la función
-- dos veces (idempotente).
create table public.empresas (
  id uuid primary key default gen_random_uuid(),
  nombre text not null check (nombre = upper(nombre)),
  activo boolean not null default true,
  created_at timestamptz not null default now()
);

-- Único por nombre sin distinguir mayúsculas -- aunque el CHECK ya fuerza mayúsculas en nombre,
-- este índice es el que de verdad evita el duplicado (dos intentos de insertar "FREDIST" en la
-- misma fracción de segundo), igual que vehiculos_matricula_normalizada en este mismo archivo.
create unique index empresas_nombre_normalizado on public.empresas (lower(nombre));

-- ============================================================
-- RUTAS
-- ============================================================
-- Igual que empresas, en MAYÚSCULAS (regla confirmada: TODA la información de empresa Y ruta se
-- guarda en MAYÚSCULAS -- la decisión original de esta migración, de que las rutas conservaban lo
-- escrito, quedó revertida antes de cerrar el Hallazgo #48, sin llegar a usarse en producción).
create table public.rutas (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id),
  nombre text not null check (nombre = upper(nombre)),
  activo boolean not null default true,
  created_at timestamptz not null default now()
);

create unique index rutas_empresa_nombre_normalizado on public.rutas (empresa_id, lower(nombre));

-- ============================================================
-- RLS -- solo lectura para choferes autenticados, ninguna política de escritura (solo escribe el
-- Dashboard, con service_role, que bypassa RLS -- mismo patrón que el resto de altas de
-- Administración).
-- ============================================================
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

-- ============================================================
-- SEED -- las 19 empresas de src/data/empresas.ts (ya en mayúsculas, confirmado, 0 cambian).
-- ============================================================
insert into public.empresas (nombre) values
  ('AMAZON'), ('AMETLLER'), ('ASSOLIM'), ('BTS-MAKRO'), ('COSAEN'), ('CULLIGAN'),
  ('EUROPATRY'), ('FREDIST'), ('FRIMAN'), ('IKEA BADALONA'), ('JOPRIMSA'),
  ('KEN FOODS - ALCORCON'), ('LOGIFRIO'), ('PRO A PRO HOSTELERIA'), ('PURATOS'),
  ('SABOR PROVISIONS'), ('SERTRANS'), ('SEUR'), ('VAMOS A COMER')
on conflict do nothing;

-- Rutas de RUTAS_POR_EMPRESA (src/data/empresas.ts: FREDIST y BTS-MAKRO, 6 rutas) + las rutas
-- históricas de las 27 jornadas reales que no están ya cubiertas por esas 6 (⚠️ punto 1 de la
-- Fase 1, aprobado por el usuario: se siembran tal cual estaban escritas en jornadas.ruta, PERO
-- en MAYÚSCULAS -- "Fhxc" se siembra como FHXC, no se corrige el error de tipeo, solo el caso).
insert into public.rutas (empresa_id, nombre)
select e.id, upper(r.nombre)
from (values
  ('FREDIST', 'Barcelona'), ('FREDIST', 'Valles Oriental'), ('FREDIST', 'Mataro'), ('FREDIST', 'Terrasa'),
  ('BTS-MAKRO', 'Sede Prat'), ('BTS-MAKRO', 'Sede Tarragona'),
  ('AMAZON', 'Diagonal'), ('AMAZON', 'Fhxc'), ('AMAZON', 'Hospitalet'),
  ('AMETLLER', 'Nueva'),
  ('COSAEN', 'Barcelona'),
  ('CULLIGAN', 'CORNELLA'), ('CULLIGAN', 'Hospitallet'),
  ('KEN FOODS - ALCORCON', 'Erlizo'),
  ('SEUR', 'BARCELONA')
) as r(empresa_nombre, nombre)
join public.empresas e on e.nombre = r.empresa_nombre
on conflict do nothing;

-- ============================================================
-- CORRECCIÓN REAL APLICADA DESPUÉS (2026-10-06, revisión del Hallazgo #48 antes de comitear)
-- ============================================================
-- Esta migración ya se había aplicado contra la base real ANTES de confirmar que la regla
-- (criterios 15 a 19 de la spec) es que TODA la información de empresa Y RUTA se guarda en
-- MAYÚSCULAS -- la primera versión de este archivo dejaba `rutas.nombre` "conservando lo
-- escrito", sin CHECK. El archivo de arriba ya queda corregido como si hubiera estado bien desde
-- el principio (para que una instalación nueva nazca correcta); contra la base real, que ya tenía
-- las 15 filas con el `nombre` tal cual se sembró la primera vez, se corrió este delta
-- (comprobado antes que pasar a mayúsculas no genera duplicados dentro de una misma empresa):
--
--   update public.rutas set nombre = upper(nombre);
--   alter table public.rutas add constraint rutas_nombre_check check (nombre = upper(nombre));
