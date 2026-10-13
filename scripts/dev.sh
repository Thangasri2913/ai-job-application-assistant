#!/usr/bin/env bash
# One-command local development: local infrastructure (PostgreSQL, S3-compatible storage,
# Keycloak) via Docker Compose, database migrations, then the API and the web app.
# Never uses production services. See docs/LOCAL-DEVELOPMENT.md.
#
#   ./scripts/dev.sh               start everything
#   ./scripts/dev.sh --no-install  don't install dependencies (fail if they are missing)
#   ./scripts/dev.sh --no-keycloak don't start local Keycloak (use another *development* Keycloak)
#   ./scripts/dev.sh --reset-db    reset the LOCAL database first (asks for confirmation)
#
# Supported: Linux and macOS with bash, Docker (Compose v2) and Node.js.

set -euo pipefail

# ── Output ───────────────────────────────────────────────────────────────────

if [[ -t 1 ]]; then
  BOLD=$'\033[1m' RED=$'\033[31m' GREEN=$'\033[32m' YELLOW=$'\033[33m' DIM=$'\033[2m' RESET=$'\033[0m'
else
  BOLD='' RED='' GREEN='' YELLOW='' DIM='' RESET=''
fi
STEPS=6
step() { printf '\n%s[%s/%s] %s%s\n' "$BOLD" "$1" "$STEPS" "$2" "$RESET"; }
ok() { printf '  %s✓%s %s\n' "$GREEN" "$RESET" "$*"; }
info() { printf '  %s\n' "$*"; }
warn() { printf '  %s!%s %s\n' "$YELLOW" "$RESET" "$*"; }
die() {
  printf '\n%s✗ %s%s\n' "$RED$BOLD" "$*" "$RESET" >&2
  exit 1
}

usage() {
  sed -n '2,12p' "$0" | sed 's/^# \{0,1\}//'
}

# ── Arguments ────────────────────────────────────────────────────────────────

INSTALL=true
KEYCLOAK=true
RESET_DB=false
for arg in "$@"; do
  case "$arg" in
    --no-install) INSTALL=false ;;
    --no-keycloak) KEYCLOAK=false ;;
    --reset-db) RESET_DB=true ;;
    -h | --help)
      usage
      exit 0
      ;;
    *)
      usage >&2
      die "Unknown option: $arg"
      ;;
  esac
done

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
LOG_DIR="$ROOT/.dev"
mkdir -p "$LOG_DIR"
SETUP_LOG="$LOG_DIR/setup.log"
: >"$SETUP_LOG"

# Runs a setup command quietly; on failure shows its output and stops.
quiet() {
  if ! "$@" >>"$SETUP_LOG" 2>&1; then
    printf '\n%sCommand failed: %s%s\n' "$RED" "$*" "$RESET" >&2
    tail -n 25 "$SETUP_LOG" >&2
    die "See .dev/setup.log for the full output."
  fi
}

# Reads one value from .env without executing the file (values may contain shell
# metacharacters) and without printing it.
env_get() {
  local line
  line="$(grep -E "^$1=" .env 2>/dev/null | tail -n 1 || true)"
  line="${line#*=}"
  line="${line%\"}"
  line="${line#\"}"
  printf '%s' "$line"
}
# Host part of a URL (never the credentials).
host_of() { printf '%s' "$1" | sed -E 's#^[a-zA-Z+]+://##; s#^[^@/]*@##; s#[:/?].*$##'; }
is_local_host() { [[ "$1" == "localhost" || "$1" == "127.0.0.1" || "$1" == "::1" || "$1" == "" ]]; }
port_in_use() { (exec 3<>"/dev/tcp/127.0.0.1/$1") 2>/dev/null; }
wait_for() { # wait_for <seconds> <description> <command...>
  local seconds=$1 what=$2
  shift 2
  for ((i = 0; i < seconds; i++)); do
    if "$@" >/dev/null 2>&1; then return 0; fi
    sleep 1
  done
  die "$what did not become ready within ${seconds}s."
}

