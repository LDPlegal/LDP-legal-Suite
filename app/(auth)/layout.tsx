import type { ReactNode } from "react";
import Image from "next/image";

// Layout de autenticación — handoff 3b.
//
// Grid 600px / 1fr: izquierda marino #0B2239 con el monograma sobre oscuro
// arriba y la foto de los socios abajo, fundida hacia arriba con máscara
// (no con una capa encima). Derecha: el formulario centrado.
//
// PENDIENTE: la foto final de los socios. El handoff indica pedir los
// archivos definitivos y servirlos desde public/marketing-photos/. Mientras
// tanto se usa firma-atlas.jpg, que ya está en el repo.
const PARTNERS_PHOTO = "/marketing-photos/firma-atlas.jpg";

const PHOTO_MASK =
  "linear-gradient(to top, rgba(0,0,0,1) 62%, rgba(0,0,0,0.5) 88%, rgba(0,0,0,0) 100%)";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-screen w-full md:grid-cols-[600px_1fr]">
      <div className="relative hidden flex-col overflow-hidden bg-[#0B2239] md:flex">
        <div className="relative z-10 p-10">
          <Image
            src="/marketing-photos/monogram-onDark.png"
            alt="LDP Legal Advisors"
            width={196}
            height={112}
            priority
            className="h-auto w-[196px]"
          />
        </div>

        {/* Foto de los socios, fundida hacia arriba con máscara. Es
            decorativa: ningún texto se apoya sobre la zona visible. */}
        <div className="relative mt-auto h-[58%] w-full">
          <div
            className="absolute inset-0"
            style={{
              maskImage: PHOTO_MASK,
              WebkitMaskImage: PHOTO_MASK,
            }}
          >
            <Image
              src={PARTNERS_PHOTO}
              alt=""
              aria-hidden
              fill
              priority
              sizes="600px"
              className="object-cover object-top"
            />
          </div>
        </div>
      </div>

      <main className="flex items-center justify-center bg-[#F4F5F3] p-6">
        <div className="w-full max-w-[392px]">{children}</div>
      </main>
    </div>
  );
}
