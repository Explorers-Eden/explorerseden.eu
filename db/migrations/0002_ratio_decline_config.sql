-- Ratio-based auto-decline config. Used by vote.php: once a suggestion has
-- accumulated at least min_votes_for_ratio_decline votes, it's declined
-- outright if downvotes make up too large a share of them - this is what
-- resolves a "follow-up" suggestion (one for a key/locale that already has
-- an accepted translation) since those no longer get a time-based fallback,
-- see resolveExpiredPending in tools/scripts/export-translations.js.
INSERT INTO app_config (key, value) VALUES
  ('min_votes_for_ratio_decline', '5'),
  ('decline_ratio_threshold', '0.7')
ON CONFLICT (key) DO NOTHING;
