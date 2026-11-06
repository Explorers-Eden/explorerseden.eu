<main id="page-top" class="ee-shell ee-shell--narrow rp-main">

  <?php ee_head_open(['img' => 'resourcepack_title.png', 'alt' => 'Resource Pack Assembler', 'sub' => 'Pick your Minecraft version and the data packs you use - we build one resource pack with all their textures.']) ?>
  </header>

  <section class="ee-panel" id="rp-step1">
    <div class="ee-panel__head">
      <span class="ee-icon"><i class="bi bi-1-circle" aria-hidden="true"></i></span>
      <div><h2>Minecraft version</h2><p>The version you play on</p></div>
    </div>
    <div class="ee-panel__body">
      <div class="rp-version-pills" id="rp-version-pills" role="group" aria-label="Select Minecraft version">
        <span class="rp-empty">Loading versions…</span>
      </div>
    </div>
  </section>

  <section class="ee-panel" id="rp-step2">
    <div class="ee-panel__head">
      <span class="ee-icon"><i class="bi bi-2-circle" aria-hidden="true"></i></span>
      <div><h2>Data packs</h2><p>Every pack you have installed</p></div>
      <div class="ee-panel__aside rp-pack-controls" id="rp-pack-controls" hidden>
        <button type="button" class="ee-btn ee-btn--ghost ee-btn--sm" id="rp-select-all">Select all</button>
        <button type="button" class="ee-btn ee-btn--ghost ee-btn--sm" id="rp-deselect-all">Deselect all</button>
      </div>
    </div>
    <div class="ee-panel__body">
      <div class="rp-pack-grid" id="rp-pack-grid" role="group" aria-label="Select data packs">
        <span class="rp-empty">Loading packs…</span>
      </div>
    </div>
  </section>

  <section class="ee-panel" id="rp-download-area">
    <div class="ee-panel__head">
      <span class="ee-icon"><i class="bi bi-3-circle" aria-hidden="true"></i></span>
      <div><h2>Download</h2><p>Put the ZIP in your <code>resourcepacks</code> folder</p></div>
    </div>
    <div class="ee-panel__body rp-download-area">
      <button type="button" class="ee-btn ee-btn--primary ee-btn--lg" id="rp-dl-btn" disabled>
        <i class="bi bi-download" aria-hidden="true"></i> Download Resource Pack
      </button>
      <div class="rp-progress" id="rp-progress" hidden>
        <div class="rp-progress__bar-wrap">
          <div class="rp-progress__bar" id="rp-progress-bar" style="width:0%"></div>
        </div>
        <div class="rp-progress__status" id="rp-progress-status"></div>
      </div>
      <details class="rp-conflicts" id="rp-conflicts" hidden>
        <summary><i class="bi bi-exclamation-triangle" aria-hidden="true"></i> <span id="rp-conflicts-label">Conflicts (0)</span></summary>
        <ul class="rp-conflicts__list" id="rp-conflicts-list"></ul>
      </details>
    </div>
  </section>

</main>
