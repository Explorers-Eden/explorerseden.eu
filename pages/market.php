<main id="page-top" class="ee-shell ee-shell--wide market-shell">
  <?php ee_head_open(['smp' => 'market', 'sub_id' => 'market-subtitle', 'sub' => 'Loading the market…']) ?>
    <div class="ee-toolbar market-tools" role="search">
      <label class="ee-search">
        <span class="sr-only">Search the market</span>
        <i class="bi bi-search" aria-hidden="true"></i>
        <input type="search" id="market-search" placeholder="Search items or sellers..." autocomplete="off">
        <button id="market-clear" type="button" aria-label="Clear search">×</button>
      </label>
      <div class="ee-chips" id="market-sort" aria-label="Order">
        <button type="button" class="ee-chip is-active" data-sort="price"><i class="bi bi-sort-numeric-down" aria-hidden="true"></i> Cheapest first</button>
        <button type="button" class="ee-chip" data-sort="new"><i class="bi bi-clock-history" aria-hidden="true"></i> Newest first</button>
        <button type="button" class="ee-chip" data-sort="name"><i class="bi bi-sort-alpha-down" aria-hidden="true"></i> By name</button>
      </div>
    </div>
  </header>

  <div class="profile-groups" id="market-groups" aria-live="polite"></div>
</main>
