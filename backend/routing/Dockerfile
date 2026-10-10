FROM eclipse-temurin:17-jre-jammy

# Pin both the official release and its published SHA-256 digest.
RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && mkdir -p /app /data/graph-cache \
    && curl -fSL --retry 3 https://github.com/graphhopper/graphhopper/releases/download/11.1/graphhopper-web-11.1.jar -o /app/graphhopper.jar \
    && printf '%s  %s\n' '8462f758d9ea49edaded557cec5c687a0a24f004ec371cd4daaeb0534824ea33' '/app/graphhopper.jar' | sha256sum -c - \
    && chown -R 10001:10001 /app /data

WORKDIR /app
COPY graphhopper.yml /app/graphhopper.yml
COPY entrypoint.sh /app/entrypoint.sh
RUN chmod 755 /app/entrypoint.sh
USER 10001:10001
EXPOSE 8989
ENTRYPOINT ["/app/entrypoint.sh"]
CMD ["server", "/app/graphhopper.yml"]
