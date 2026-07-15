/* ==================== LDP — Shared partials (nav + footer) ==================== */
// Each page includes <div data-include="nav"></div> and <div data-include="footer"></div>
// This script injects shared markup so we don't duplicate it across 6 pages.

const LDP_NAV = (currentPage) => `
<nav class="top">
  <div class="inner">
    <a href="index.html" class="brand">
      <img class="monogram" src="assets/monogram-navy.png" alt="LDP Legal Advisors">
    </a>
    <button class="menu-toggle" aria-label="Menu" onclick="document.querySelector('nav.top .menu').classList.toggle('open')">
      <svg width="22" height="14" viewBox="0 0 22 14" fill="none" stroke="currentColor" stroke-width="1.5">
        <path d="M0 1h22M0 7h22M0 13h22"/>
      </svg>
    </button>
    <div class="menu">
      <a href="index.html"${currentPage==='inicio'?' class="active"':''}>
        <span data-es>Inicio</span><span data-en>Home</span>
      </a>
      <a href="firma.html"${currentPage==='firma'?' class="active"':''}>
        <span data-es>La Firma</span><span data-en>The Firm</span>
      </a>
      <a href="equipo.html"${currentPage==='equipo'?' class="active"':''}>
        <span data-es>Equipo</span><span data-en>Team</span>
      </a>
      <a href="index.html#areas-dual"${currentPage==='areas'?' class="active"':''}>
        <span data-es>Áreas de Práctica</span><span data-en>Practice Areas</span>
      </a>
      <a href="publicaciones.html"${currentPage==='publicaciones'?' class="active"':''}>
        <span data-es>Publicaciones</span><span data-en>Publications</span>
      </a>
      <a href="index.html#contacto"${currentPage==='contacto'?' class="active"':''}>
        <span data-es>Contacto</span><span data-en>Contact</span>
      </a>
      <div class="lang-toggle">
        <button data-lang="es">ES</button>
        <span class="sep">/</span>
        <button data-lang="en">EN</button>
      </div>
    </div>
  </div>
</nav>`;

const LDP_FOOTER = `
<footer class="site">
  <div class="frame">
    <div class="crown">
      <img src="assets/monogram-navy.png" alt="LDP Legal Advisors">
      <div class="tagline">
        <span data-es>Santo Domingo · República Dominicana</span>
        <span data-en>Santo Domingo · Dominican Republic</span>
      </div>
    </div>

    <div class="top">
      <div class="col">
        <h5><span data-es>Firma</span><span data-en>Firm</span></h5>
        <a href="firma.html"><span data-es>La Firma</span><span data-en>The Firm</span></a>
        <a href="equipo.html"><span data-es>Equipo</span><span data-en>Team</span></a>
        <a href="index.html#areas-dual"><span data-es>Áreas de Práctica</span><span data-en>Practice Areas</span></a>
        <a href="publicaciones.html"><span data-es>Publicaciones</span><span data-en>Publications</span></a>
      </div>
      <div class="col">
        <h5><span data-es>Contacto</span><span data-en>Contact</span></h5>
        <a href="mailto:admin@ldplegal.com.do">admin@ldplegal.com.do</a>
        <a href="tel:+18092897136">809 · 289 · 7136</a>
      </div>
      <div class="col">
        <h5><span data-es>Oficina</span><span data-en>Office</span></h5>
        <span class="line">Calle Haim López Penha No. 32</span>
        <span class="line">Torre Odonto-Dom · 2do Nivel</span>
        <span class="line">Paraíso, Santo Domingo, D.N.</span>
      </div>
    </div>
    <div class="legal">
      <span>© MMXXVI · LDP Legal Advisors</span>
      <span><span data-es>Aviso legal · Privacidad</span><span data-en>Legal notice · Privacy</span></span>
    </div>
  </div>
</footer>`;

function ldpInjectShared(currentPage) {
  const nav = document.querySelector('[data-include="nav"]');
  const footer = document.querySelector('[data-include="footer"]');
  if (nav) nav.outerHTML = LDP_NAV(currentPage);
  if (footer) footer.outerHTML = LDP_FOOTER;
}
