-- Hallazgo #52: ultimas_posiciones y ubicaciones_tracking_planas corren hoy con los privilegios
-- de su dueño (postgres, no de quien consulta) y se saltan el RLS de ubicaciones_tracking -- por
-- eso anon y authenticated pueden leer posiciones reales de choferes aunque la tabla base esté
-- protegida por policies `auth.uid() = chofer_id` (medido 2026-10-12: 5 y 424 filas respectivamente,
-- con las dos claves). Dos capas, las dos necesarias:
--
-- 1) revoke all ... from anon, authenticated -- la garantia principal: sin el privilegio de
--    tabla, la peticion REST falla antes de llegar a los datos, sin importar si la vista respeta
--    o no el RLS.
-- 2) security_invoker = true -- la segunda capa: si en el futuro alguien vuelve a conceder un
--    privilegio por descuido, la vista pasa a evaluar el RLS de QUIEN LA LLAMA (cada chofer veria,
--    como mucho, solo lo suyo) en vez de saltarselo con los privilegios del dueño. Para
--    service_role, que ya salta el RLS igual, esto no cambia nada.
--
-- Idempotente: alter view ... set (...) vuelve a fijar la misma opcion sin error si ya estaba
-- puesta; revoke sobre un privilegio ya revocado tampoco es un error en Postgres. Correrla dos
-- veces no rompe nada.
--
-- No se concede nada nuevo: service_role conserva exactamente lo que ya tenia.
--
-- Sin begin/commit a nivel de archivo (misma convencion que schema_v19_invitaciones_alta_
-- choferes.sql): apply_migration envuelve todo el archivo en su propia transaccion implicita.
-- Un commit; aca adentro habria confirmado los cambios de verdad si alguien probara el archivo
-- completo dentro de un BEGIN...ROLLBACK externo -- el ROLLBACK no tendria nada que deshacer.

alter view public.ultimas_posiciones set (security_invoker = true);
alter view public.ubicaciones_tracking_planas set (security_invoker = true);

revoke all on public.ultimas_posiciones from anon, authenticated;
revoke all on public.ubicaciones_tracking_planas from anon, authenticated;
