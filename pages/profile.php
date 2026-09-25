<?php
require_once __DIR__ . '/../translate/lib/db.php';
require_once __DIR__ . '/../translate/lib/auth.php';
require_once __DIR__ . '/../translate/lib/generated_data.php';

$user = current_user();
if (!$user) {
  header('Location: /translate/auth/login.php?return_to=' . urlencode('/profile/'));
  exit;
}

$profile = get_player_profile($user['discord_id']);
?>
<main id="page-top" class="page-shell profile-shell">
  <img class="overview-banner" src="/assets/images/branding/smp_title.png" alt="A Realm Recrafted">

  <?php if (!$profile): ?>
    <section class="profile-empty">
      <i class="bi bi-person-x" aria-hidden="true"></i>
      <h1>No profile yet</h1>
    </section>
  <?php else: ?>
    <div class="profile-groups" id="profile-groups"></div>

    <script type="application/json" id="profile-data" data-updated-at="<?= htmlspecialchars($profile['updatedAt'] ?? '', ENT_QUOTES) ?>"><?= json_encode($profile['data']) ?></script>
  <?php endif; ?>
</main>
