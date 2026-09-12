FROM php:8.4-fpm

ENV DEBIAN_FRONTEND=noninteractive

# Install system deps and PHP extensions commonly used by Symfony
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates git unzip curl libonig-dev libpq-dev libzip-dev zlib1g-dev libicu-dev libpng-dev libjpeg62-turbo-dev libxml2-dev \
    && docker-php-ext-configure gd --with-jpeg \
    && docker-php-ext-install pdo_pgsql zip intl xml gd mbstring \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

# Copy Composer binary from the official Composer image
COPY --from=composer:2 /usr/bin/composer /usr/bin/composer

WORKDIR /var/www/html

# Ensure composer cache dir exists and is writable for runtime when mounted
RUN mkdir -p /var/www/.composer && chown -R www-data:www-data /var/www/.composer

# Optionally expose for debugging (php-fpm default listens on 9000)
EXPOSE 9000
