.PHONY: start stop logs migrate extract-steps

COMPOSE_ENV_FILE := $(wildcard backend/.env.local)
COMPOSE := docker compose --project-directory backend $(if $(COMPOSE_ENV_FILE),--env-file $(COMPOSE_ENV_FILE))

start:
	$(COMPOSE) up --detach --build --wait

stop:
	$(COMPOSE) stop

logs:
	$(COMPOSE) logs --follow

migrate:
	$(COMPOSE) exec php php bin/console doctrine:migrations:migrate --no-interaction

extract-steps:
	mkdir -p backend/public/data
	$(COMPOSE) run --rm --no-deps --entrypoint /app/extract-steps.sh routing > backend/public/data/steps.geojson
	test -s backend/public/data/steps.geojson
