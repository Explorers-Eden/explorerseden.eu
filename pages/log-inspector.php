<main id="page-top" class="ee-shell log-shell">

  <?php ee_head_open(['img' => 'loginspector_title.png', 'alt' => 'Log Inspector', 'sub' => 'Get a plain-English summary of what went wrong in a Minecraft log - and how to fix it.']) ?>
  </header>

  <section class="log-upload-section" id="log-upload-section">
    <div class="ee-upload" id="log-upload-zone" tabindex="0" role="button" aria-label="Upload Minecraft log file">
      <input type="file" id="log-file-input" accept=".log,.txt,.gz" aria-hidden="true">
      <i class="bi bi-file-text ee-upload__icon"></i>
      <p class="ee-upload__label log-upload-label">Drop your log file here, or click to browse</p>
      <p class="ee-upload__hint">Accepts <code>.log</code>, <code>.txt</code>, and <code>.log.gz</code> files</p>
      <div class="ee-upload__tips">
        <div><i class="bi bi-display"></i><div><strong>Singleplayer / Client</strong> - Find logs in <code>.minecraft/logs/latest.log</code></div></div>
        <div><i class="bi bi-hdd-network"></i><div><strong>Server</strong> - Find logs in your server folder under <code>logs/latest.log</code></div></div>
        <div><i class="bi bi-exclamation-octagon"></i><div><strong>Crash report</strong> - Find these in <code>.minecraft/crash-reports/</code></div></div>
      </div>
    </div>
    <p class="ee-note"><i class="bi bi-shield-lock"></i> Your file never leaves your browser - all analysis happens locally.</p>
  </section>

  <section class="log-results" id="log-results" hidden>
    <!-- populated by log-inspector.js -->
  </section>

</main>
