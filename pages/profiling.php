<main id="page-top" class="ee-shell prof-shell">

  <?php ee_head_open(['img' => 'profiling_title.png', 'alt' => "Explorer's Eden Profiling Inspector", 'sub' => 'Turn a Minecraft profiling report into a clear breakdown of what slows your world down.']) ?>
  </header>

  <section class="prof-upload-section" id="prof-upload-section">
    <div class="ee-upload" id="prof-upload-zone" tabindex="0" role="button" aria-label="Upload profiling ZIP file">
      <input type="file" id="prof-file-input" accept=".zip" aria-hidden="true">
      <i class="bi bi-file-zip ee-upload__icon"></i>
      <p class="ee-upload__label prof-upload-label">Drop your profiling <code>.zip</code> here, or click to browse</p>
      <div class="ee-upload__tips">
        <div><i class="bi bi-display"></i><div><strong>Singleplayer</strong> - Press <kbd>F3</kbd> + <kbd>L</kbd> in-game to start</div></div>
        <div><i class="bi bi-hdd-network"></i><div><strong>Multiplayer</strong> - Run <code>/perf start</code> as an operator, it records for 10 seconds</div></div>
        <div><i class="bi bi-folder2-open"></i><div>The ZIP is saved in <code>.minecraft/debug/profiling/</code></div></div>
      </div>
    </div>
    <p class="ee-note"><i class="bi bi-shield-lock"></i> Your file never leaves your browser - all analysis happens locally.</p>
  </section>

  <section class="prof-results" id="prof-results" hidden>
    <!-- populated by profiling.js -->
  </section>

</main>
