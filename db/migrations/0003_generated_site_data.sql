-- Backs pages/enchantments.php, recipes.js, structures.js, waypoint-hubs.js,
-- data-pack-configurator.js, resource-pack-assembler.js, overview.php, and
-- profile.php/profiles/api/aggregate.php. Written by
-- tools/scripts/publish-generated-data.js at the end of the CI generate job,
-- read directly by PHP at request time - see translate/lib/generated_data.php.
-- Replaces committing these as JSON files to the (public) repo.
CREATE TABLE generated_data (
  key        varchar PRIMARY KEY,
  data       jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE player_profiles (
  discord_id varchar PRIMARY KEY,
  data       jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
