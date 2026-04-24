<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="keywords" content="minecraft, java, smp server, survival, data packs, mods, nice mobs remastered, katters structures, enchantments encore, discord, free">
  <meta name="description" content="Explorer's Eden is all about Java Minecraft. We create Data Packs, host a SMP Server and have a wonderful Discord community.">

  <title>Explorer's Eden</title>

  <meta property="og:url" content="https://wiki.explorerseden.eu">
  <meta property="og:type" content="website">
  <meta property="og:title" content="Explorer's Eden">
  <meta property="og:description" content="Explorer's Eden is all about Java Minecraft. We create Data Packs, host a SMP Server and have a wonderful Discord community.">
  <meta name="twitter:card" content="summary_large_image">

  <link rel="shortcut icon" href="assets/images/icons/favicon.ico" type="image/x-icon">
  <link rel="apple-touch-icon" href="assets/images/icons/apple-touch-icon.png">
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.min.css">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@500;600;700;800;900&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="assets/styles/site.css">
</head>
<body>
  <div class="site-bg"></div>
  <div class="starfield" aria-hidden="true"><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span></div>

  <header class="navbar">
    <a class="brand" href="#page-top" aria-label="Explorer's Eden home">
      <img src="assets/images/branding/ee_title_default.png" alt="Explorer's Eden">
    </a>

    <nav class="nav-links" aria-label="Main navigation">
      <a target="_blank" rel="noreferrer" href="https://modrinth.com/server/a-realm-recrafted"><i class="bi bi-dpad-fill"></i> We're Online! •<span class="sip" data-ip="play.explorerseden.eu" data-port="25569"></span> Playing</a>
      <a target="_blank" rel="noreferrer" href="https://discord.gg/f2pMggfgVv"><i class="bi bi-discord"></i> <?php include ('discord.php'); ?></a>
      <a target="_blank" rel="noreferrer" href="https://wiki.explorerseden.eu"><i class="bi bi-journal-bookmark-fill"></i> Wiki</a>
      <a target="_blank" rel="noreferrer" href="https://enchantments.explorerseden.eu/"><i class="bi bi-magic"></i> Enchantments</a>
      <a target="_blank" rel="noreferrer" href="https://modrinth.com/organization/explorers-eden"><i class="bi bi-gear-fill"></i> Modrinth</a>
      <a target="_blank" rel="noreferrer" href="https://github.com/Explorers-Eden"><i class="bi bi-github"></i> Github</a>
    </nav>
  </header>

  <main id="page-top" class="hero">
    <img class="hero-logo" src="assets/images/branding/hi_res_banner_3d.png" alt="Explorer's Eden">

    <section class="mod-list" id="mod-list" aria-label="Explorer's Eden data packs" data-modrinth-source="modrinth-projects.php">
      <article class="mod-card mod-card--loading" aria-live="polite">
        <div class="mod-icon-placeholder" aria-hidden="true"></div>
        <div class="mod-content">
          <h2>Loading data packs…</h2>
          <p>Fetching the latest Explorer's Eden data packs from Modrinth.</p>
        </div>
      </article>
    </section>
  </main>

  <footer class="site-footer">Explorer's Eden is in no way affiliated with Minecraft, Mojang AB and/or Notch Development AB.</footer>

  <script src="assets/scripts/site.js"></script>
  <script src="js/smp_server.js"></script>
</body>
</html>
