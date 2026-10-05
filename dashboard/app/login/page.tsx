"use client";

import { Lock, Mail } from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setCargando(true);
    try {
      const respuesta = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      if (!respuesta.ok) {
        const cuerpo = (await respuesta.json().catch(() => null)) as { mensaje?: string } | null;
        setError(cuerpo?.mensaje ?? "No se pudo iniciar sesión.");
        return;
      }

      router.push("/mapa");
      router.refresh();
    } catch {
      setError("No se pudo contactar al servidor. Intenta de nuevo.");
    } finally {
      setCargando(false);
    }
  }

  return (
    <div className="grid min-h-dvh grid-cols-1 lg:grid-cols-[minmax(320px,38%)_1fr]">
      {/* Panel de marca — spec_identidad_visual_day2day.md, maqueta DashboardLogin del canvas.
          Oculto en móvil (lg:flex): a ese ancho no entran las dos columnas, y el formulario es lo
          único imprescindible para poder iniciar sesión. */}
      {/* bg-[#000000] literal, no bg-ink: este panel es "chrome" de marca, siempre oscuro con
          logo blanco — a diferencia de --ink (que se invierte con el tema claro/oscuro del
          Dashboard), el panel no debe volverse blanco cuando el usuario pasa a tema oscuro. */}
      <div className="hidden flex-col justify-end bg-[#000000] p-12 text-white lg:flex xl:p-16">
        <Image
          src="/logo-blanco.png"
          alt="Day2Day Solutions"
          width={280}
          height={72}
          className="h-auto w-full max-w-[280px]"
          priority
        />
        <p className="mt-4 text-sm italic text-white/70">Smart logistics — Panel administrativo</p>
      </div>

      {/* spec_marca_agua_y_navegacion_day2day.md (Hallazgo #42): marca de agua sutil, solo del
          lado del formulario — el panel negro de marca de la izquierda no se toca. `relative
          isolate overflow-hidden` para que el isotipo absoluto (`-z-10`) quede detrás de la
          tarjeta y nunca se filtre fuera de esta columna. */}
      <div className="relative isolate flex items-center justify-center overflow-hidden bg-background p-6">
        <Image
          src="/isotipo-d2d.png"
          alt=""
          aria-hidden="true"
          width={899}
          height={299}
          className="pointer-events-none absolute -bottom-10 -right-10 -z-10 w-[90%] max-w-2xl select-none opacity-[0.05] dark:invert"
        />
        <div className="flex w-full max-w-sm flex-col items-center">
          {/* Logo nuevo, solo <1024px y solo en vertical — en escritorio el logo es el del panel
              negro (arriba), y en teléfono horizontal el alto ya es el recurso escaso (Hallazgos
              #13-#15). width=160/height=71 (919:409 ≈ 2.247, el mismo archivo que el panel negro
              y que el isotipo de la marca de agua) — h-auto preserva esa relación real, nunca
              w-full. dark:invert: los píxeles opacos de logo-negro.png son casi negros (RGB 3-4,
              confirmado con Pillow), invierten a un blanco limpio sobre el fondo oscuro, mismo
              recurso que ya usa la marca de agua del #42 — no se agrega ningún archivo nuevo. */}
          <Image
            src="/logo-negro.png"
            alt="Day2Day Solutions"
            width={160}
            height={71}
            priority
            className="mb-6 h-auto w-40 lg:hidden landscape:max-lg:hidden dark:invert"
          />
          <div className="relative w-full rounded-lg bg-card p-8 text-card-foreground shadow-md">
            <h1 className="text-lg font-semibold">Ingresar</h1>
            <p className="mb-6 mt-1 text-sm text-muted-foreground">
              Accedé con tu cuenta de administrador.
            </p>

            <form onSubmit={onSubmit} className="flex flex-col gap-4">
              <div>
                <Label htmlFor="email">Correo</Label>
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="email"
                    type="email"
                    autoFocus
                    required
                    className="pl-9"
                    placeholder="admin@empresa.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="password">Contraseña</Label>
                <div className="relative">
                  <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="password"
                    type="password"
                    required
                    className="pl-9"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>
              </div>

              {error && (
                <p role="alert" className="text-sm text-danger">
                  {error}
                </p>
              )}

              <Button type="submit" loading={cargando} className="w-full">
                Entrar
              </Button>
            </form>

            <p className="mt-6 text-center text-xs text-muted-foreground">
              Day2Day Solutions — uso interno
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
