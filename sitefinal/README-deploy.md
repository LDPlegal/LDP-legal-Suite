# LDP Legal Advisors — Paquete de deploy

## Contenido

```
_deploy/
├── index.html              ← Inicio (ES/EN/DE)
├── firma.html              ← La Firma
├── equipo.html             ← Equipo
├── publicaciones.html      ← Publicaciones
├── internacional.html      ← Internacional
├── immobilienkauf.html     ← Landing DE: compra de inmuebles
├── anwalt.html             ← Landing DE: abogado / vuelos
└── assets/
    ├── *.jpg / *.png       ← Imágenes (oficina, equipo, fondos)
    ├── *.css / *.js        ← Estilos y scripts compartidos
    └── i18n.js             ← Sistema de idiomas (ES/EN/DE)
```

Sin dependencias externas que requieran build. Todo es HTML/CSS/JS estático.

## Cómo desplegarlo

### Opción A — Netlify (más fácil, gratis, recomendado)

1. Crea cuenta en https://www.netlify.com (con Google o email)
2. En el dashboard, arrastra y suelta la carpeta `_deploy` completa sobre la zona "drag and drop your site"
3. Netlify te asignará una URL temporal tipo `https://random-name-1234.netlify.app`
4. Para conectar `ldplegaladvisors.com`:
   - En Netlify → Site → Domain settings → Add custom domain
   - Escribe `ldplegaladvisors.com`
   - Sigue las instrucciones para apuntar tu DNS (cambiar nameservers en tu proveedor de dominio, o crear registros A/CNAME)
5. Netlify activa SSL/HTTPS automáticamente

### Opción B — Vercel (similar a Netlify)

1. Crea cuenta en https://vercel.com
2. New Project → Import → Upload (sube la carpeta `_deploy`)
3. Deploy. Misma lógica de dominio.

### Opción C — Hosting tradicional (cPanel, FTP)

Si tu dominio ya está en un hosting con cPanel o similar:
1. Conéctate por FTP o usa el File Manager
2. Sube **todo el contenido** de `_deploy` (no la carpeta, lo de adentro) a `public_html/` o `www/`
3. Verifica que `index.html` esté en la raíz

## Verificación post-deploy

Una vez en producción, visita y comprueba:
- [ ] `/` → carga inicio en ES, cambia idioma
- [ ] `/firma.html`, `/equipo.html`, `/publicaciones.html`, `/internacional.html`
- [ ] `/immobilienkauf.html` y `/anwalt.html` → cargan en DE por defecto
- [ ] Menu hamburguesa funciona en móvil
- [ ] Formularios de contacto envían correctamente (si conectaste backend de email)
- [ ] Imágenes cargan en todas las páginas

## Notas

- **Formularios:** los `<form>` actuales no tienen backend conectado. Para activar envío de email, hay 3 opciones:
  - Netlify Forms (gratis, automático, solo añadir `netlify` al `<form>`)
  - Formspree.io (gratis hasta 50 envíos/mes)
  - Backend propio (PHP, Node, etc.)
- **SEO:** considera añadir `<meta name="description">` específico por página y un `sitemap.xml`
- **Analytics:** sin Google Analytics ni similar instalado. Añadir si se necesita.