printf '%s========================================%s\n' "$BOLD" "$RESET"
printf '%s AI Job Application Assistant%s\n' "$BOLD" "$RESET"
printf '%s Local Development%s\n' "$BOLD" "$RESET"
printf '%s========================================%s\n' "$BOLD" "$RESET"

# ── [1/6] Prerequisites and environment ──────────────────────────────────────

step 1 "Checking prerequisites..."

for tool in node npm docker curl; do
  command -v "$tool" >/dev/null 2>&1 || die "'$tool' is not installed or not on PATH."
done
NODE_VERSION="$(node -p 'process.versions.node')"
IFS=. read -r NODE_MAJOR NODE_MINOR _ <<<"$NODE_VERSION"
if ! { [[ "$NODE_MAJOR" -eq 22 && "$NODE_MINOR" -ge 12 ]] || [[ "$NODE_MAJOR" -ge 24 ]]; }; then
  die "Node $NODE_VERSION is not supported. Use Node 22.12+ (run: nvm use) or Node 24+."
fi
ok "Node $NODE_VERSION"
NPM_VERSION="$(npm -v)"
[[ "${NPM_VERSION%%.*}" -ge 11 ]] || die "npm $NPM_VERSION is too old for this workspace. Install npm 11: npm i -g npm@11"
ok "npm $NPM_VERSION"
docker compose version >/dev/null 2>&1 || die "Docker Compose v2 ('docker compose') is not available."
docker info >/dev/null 2>&1 || die "The Docker daemon is not running. Start Docker and try again."
ok "Docker is running"

if [[ ! -f .env ]]; then
  cp .env.example .env
  warn "Created .env from .env.example. The placeholder passwords work for local development;"
  warn "change them in .env if you like (keep DATABASE_URL in sync with POSTGRES_PASSWORD)."
else
  ok ".env found (left unchanged)"
fi

# Refuse production-looking configuration: local development must never touch real services.
PROD_PATTERN='neon\.tech|onrender\.com|vercel\.app|r2\.cloudflarestorage\.com|amazonaws\.com'
for key in DATABASE_URL DIRECT_DATABASE_URL TEST_DATABASE_URL; do
  value="$(env_get "$key")"
  [[ -z "$value" ]] && continue
  host="$(host_of "$value")"
  is_local_host "$host" ||
    die "$key in .env points at '$host'. Local development must use the local Docker PostgreSQL (localhost). Production values belong only in Render."
done
storage_host="$(host_of "$(env_get S3_ENDPOINT)")"
is_local_host "$storage_host" ||
  die "S3_ENDPOINT in .env points at '$storage_host'. Local development uses the local S3-compatible storage (S3_ENDPOINT=http://localhost:8333 in .env.example); production R2 credentials belong only in Render."
for key in KEYCLOAK_ISSUER_URL VITE_KEYCLOAK_URL; do
  host="$(host_of "$(env_get "$key")")"
  if ! is_local_host "$host"; then
    if [[ "$KEYCLOAK" == true ]] || grep -Eq "$PROD_PATTERN" <<<"$host"; then
      die "$key in .env points at '$host'. Use the local Keycloak (or --no-keycloak with another development Keycloak, never production)."
    fi
    warn "$key uses the development Keycloak at '$host' (--no-keycloak)."
  fi
done
api_url="$(env_get VITE_API_URL)"
if [[ "$api_url" == http* ]] && ! is_local_host "$(host_of "$api_url")"; then
  die "VITE_API_URL in .env points at '$(host_of "$api_url")'. Locally the web app calls the local API (/api/v1)."
fi
[[ "$(env_get NODE_ENV)" == "production" ]] && die "NODE_ENV=production in .env. Use NODE_ENV=development locally."
ok "Configuration is local-only (no production hosts)"

