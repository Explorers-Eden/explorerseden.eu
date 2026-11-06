<main id="page-top" class="ee-shell overview-shell">
  <?php ee_head_open(['smp' => 'overview']) ?>
    <div class="ee-page-head__actions">
      <button id="copy-server-ip" type="button" class="ee-action">
        <span class="ee-action__icon"><i class="bi bi-clipboard" aria-hidden="true"></i></span><span data-label>Copy Server IP</span>
      </button>
      <a class="ee-action" target="_blank" rel="noreferrer" href="https://modrinth.com/server/a-realm-recrafted">
        <span class="ee-action__icon"><i class="bi bi-box-arrow-up-right" aria-hidden="true"></i></span>View on Modrinth
      </a>
    </div>
  </header>

  <section class="overview-status" id="overview-status" aria-live="polite" aria-label="Server status">
    <p class="overview-status__loading">Checking server status…</p>
  </section>

  <section class="overview-readme" id="overview-readme" aria-label="Server README">
    <?php
      require_once __DIR__ . '/../translate/lib/db.php';
      require_once __DIR__ . '/../translate/lib/generated_data.php';
      $readme = get_generated_data('overview-readme');
      $readmeHtml = $readme['data']['html'] ?? '';
      if ($readmeHtml !== '') {
        echo $readmeHtml;
      } else {
        echo '<p class="overview-readme__missing">README content is being generated - check back soon.</p>';
      }
    ?>
  </section>
</main>
