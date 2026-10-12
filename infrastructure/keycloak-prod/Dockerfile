# Production-mode Keycloak with the JobAssist realm (for Render or any container host).
# Build from this directory:  docker build -t job-assist-keycloak infrastructure/keycloak-prod
# Runtime configuration (database, hostname, admin bootstrap, APP_URL) comes from environment
# variables — see docs/DEPLOYMENT.md. No secrets are baked into the image.

FROM quay.io/keycloak/keycloak:26.8.0 AS builder
ENV KC_DB=postgres
ENV KC_HEALTH_ENABLED=true
RUN /opt/keycloak/bin/kc.sh build

FROM quay.io/keycloak/keycloak:26.8.0
COPY --from=builder /opt/keycloak/ /opt/keycloak/
# Imported once, on first start (an existing realm is never overwritten). ${APP_URL} is
# replaced from the environment at import time.
COPY ai-job-assistant-realm.json /opt/keycloak/data/import/
ENTRYPOINT ["/opt/keycloak/bin/kc.sh"]
CMD ["start", "--optimized", "--import-realm"]
