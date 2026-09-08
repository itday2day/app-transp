-- Migración incremental: correr DESPUÉS de schema.sql + v2 + v3 + v4, en el
-- SQL Editor. Agrega el registro de auditoría para ediciones manuales de una
-- jornada hechas desde el Dashboard (POST /api/jornadas/editar).
-- Es seguro reintentar: "add column if not exists" no falla si ya se corrió.
--
-- ⚠️ editado_por queda como TEXT libre, no UUID/FK a un admin real: el
-- Dashboard no tiene tabla de administradores ni Supabase Auth (ver §4 de
-- contexto_proyecto.md) — es una sola contraseña compartida, sin identidad
-- individual en la sesión. Quien edita escribe su propio nombre/correo en el
-- formulario; no hay forma de derivarlo del lado del servidor sin agregar un
-- sistema de cuentas de administrador, que está fuera del alcance de esto.

alter table public.jornadas
  add column if not exists fue_editado boolean not null default false,
  add column if not exists editado_por text,
  add column if not exists editado_en timestamptz,
  add column if not exists motivo_edicion text;
