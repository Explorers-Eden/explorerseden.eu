<main id="page-top" class="hero">
    <div class="hero-intro">
      <img class="hero-logo" src="/assets/images/branding/hi_res_banner_3d.png" alt="Explorer's Eden">
    </div>

    <nav class="quick-dock" aria-label="Explorer's Eden quick links">
      <a class="quick-dock__item quick-dock__item--smp" href="/overview/">
        <span class="quick-dock__icon"><i class="bi bi-broadcast-pin"></i></span>
        <span class="quick-dock__text">
          <span class="quick-dock__label">Java SMP</span>
          <span class="quick-dock__meta">
            <i class="bi bi-circle-fill"></i>
            <span class="sip" data-ip="play.explorerseden.eu" data-port="25569">0</span> playing now
          </span>
        </span>
        <i class="bi bi-chevron-right quick-dock__chevron"></i>
      </a>

      <span class="quick-dock__divider" aria-hidden="true"></span>

      <a class="quick-dock__item quick-dock__item--modrinth" href="https://modrinth.com/organization/explorers-eden" target="_blank" rel="noreferrer">
        <span class="quick-dock__icon"><i class="bi bi-box-seam"></i></span>
        <span class="quick-dock__text">
          <span class="quick-dock__label">Modrinth</span>
          <span class="quick-dock__meta" id="feature-modrinth-downloads">Browse &amp; download our packs</span>
        </span>
        <i class="bi bi-box-arrow-up-right quick-dock__chevron"></i>
      </a>

      <span class="quick-dock__divider" aria-hidden="true"></span>

      <a class="quick-dock__item quick-dock__item--wiki" href="https://wiki.explorerseden.eu/" target="_blank" rel="noreferrer">
        <span class="quick-dock__icon"><i class="bi bi-journal-bookmark-fill"></i></span>
        <span class="quick-dock__text">
          <span class="quick-dock__label">Wiki</span>
          <span class="quick-dock__meta">Documentation &amp; references</span>
        </span>
        <i class="bi bi-box-arrow-up-right quick-dock__chevron"></i>
      </a>
    </nav>

    <section class="showcase showcase--smp">
      <div class="showcase__head">
        <div class="showcase__head-text">
          <span class="showcase__eyebrow">A Realm Recrafted</span>
          <h2 class="showcase__title">A small Minecraft survival server we put together as a place to play, build, and share some time together.</h2>
        </div>
        <a class="showcase__action" href="/overview/">
          <span class="showcase__action-icon"><i class="bi bi-broadcast-pin"></i></span>
          View Details
          <i class="bi bi-chevron-right showcase__action-chevron"></i>
        </a>
      </div>

      <div class="skin-row" id="skin-row" aria-hidden="true"></div>

      <div class="profile-stat-grid smp-stat-grid">
        <div class="profile-stat-tile">
          <i class="bi bi-clock-history"></i>
          <div>
            <p class="profile-stat-tile__value" id="smp-stat-playtime">-</p>
            <p class="profile-stat-tile__label">Hours Played</p>
          </div>
        </div>
        <div class="profile-stat-tile">
          <i class="bi bi-trophy-fill"></i>
          <div>
            <p class="profile-stat-tile__value" id="smp-stat-advancements">-</p>
            <p class="profile-stat-tile__label">Advancements Completed</p>
          </div>
        </div>
        <div class="profile-stat-tile">
          <i class="bi bi-hammer"></i>
          <div>
            <p class="profile-stat-tile__value" id="smp-stat-blocks">-</p>
            <p class="profile-stat-tile__label">Blocks Mined</p>
          </div>
        </div>
        <div class="profile-stat-tile">
          <i class="bi bi-crosshair"></i>
          <div>
            <p class="profile-stat-tile__value" id="smp-stat-mobs">-</p>
            <p class="profile-stat-tile__label">Mobs Killed</p>
          </div>
        </div>
      </div>
    </section>

    <section class="showcase">
      <div class="showcase__head">
        <div class="showcase__head-text">
          <span class="showcase__eyebrow">Data Packs</span>
          <h2 class="showcase__title">Our current projects published on Modrinth. Built with passion, forever free to enjoy.</h2>
        </div>
        <a class="showcase__action" href="https://modrinth.com/organization/explorers-eden" target="_blank" rel="noreferrer">
          <span class="showcase__action-icon"><i class="bi bi-box-seam"></i></span>
          View on Modrinth
          <i class="bi bi-chevron-right showcase__action-chevron"></i>
        </a>
      </div>

      <div class="mod-list" id="mod-list" aria-label="Explorer's Eden data packs" data-modrinth-source="modrinth-projects.php">
        <article class="mod-card mod-card--loading" aria-live="polite">
          <div class="mod-icon-placeholder" aria-hidden="true"></div>
          <div class="mod-content">
            <h2>Loading data packs…</h2>
            <p>Fetching the latest Explorer's Eden data packs from Modrinth.</p>
          </div>
        </article>
      </div>
    </section>

    <section class="showcase">
      <div class="showcase__head">
        <div class="showcase__head-text">
          <span class="showcase__eyebrow">Translations</span>
          <h2 class="showcase__title">Help us translate our data packs to more languages - every suggestion and vote helps.</h2>
        </div>
        <a class="showcase__action" href="/translate/">
          <span class="showcase__action-icon"><i class="bi bi-translate"></i></span>
          View Details
          <i class="bi bi-chevron-right showcase__action-chevron"></i>
        </a>
      </div>

      <div class="translate-overview" id="translate-overview">
        <div class="translate-overview__progress">
          <div class="translate-overview__progress-head">
            <span class="translate-overview__progress-label">Overall Progress</span>
            <span class="translate-overview__progress-value" id="translate-overview-percent">-</span>
          </div>
          <div class="translate-progress-bar">
            <div class="translate-progress-bar__fill" id="translate-overview-fill" style="width:0%"></div>
          </div>
        </div>

        <div class="profile-stat-tile translate-overview__votes">
          <i class="bi bi-hourglass-split"></i>
          <div>
            <p class="profile-stat-tile__value" id="translate-overview-open">-</p>
            <p class="profile-stat-tile__label">Suggestions Open for Voting</p>
          </div>
        </div>
      </div>

      <div class="translate-top-packs" id="translate-top-packs" aria-label="Most translated data packs"></div>
    </section>
  </main>
