<?php
require_once __DIR__ . '/../translate/lib/db.php';
require_once __DIR__ . '/../translate/lib/auth.php';

$user = current_user();
if (!$user) {
  header('Location: /translate/auth/login.php?return_to=' . urlencode('/admin-playerdata/'));
  exit;
}
$isAdmin = $user['role'] === 'admin';
?>
<main id="page-top" class="page-shell admin-playerdata-shell">
  <img class="overview-banner" src="/assets/images/branding/smp_title.png" alt="A Realm Recrafted">

  <?php if (!$isAdmin): ?>
    <section class="profile-empty">
      <i class="bi bi-shield-lock" aria-hidden="true"></i>
      <h1>Admins only</h1>
    </section>
  <?php else: ?>
    <section class="admin-pd-hero" aria-label="Playerdata Inspector">
      <div class="admin-pd-hero__tools" role="search">
        <div class="waypoint-search-wrap">
          <i class="bi bi-search" aria-hidden="true"></i>
          <input id="admin-pd-search" type="search" placeholder="Search by player name..." autocomplete="off">
          <button id="admin-pd-clear-search" type="button" aria-label="Clear search">×</button>
        </div>
        <p id="admin-pd-status" class="admin-pd-status" aria-live="polite">Loading playerdata…</p>
      </div>
      <button id="admin-pd-refresh" type="button" class="admin-pd-refresh"><i class="bi bi-arrow-clockwise"></i> Refresh</button>
    </section>

    <div class="admin-pd-list" id="admin-pd-list" aria-live="polite"></div>
  <?php endif; ?>
</main>
