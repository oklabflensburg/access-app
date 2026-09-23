

add makefile for docker logs:
docker compose \
--env-file .env.local \
-f compose.yaml \
-f compose.prod.yaml \
logs --tail=200 php

