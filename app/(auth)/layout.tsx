import type { ReactNode } from "react";
import Image from "next/image";

// Layout de autenticación, handoff 3b.
//
// Grid 600px / 1fr: izquierda marino #0B2239 con el monograma arriba y la
// foto de los socios ocupando TODO el espacio restante (flex-1, como en el
// diseño), fundida hacia arriba con máscara, no con una capa encima.
//
// El panel solo aparece desde lg (1024px). Con `md` el panel de 600px fijos
// dejaba el formulario en ~200px y era inusable entre 768 y 1024px.
// Debajo de lg el formulario ocupa la pantalla completa.
//
// Foto del panel: elegida por el usuario (papelería de la firma). El zip
// del handoff traía los <image-slot> vacíos, así que la referencia salió
// del propio repo.
const PARTNERS_PHOTO = "/marketing-photos/oficina-membrete.jpg";

const PHOTO_MASK =
  "linear-gradient(to top, rgba(0,0,0,1) 62%, rgba(0,0,0,0.5) 88%, rgba(0,0,0,0) 100%)";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-screen w-full lg:grid-cols-[minmax(0,600px)_minmax(400px,1fr)]">
      <div className="hidden flex-col bg-[#0B2239] lg:flex">
        <div className="flex-none px-11 pb-8 pt-10">
          <Image
            src="/marketing-photos/monogram-onDark.png"
            alt="LDP Legal Advisors"
            width={196}
            height={112}
            priority
            className="h-auto w-[196px]"
          />
        </div>

        {/* La foto llena todo lo que queda bajo el monograma. El fondo
            #1B3651 es el que se ve donde la máscara la desvanece. */}
        <div
          className="relative min-h-0 flex-1 overflow-hidden bg-[#1B3651]"
          style={{ maskImage: PHOTO_MASK, WebkitMaskImage: PHOTO_MASK }}
        >
          <Image
            src={PARTNERS_PHOTO}
            alt=""
            aria-hidden
            fill
            priority
            sizes="600px"
            className="object-cover object-center"
          />
        </div>
      </div>

      <main className="flex items-center justify-center bg-[#F4F5F3] p-6">
        <div className="w-full max-w-[376px]">{children}</div>
      </main>
    </div>
  );
}
