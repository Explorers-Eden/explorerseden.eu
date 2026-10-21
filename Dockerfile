# Pinned to the patch release so security fixes are explicit, not whatever a
# cached 8.2-apache tag happens to resolve to. 8.2.35 fixes CVE-2026-109618
# and CVE-2026-109619 (unauthenticated RCE, Oct 2026). PHP 8.2 is EOL on
# 2026-12-31 - move to 8.4 before then.
FROM php:8.2.35-apache

# Build-time arg: the commit SHA the deploy job is shipping. Baked into
# /var/www/html/version.txt so `curl /version.txt` always returns the truth
# about which commit is live — invaluable when a docker layer cache or a
# partial-cache browser makes the live site look "stuck".
ARG GIT_SHA=unknown

WORKDIR /var/www/html
COPY . .

# Default php:8.2-apache image ships with AllowOverride None — that silently
# disables every .htaccess in the doc root. Flip it to All so our caching and
# rewrite rules actually take effect.
RUN a2enmod rewrite headers && \
    sed -ri 's!AllowOverride None!AllowOverride All!g' /etc/apache2/apache2.conf && \
    printf '%s\n' "$GIT_SHA" > /var/www/html/version.txt

# pdo_pgsql: the translate/ feature talks to Postgres from PHP.
RUN apt-get update && apt-get install -y --no-install-recommends libpq-dev && \
    docker-php-ext-install pdo pdo_pgsql && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

EXPOSE 80
