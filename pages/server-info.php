<main id="page-top" class="ee-shell si-shell">
  <?php ee_head_open(['smp' => 'server-info']) ?>
  </header>

  <section class="ee-panel si-hero">
    <span class="ee-icon si-hero__icon"><i class="bi bi-journal-text" aria-hidden="true"></i></span>
    <div class="si-hero__main">
      <p class="profile-hero__eyebrow">Server info</p>
      <h1 class="si-hero__title" id="in-title">How the server is set up</h1>
      <div class="si-hero__badges"><div class="in-restart" id="in-restart" hidden></div><div class="in-motd" id="in-motd" hidden></div></div>
      <div class="in-intro" id="in-intro"></div>
    </div>
    <a class="ee-action si-hero__map" href="/map/"><span class="ee-action__icon"><i class="bi bi-map" aria-hidden="true"></i></span>World map</a>
  </section>

  <div class="si-bar" id="in-bar">
    <nav class="profile-tabs si-tabs" id="in-tabs" aria-label="Sections"></nav>
    <label class="ee-search si-search">
      <span class="sr-only">Search the server info</span>
      <i class="bi bi-search" aria-hidden="true"></i>
      <input type="search" id="in-q" placeholder="Search everything… (press /)" autocomplete="off">
    </label>
  </div>

  <div class="si-main" id="in-main"><p class="in-empty">Loading…</p></div>
  <p class="si-updated" id="in-updated"></p>
</main>
