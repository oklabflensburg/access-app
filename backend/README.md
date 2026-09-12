# AccessApp API

The Symfony JSON API for accessibility observations. It runs with FrankenPHP,
PostgreSQL/PostGIS, Doctrine DBAL and migrations, and persistent photo storage.

## Start the application

```bash
docker compose up --build --wait
```

The local API is available at `http://localhost:8080`. Check the application,
database, and PostGIS connection with:

```bash
curl http://localhost:8080/api/health
```

## Run Symfony commands

The Symfony CLI is installed in the PHP container:

```bash
docker compose exec php symfony console about
docker compose exec php symfony console doctrine:migrations:migrate
```

## Database

The default development database is `api`, using user `app` and password
`!ChangeMe!`. Override these defaults with `POSTGRES_DB`, `POSTGRES_USER`, and
`POSTGRES_PASSWORD` environment variables. Change the password outside local
development.

PostGIS is initialized by the first Doctrine migration. The container runs all
pending migrations during startup. Observation locations use a spatial index;
media files are stored in the dedicated `photo_data` volume.

## Tests

```bash
docker compose exec php php bin/console --env=test doctrine:migrations:migrate --no-interaction
docker compose exec php php bin/phpunit
```

Stop the stack with:

```bash
docker compose down --remove-orphans
```
