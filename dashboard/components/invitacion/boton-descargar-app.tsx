"use client";

// Hallazgo #69: el único propósito de este componente cliente es tener un `onClick` en el
// navegador -- page.tsx sigue siendo un Server Component, y el HTML que manda (este mismo <a>,
// mismo texto, mismas clases) es idéntico sea el token válido, inventado o basura (criterio 35 del
// Bloque B): la validación de formato pasa ACÁ, nunca en el servidor, y nunca cambia lo que se ve.
const FORMATO_TOKEN = /^[0-9a-f]{32}$/;

interface Props {
  href: string;
  token: string;
}

export function BotonDescargarApp({ href, token }: Props) {
  function manejarClick() {
    // Criterios 1-2 (#69): nunca bloquea ni retrasa la descarga -- sin `await`, sin
    // preventDefault(). Si copiar falla (navigator.clipboard ausente, permiso denegado, contexto
    // sin HTTPS) es silencioso: la descarga sigue por el `href` normal del <a>, sin aviso.
    if (!FORMATO_TOKEN.test(token)) return;
    navigator.clipboard?.writeText(`d2d-inv:${token}`).catch(() => {});
  }

  return (
    <a
      href={href}
      rel="noreferrer noopener"
      onClick={manejarClick}
      className="inline-flex h-12 items-center justify-center rounded-md bg-primary px-4 text-base font-medium text-primary-foreground transition-colors hover:bg-primary/90"
    >
      Descargar la app
    </a>
  );
}
