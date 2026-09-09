FROM php:8.4-cli
RUN apt-get update && apt-get install -y --no-install-recommends libpq-dev libjpeg62-turbo-dev libpng-dev libonig-dev \
    && docker-php-ext-configure gd --with-jpeg \
    && docker-php-ext-install pdo_pgsql gd mbstring \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY . .
RUN printf 'upload_max_filesize=5M\npost_max_size=6M\n' > /usr/local/etc/php/conf.d/uploads.ini
CMD ["php", "-S", "0.0.0.0:8080", "router.php"]
