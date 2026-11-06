<?php
// Shared page parts. Every page opens with ee_head_open() and closes the header itself
// (`</header>`), so a toolbar or actions row can sit inside the same head block.

function ee_e(string $s): string {
  return htmlspecialchars($s, ENT_QUOTES);
}

const EE_SMP_TABS = [
  'overview'    => ['/overview/',    'bi-info-circle',     'Overview'],
  'statistics'  => ['/statistics/',  'bi-bar-chart-fill',  'Statistics'],
  'market'      => ['/market/',      'bi-shop',            'Market'],
  'server-info' => ['/server-info/', 'bi-journal-text',    'Server Info'],
  'map'         => ['/map/',         'bi-map',             'World Map'],
  'profile'     => ['/profile/',     'bi-person-badge',    'My Profile'],
];

function ee_smp_tabs(string $active, string $extraClass = ''): void {
  echo '<nav class="ee-tabs ee-smp-tabs' . ($extraClass ? ' ' . ee_e($extraClass) : '') . '" aria-label="SMP">';
  foreach (EE_SMP_TABS as $slug => [$href, $icon, $label]) {
    $cur = $slug === $active ? ' aria-current="page"' : '';
    echo '<a class="ee-tab" href="' . $href . '"' . $cur . '><i class="bi ' . $icon . '" aria-hidden="true"></i> ' . $label . '</a>';
  }
  echo '</nav>';
}

/**
 * Opens <header class="ee-page-head"> with the page's title image (or the SMP banner + tabs)
 * and an optional subtitle. Options:
 *   img      branding file name, e.g. 'recipes_title.png'
 *   alt      alt text for the image
 *   smp      slug of the active SMP page - shows the A Realm Recrafted banner and section tabs
 *   sub      subtitle text (plain text)
 *   sub_id   id for the subtitle, when a script fills it in
 */
function ee_head_open(array $o): void {
  echo '<header class="ee-page-head">';
  if (!empty($o['smp'])) {
    echo '<img class="ee-page-head__title" src="/assets/images/branding/smp_title.png" alt="A Realm Recrafted">';
    ee_smp_tabs($o['smp']);
  } else {
    echo '<img class="ee-page-head__title" src="/assets/images/branding/' . ee_e($o['img']) . '" alt="' . ee_e($o['alt'] ?? '') . '">';
  }
  if (isset($o['sub']) || isset($o['sub_id'])) {
    $id = isset($o['sub_id']) ? ' id="' . ee_e($o['sub_id']) . '"' : '';
    echo '<p class="ee-page-head__sub"' . $id . '>' . ee_e($o['sub'] ?? '') . '</p>';
  }
}
