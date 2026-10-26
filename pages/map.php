<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.css">
<main id="page-top" class="page-shell smp-map-shell">
  <section class="smp-map-panel">
    <header class="smp-map-head">
      <span class="profile-panel__icon"><i class="bi bi-map" aria-hidden="true"></i></span>
      <h1 id="mp-title">World map</h1>
      <div class="smp-map-chips" id="mp-dims" role="tablist" aria-label="Dimension"></div>
      <div class="smp-map-chips smp-map-layers" id="mp-layers" aria-label="Layers"></div>
    </header>
    <div class="smp-map-wrap">
      <div id="map" class="smp-map" aria-label="Map of the world"></div>
      <details class="smp-map-status" id="mp-status" open hidden>
        <summary><span class="smp-map-dot" id="mp-dot"></span><b id="mp-state">…</b><span id="mp-count"></span><i class="bi bi-chevron-down" aria-hidden="true"></i></summary>
        <div class="smp-map-clock" id="mp-clock" hidden></div>
        <dl class="smp-map-facts" id="mp-facts"></dl>
        <div class="smp-map-players" id="mp-players"></div>
      </details>
      <div class="smp-map-coords" id="mp-coords"></div>
      <p class="smp-map-message" id="mp-message" hidden></p>
    </div>
  </section>
</main>
