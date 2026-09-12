-- Migración incremental: correr DESPUÉS de schema.sql + v2 + v3 + v4 + v5 +
-- v6, en el SQL Editor. Tabla de administradores individuales del Dashboard,
-- reemplazando la contraseña única compartida (DASHBOARD_ADMIN_PASSWORD) por
-- una cuenta por persona (ver §4 de contexto_proyecto.md).
--
-- Sin políticas RLS: solo se lee/escribe desde Route Handlers del Dashboard
-- con el service_role key (lib/supabase/server.ts), igual que el resto de
-- tablas que consulta el Dashboard — nunca se expone al cliente.
--
-- Alta de administradores: manual, insertando filas acá desde el SQL Editor.
-- No hay pantalla de gestión (fuera de alcance). Para generar password_hash,
-- ver el script de una línea documentado en contexto_proyecto.md §4.
--
-- Es seguro reintentar: "create table if not exists" no falla si ya se corrió.

create table if not exists admins (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  nombre text not null,
  password_hash text not null,
  activo boolean not null default true,
  creado_en timestamptz not null default now(),
  ultimo_acceso timestamptz
);
