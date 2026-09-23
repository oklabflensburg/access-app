.PHONY: start stop logs migrate

COMPOSE := docker compose --project-directory backend

start:
	$(COMPOSE) up --detach --build --wait

stop:
	$(COMPOSE) stop

logs:
	$(COMPOSE) logs --follow

migrate:
	$(COMPOSE) exec php php bin/console doctrine:migrations:migrate --no-interaction