API_PORT="$(env_get API_PORT)"
API_PORT="${API_PORT:-3000}"
WEB_PORT="$(grep -Eo 'port: *[0-9]+' apps/web/vite.config.ts | head -n 1 | grep -Eo '[0-9]+' || true)"
WEB_PORT="${WEB_PORT:-4200}"
KEYCLOAK_PORT="$(env_get KEYCLOAK_HOST_PORT)"
KEYCLOAK_PORT="${KEYCLOAK_PORT:-8180}"
S3_PORT="$(env_get S3_HOST_PORT)"
S3_PORT="${S3_PORT:-8333}"
ISSUER="$(env_get KEYCLOAK_ISSUER_URL)"
for p in "$API_PORT" "$WEB_PORT"; do
  if port_in_use "$p"; then
    die "Port $p is already in use (another API/web server is running?). Stop it first; this script never stops processes it didn't start."
  fi
done
ok "Ports $API_PORT (API) and $WEB_PORT (web) are free"

# ── [2/6] Local infrastructure ───────────────────────────────────────────────

step 2 "Starting local infrastructure (Docker)..."

if [[ "$KEYCLOAK" == true ]]; then
  quiet npm run --silent db:up
  ok "PostgreSQL, object storage and Keycloak containers started (npm run db:up)"
else
  quiet docker compose up -d postgres object-storage
  ok "PostgreSQL and object storage containers started (local Keycloak skipped)"
fi

healthy() {
  local id
  id="$(docker compose ps -q "$1")"
  [[ -n "$id" && "$(docker inspect --format '{{.State.Health.Status}}' "$id")" == "healthy" ]]
}
info "Waiting for PostgreSQL..."
wait_for 60 "PostgreSQL" healthy postgres
ok "PostgreSQL is ready (localhost:$(env_get POSTGRES_HOST_PORT))"
wait_for 60 "Object storage" curl -s -o /dev/null "http://localhost:$S3_PORT"
ok "Object storage is ready (localhost:$S3_PORT)"
if [[ "$KEYCLOAK" == true ]]; then
  info "Waiting for Keycloak (first start can take a minute)..."
  wait_for 180 "Keycloak" curl -sf -o /dev/null "$ISSUER/.well-known/openid-configuration"
  ok "Keycloak is ready ($ISSUER)"
else
  curl -sf -o /dev/null "$ISSUER/.well-known/openid-configuration" ||
    die "The configured Keycloak ($ISSUER) is not reachable. Start it, or run without --no-keycloak."
  ok "Keycloak reachable ($ISSUER)"
fi

# ── [3/6] Dependencies and database ──────────────────────────────────────────

step 3 "Preparing dependencies and database..."

if [[ ! -d node_modules ]]; then
  [[ "$INSTALL" == true ]] || die "Dependencies are not installed. Run without --no-install (or: npm ci)."
  info "Installing dependencies (npm ci)..."
  quiet npm ci
fi
ok "Dependencies installed"
if [[ ! -f packages/shared/dist/index.js ]]; then
  quiet npm run --silent build:shared
fi
ok "Shared package built"

# Every Prisma command below gets the local URLs explicitly (validated above), so it can
# never reach another database even if the environment contains other values.
LOCAL_DB="$(env_get DATABASE_URL)"
prisma() { (cd apps/api && DATABASE_URL="$LOCAL_DB" DIRECT_DATABASE_URL="$LOCAL_DB" npx prisma "$@"); }
quiet prisma generate
ok "Prisma client generated"

if [[ "$RESET_DB" == true ]]; then
  printf '\n  %sThis deletes ALL data in the LOCAL database "%s" on %s.%s\n' "$YELLOW" \
    "$(printf '%s' "$LOCAL_DB" | sed -E 's#^.*/##; s#\?.*##')" "$(host_of "$LOCAL_DB")" "$RESET"
  read -r -p "  Type 'reset' to continue: " answer
  [[ "$answer" == "reset" ]] || die "Database reset cancelled. Nothing was changed."
  quiet prisma migrate reset --force
  ok "Local database reset"
fi
quiet prisma migrate deploy
ok "Migrations applied to the local database"

# ── [4/6] – [5/6] API and web ────────────────────────────────────────────────

# Job control: each background job gets its own process group, so cleanup can stop a job
# and everything it spawned (tsc-watch → node, vite) without touching other processes.
set -m
API_PGID=""
WEB_PGID=""

