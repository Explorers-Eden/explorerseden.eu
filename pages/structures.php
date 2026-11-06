<main id="page-top" class="ee-shell ee-shell--wide structures-shell">
  <?php ee_head_open(['img' => 'structures_title.png', 'alt' => "Explorer's Eden Structures", 'sub' => 'Walk through every structure our data packs add, right in your browser.']) ?>
    <div class="ee-toolbar" role="search">
      <label class="ee-search">
        <span class="sr-only">Search structures</span>
        <i class="bi bi-search" aria-hidden="true"></i>
        <input id="structure-search" type="search" placeholder="Search structures..." autocomplete="off">
        <button id="clear-structure-search" type="button" aria-label="Clear search">×</button>
      </label>
      <div class="ee-chips" id="structure-filters" aria-label="Quick data-pack filters"></div>
    </div>
  </header>

  <section class="structures-layout">
    <aside class="structures-sidebar" aria-label="Structure list">
      <button class="structures-sidebar-toggle" type="button" id="structures-sidebar-toggle" aria-expanded="false" aria-controls="structures-sidebar-body">
        <i class="bi bi-list" aria-hidden="true"></i>
        <span>Browse structures</span>
      </button>
      <div class="structures-sidebar-body" id="structures-sidebar-body">
        <ul class="structures-group-list" id="structures-group-list" role="tree" aria-busy="true">
          <li class="structures-empty">Loading…</li>
        </ul>
      </div>
    </aside>

    <article class="structures-detail" id="structures-detail" aria-live="polite">
      <div class="structures-detail-empty" id="structures-detail-empty">
        <i class="bi bi-arrow-left-circle" aria-hidden="true"></i>
        <p>Select a structure from the list to open the 3D viewer.</p>
      </div>
    </article>
  </section>
</main>
<script src="/assets/scripts/structures.js"></script>
