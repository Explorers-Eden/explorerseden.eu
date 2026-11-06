<main id="page-top" class="ee-shell ee-shell--wide recipes-shell">
  <?php ee_head_open(['img' => 'recipes_title.png', 'alt' => "Explorer's Eden Recipes", 'sub' => 'Every crafting, smelting and smithing recipe our data packs add.']) ?>
    <div class="ee-toolbar" role="search">
      <label class="ee-search">
        <span class="sr-only">Search recipes</span>
        <i class="bi bi-search" aria-hidden="true"></i>
        <input id="recipe-search" type="search" placeholder="Search recipes..." autocomplete="off">
        <button id="clear-recipe-search" type="button" aria-label="Clear search">×</button>
      </label>
      <div class="ee-chips" id="recipe-quick-filters" aria-label="Quick data-pack filters"></div>
    </div>
  </header>

  <section class="recipes-layout">
    <aside class="recipes-sidebar" aria-label="Recipe list">
      <button class="recipes-sidebar-toggle" type="button" id="recipes-sidebar-toggle" aria-expanded="false" aria-controls="recipes-sidebar-body">
        <i class="bi bi-list" aria-hidden="true"></i>
        <span>Browse recipes</span>
      </button>
      <div class="recipes-sidebar-body" id="recipes-sidebar-body">
        <ul class="recipes-group-list" id="recipes-group-list" role="tree" aria-busy="true">
          <li class="recipes-empty">Loading…</li>
        </ul>
      </div>
    </aside>

    <article class="recipes-detail" id="recipes-detail" aria-live="polite">
      <div class="recipes-detail-empty" id="recipes-detail-empty">
        <i class="bi bi-arrow-left-circle" aria-hidden="true"></i>
        <p>Select a recipe from the list to see its ingredients and result.</p>
      </div>
    </article>
  </section>
</main>