cleanup() {
  trap - INT TERM EXIT
  disown -a 2>/dev/null || true # no job-control "Terminated" notices
  printf '\n%sStopping local services started by this script...%s\n' "$BOLD" "$RESET"
  for pgid in "$WEB_PGID" "$API_PGID"; do
    [[ -n "$pgid" ]] && kill -TERM -- "-$pgid" 2>/dev/null || true
  done
  sleep 1
  for pgid in "$WEB_PGID" "$API_PGID"; do
    [[ -n "$pgid" ]] && kill -KILL -- "-$pgid" 2>/dev/null || true
  done
  info "API and web stopped. Docker containers keep running (stop them with: npm run db:down)."
}
trap 'cleanup; exit 130' INT
trap 'cleanup; exit 143' TERM
trap 'cleanup' EXIT

# start <name> <log file> <npm script>: runs the script in its own process group, prefixing
# its output, and records the group id.
start() {
  local name=$1 log=$2 script=$3
  (npm run "$script" 2>&1 | tee "$log" | awk -v p="${DIM}[$name]${RESET} " '{ print p $0; fflush() }') &
  local pid=$!
  printf -v "$4" '%s' "$(ps -o pgid= -p "$pid" | tr -d ' ')"
}

step 4 "Starting API..."
start api "$LOG_DIR/api.log" dev:api API_PGID
info "Logs: .dev/api.log"

step 5 "Starting frontend..."
start web "$LOG_DIR/web.log" dev:web WEB_PGID
info "Logs: .dev/web.log"

# ── [6/6] Health checks ──────────────────────────────────────────────────────

step 6 "Running health checks..."
group_alive() { [[ -n "$1" ]] && kill -0 -- "-$1" 2>/dev/null; }
wait_service() { # wait_service <seconds> <name> <pgid> <url>
  for ((i = 0; i < $1; i++)); do
    group_alive "$3" || die "The $2 stopped during startup. See .dev/$2.log."
    curl -sf -o /dev/null "$4" && return 0
    sleep 1
  done
  die "The $2 did not respond at $4 within $1s. See .dev/$2.log."
}
API_URL="http://localhost:$API_PORT/api/v1"
wait_service 180 api "$API_PGID" "$API_URL/health"
ok "API healthy ($API_URL/health)"
if curl -sf -o /dev/null "$API_URL/health/ready"; then
  ok "API ready: database, storage and Keycloak reachable"
else
  warn "API readiness check failed: see $API_URL/health/ready"
fi
wait_service 60 web "$WEB_PGID" "http://localhost:$WEB_PORT/"
ok "Frontend serving (http://localhost:$WEB_PORT)"

printf '\n%sLocal application is ready:%s\n\n' "$GREEN$BOLD" "$RESET"
printf '  Frontend: http://localhost:%s\n' "$WEB_PORT"
printf '  API:      %s\n' "$API_URL"
printf '  Health:   %s/health\n' "$API_URL"
if [[ "$(env_get SWAGGER_ENABLED)" == "true" ]]; then printf '  API docs: %s\n' "http://localhost:$API_PORT/api/docs"; fi
printf '  Keycloak: http://localhost:%s/admin (realm %s)\n' "$KEYCLOAK_PORT" "${ISSUER##*/}"
printf '  Storage:  http://localhost:%s (local S3-compatible)\n' "$S3_PORT"
printf '  AI:       AI_PROVIDER=%s\n' "$(env_get AI_PROVIDER || true)"
printf '\nPress Ctrl+C to stop local services.\n\n'

# Keep running until Ctrl+C, or until the API or web server exits on its own.
while true; do
  if ! group_alive "$API_PGID"; then
    die "The API stopped unexpectedly. Last lines of .dev/api.log:
$(tail -n 20 "$LOG_DIR/api.log")"
  fi
  if ! group_alive "$WEB_PGID"; then
    die "The web server stopped unexpectedly. Last lines of .dev/web.log:
$(tail -n 20 "$LOG_DIR/web.log")"
  fi
  sleep 2
done
