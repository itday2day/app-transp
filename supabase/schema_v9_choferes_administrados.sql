-- Migración incremental: correr DESPUÉS de schema.sql + v2 a v8, en el SQL Editor. Alta de
-- choferes administrada desde el Dashboard (spec_alta_choferes_dashboard.md,
-- contexto_proyecto.md §4). Es seguro reintentar.
--
-- `activo` default TRUE: los choferes ya existentes siguen activos, sin cambio de
-- comportamiento. `debe_cambiar_contrasena` default FALSE: los choferes que ya se
-- registraron ellos mismos con su propia contraseña NO quedan forzados a cambiarla — la
-- bandera solo se enciende para los que el Dashboard cree de acá en más (contraseña
-- temporal) o para un reseteo.

alter table public.choferes
  add column if not exists activo boolean not null default true,
  add column if not exists debe_cambiar_contrasena boolean not null default false;
