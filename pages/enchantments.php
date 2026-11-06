<?php
  require_once __DIR__ . '/../translate/lib/db.php';
  require_once __DIR__ . '/../translate/lib/generated_data.php';
  $enchantmentsRow = get_generated_data('enchantments');
?>
<?php if ($enchantmentsRow): ?>
<script>window.EXPLORERS_EDEN_ENCHANTMENTS = <?= json_encode($enchantmentsRow['data']) ?>;</script>
<?php endif; ?>
<main id="page-top" class="ee-shell ee-shell--wide ench-shell">
    <?php ee_head_open(['img' => 'enchantments_title.png', 'alt' => "Explorer's Eden Enchantments", 'sub' => 'Every enchantment our data packs add - what it does, where it applies and where to find it.']) ?>
      <div class="ee-toolbar" role="search">
        <label class="ee-search">
          <span class="sr-only">Search enchantments</span>
          <i class="bi bi-search" aria-hidden="true"></i>
          <input type="search" id="search-input" placeholder="Search enchantments...">
          <button id="clear-search" type="button" aria-label="Clear search">×</button>
        </label>
        <div class="ee-chips" id="quick-filters" aria-label="Quick enchantment filters"></div>
        <p id="results-count" class="ee-count" aria-live="polite">Loading enchantments…</p>
      </div>
    </header>

    <section class="ee-panel ench-table-panel" aria-label="Enchantments table">
      <div class="table-scroll">
        <table class="enchantments-table" id="data-table">
          <thead>
            <tr>
              <th scope="col"><button class="sort-button" type="button" data-sort="name">Name <i class="bi bi-arrow-down-up"></i></button></th>
              <th scope="col">Description</th>
              <th scope="col">Max Level</th>
              <th scope="col">Applicable to</th>
              <th scope="col">Incompatibilities</th>
              <th scope="col">Loot Sources</th>
              <th scope="col">Data Pack</th>
            </tr>
          </thead>
          <tbody></tbody>
        </table>
      </div>
    </section>
  </main>