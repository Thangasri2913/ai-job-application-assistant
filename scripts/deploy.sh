#!/usr/bin/env bash
# Validate, commit and push to main. Pushing to main IS the deployment: Vercel (web) and
# Render (API, Keycloak) deploy automatically from it. See docs/DEPLOYMENT-AUTOMATION.md.
#
# This script never contains or prints secrets, and never calls the Vercel/Render APIs.

set -Eeuo pipefail

readonly DEPLOY_BRANCH="main"
readonly REMOTE="origin"
# Public URLs only (not secrets), shown after a successful push.
readonly FRONTEND_TARGET="Vercel  → https://ai-job-application-assistant-murex-seven.vercel.app"
readonly BACKEND_TARGET="Render  → https://ai-job-assistant-api-i4ho.onrender.com/api/v1/health"

# Paths that must never be committed (secrets, credentials, generated output).
# Matched against repository-relative paths; .env.example files are explicitly allowed.
readonly PROTECTED_REGEX='(^|/)\.env($|\.)|\.pem$|\.key$|\.p12$|\.pfx$|(^|/)id_(rsa|ed25519|ecdsa)$|(^|/)(secrets?|credentials?)(/|$)|(^|/)[^/]*(secret|credential)s?[^/]*\.(json|ya?ml|txt|ini|cfg|conf|properties)$|(^|/)node_modules/|(^|/)dist/|(^|/)build/|(^|/)coverage/|\.tsbuildinfo$|^apps/api/src/generated/|(^|/)test-results/|(^|/)playwright-report/'
readonly ALLOWED_REGEX='(^|/)\.env\.example$'

# ── Output helpers ───────────────────────────────────────────────────────────

if [[ -t 1 ]]; then
  BOLD=$'\033[1m' RED=$'\033[31m' GREEN=$'\033[32m' YELLOW=$'\033[33m' RESET=$'\033[0m'
else
  BOLD='' RED='' GREEN='' YELLOW='' RESET=''
fi

TOTAL_STEPS=8
CURRENT_COMMAND=""
COMMITTED=false
STAGED_BY_SCRIPT=false

section() { printf '\n%s[%s/%s] %s%s\n' "$BOLD" "$1" "$TOTAL_STEPS" "$2" "$RESET"; }
info() { printf '  %s\n' "$*"; }
ok() { printf '  %s✓%s %s\n' "$GREEN" "$RESET" "$*"; }
warn() { printf '  %s!%s %s\n' "$YELLOW" "$RESET" "$*"; }

fail() {
  printf '\n%s✗ %s%s\n' "$RED$BOLD" "$*" "$RESET" >&2
  if [[ "$STAGED_BY_SCRIPT" == true && "$COMMITTED" == false ]]; then
    git restore --staged -- . >/dev/null 2>&1 || git reset -q >/dev/null 2>&1 || true
  fi
  if [[ "$COMMITTED" == true ]]; then
    printf '%sA local commit was created but NOT pushed. Fix the problem, then run: git push %s %s%s\n' \
      "$RED" "$REMOTE" "$DEPLOY_BRANCH" "$RESET" >&2
  else
    printf '%sDeployment stopped. Nothing was committed or pushed.%s\n' "$RED" "$RESET" >&2
  fi
  exit 1
}

on_error() {
  local exit_code=$? line=$1
  if [[ -n "$CURRENT_COMMAND" ]]; then
    fail "Failed: ${CURRENT_COMMAND} (exit code ${exit_code})"
  fi
  fail "Unexpected error at scripts/deploy.sh line ${line} (exit code ${exit_code})"
}
trap 'on_error $LINENO' ERR

# Runs a validation command and names it clearly if it fails.
run() {
  CURRENT_COMMAND="$*"
  info "\$ $*"
  "$@"
  CURRENT_COMMAND=""
}

usage() {
  cat <<'EOF'
Usage:
  ./scripts/deploy.sh "commit message"           Validate, commit and push to main (deploys)
  ./scripts/deploy.sh --full "commit message"    Also run the API e2e tests (needs local
                                                 PostgreSQL + object storage: npm run db:up)
  ./scripts/deploy.sh --dry-run ["message"]      Run every check and show what would be
                                                 committed; then unstage. No commit, no push.
  ./scripts/deploy.sh --help                     Show this help

Checks, in order (any failure stops the deployment; nothing is committed or pushed):
  environment → secrets → format:check → lint → typecheck → build → tests → commit & push

Pushing to origin/main triggers the automatic deployments:
  web → Vercel, API and Keycloak → Render. See docs/DEPLOYMENT-AUTOMATION.md.
EOF
}

# ── Arguments ────────────────────────────────────────────────────────────────

FULL=false
DRY_RUN=false
MESSAGE=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    -h | --help)
      usage
      exit 0
      ;;
    --full) FULL=true ;;
    --dry-run) DRY_RUN=true ;;
    -*)
      usage >&2
      fail "Unknown option: $1"
      ;;
    *)
      [[ -z "$MESSAGE" ]] || fail "Give the commit message as one quoted argument."
      MESSAGE="$1"
      ;;
  esac
  shift
done

if [[ "$DRY_RUN" == false && -z "${MESSAGE// /}" ]]; then
  usage >&2
  fail 'A commit message is required, e.g. ./scripts/deploy.sh "fix: job alert form validation"'
fi

# ── [1/8] Environment ────────────────────────────────────────────────────────

section 1 "Checking environment"

command -v git >/dev/null 2>&1 || fail "git is not installed or not on PATH."
command -v node >/dev/null 2>&1 || fail "node is not installed or not on PATH."
command -v npm >/dev/null 2>&1 || fail "npm is not installed or not on PATH."

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null)" || fail "Not inside a git repository."
if [[ "$(pwd -P)" != "$(cd "$REPO_ROOT" && pwd -P)" ]]; then
  fail "Run this from the repository root: cd $REPO_ROOT && ./scripts/deploy.sh ..."
fi
[[ -f package.json && -d apps/web && -d apps/api && -d packages/shared ]] ||
  fail "This does not look like the JOB-ASSIST repository root."
ok "Repository root: $REPO_ROOT"

# Node: >=22.12 <23, or >=24 (package.json "engines").
NODE_VERSION="$(node -p 'process.versions.node')"
IFS=. read -r NODE_MAJOR NODE_MINOR _ <<<"$NODE_VERSION"
if ! { [[ "$NODE_MAJOR" -eq 22 && "$NODE_MINOR" -ge 12 ]] || [[ "$NODE_MAJOR" -ge 24 ]]; }; then
  fail "Node $NODE_VERSION is not supported. Use Node 22.12+ (see .nvmrc: nvm use)."
fi
ok "Node $NODE_VERSION"

NPM_VERSION="$(npm -v)"
if [[ "${NPM_VERSION%%.*}" -lt 11 ]]; then
  fail "npm $NPM_VERSION is too old for this workspace. Install npm 11: npm i -g npm@11"
fi
ok "npm $NPM_VERSION"

[[ -d node_modules ]] || fail "Dependencies are not installed. Run: npm ci"

BRANCH="$(git rev-parse --abbrev-ref HEAD)"
if [[ "$BRANCH" != "$DEPLOY_BRANCH" ]]; then
  fail "Deployment requires the '$DEPLOY_BRANCH' branch (current: '$BRANCH'). Merge your work into $DEPLOY_BRANCH first."
fi
ok "Branch: $BRANCH"

git remote get-url "$REMOTE" >/dev/null 2>&1 || fail "Git remote '$REMOTE' is not configured."
CURRENT_COMMAND="git fetch $REMOTE $DEPLOY_BRANCH"
git fetch --quiet "$REMOTE" "$DEPLOY_BRANCH"
CURRENT_COMMAND=""
BEHIND="$(git rev-list --count "HEAD..$REMOTE/$DEPLOY_BRANCH")"
if [[ "$BEHIND" -gt 0 ]]; then
  fail "Local $DEPLOY_BRANCH is $BEHIND commit(s) behind $REMOTE/$DEPLOY_BRANCH. Run: git pull --rebase $REMOTE $DEPLOY_BRANCH"
fi
ok "Up to date with $REMOTE/$DEPLOY_BRANCH"

if [[ -n "$(git diff --cached --name-only)" ]]; then
  fail "Some changes are already staged. Unstage them first (git restore --staged .) so this script controls what is committed."
fi

# ── [2/8] Secrets ────────────────────────────────────────────────────────────

section 2 "Checking secrets"

# Paths that would be committed: tracked changes plus untracked, non-ignored files.
mapfile -t CANDIDATES < <(
  {
    git diff --name-only HEAD
    git ls-files --others --exclude-standard
  } | sort -u
)

is_protected() { grep -Eq "$PROTECTED_REGEX" <<<"$1" && ! grep -Eq "$ALLOWED_REGEX" <<<"$1"; }

# 1. Protected files that git does not ignore (they could be committed by mistake).
UNPROTECTED=()
for path in "${CANDIDATES[@]}"; do
  [[ -n "$path" ]] && is_protected "$path" && UNPROTECTED+=("$path")
done
if [[ ${#UNPROTECTED[@]} -gt 0 ]]; then
  printf '  %s\n' "${UNPROTECTED[@]}" >&2
  fail "The files above look like secrets or generated output and are not ignored. Add them to .gitignore (they will not be committed)."
fi

# 2. Protected files already tracked in git.
mapfile -t TRACKED_PROTECTED < <(git ls-files | grep -E "$PROTECTED_REGEX" | grep -Ev "$ALLOWED_REGEX" || true)
if [[ ${#TRACKED_PROTECTED[@]} -gt 0 ]]; then
  printf '  %s\n' "${TRACKED_PROTECTED[@]}" >&2
  fail "The files above are tracked by git but should never be committed. Remove them from the index (git rm --cached) and rotate any secret they contained."
fi

# 3. Secret-looking content in the changes. Only file names and line numbers are printed.
SECRET_CONTENT_REGEX='-----BEGIN [A-Z ]*PRIVATE KEY-----|AKIA[0-9A-Z]{16}|sk-ant-[A-Za-z0-9_-]{20,}|gh[pousr]_[A-Za-z0-9]{30,}|xox[abpr]-[A-Za-z0-9-]{10,}|postgres(ql)?://[^:/@[:space:]]+:[^@[:space:]]+@[^/[:space:]]*(neon\.tech|render\.com|amazonaws\.com|supabase)'
FOUND=()
for path in "${CANDIDATES[@]}"; do
  [[ -n "$path" && -f "$path" ]] || continue
  while IFS= read -r hit; do
    FOUND+=("$path:${hit%%:*}")
  done < <(grep -InE -- "$SECRET_CONTENT_REGEX" "$path" 2>/dev/null || true)
done
if [[ ${#FOUND[@]} -gt 0 ]]; then
  printf '  %s\n' "${FOUND[@]}" >&2
  fail "Possible secrets found at the locations above (values not shown). Remove them; production values belong in Vercel/Render settings."
fi

if [[ -e .env ]]; then
  git check-ignore -q .env || fail ".env exists but is not ignored by git."
  ok ".env exists locally and is ignored"
fi
ok "No secret files or secret-looking values in ${#CANDIDATES[@]} changed file(s)"

# ── [3/8] – [7/8] Validation ─────────────────────────────────────────────────

section 3 "Formatting"
run npm run format:check

section 4 "Lint"
run npm run lint

section 5 "Typecheck"
run npm run typecheck

section 6 "Build"
run npm run build

section 7 "Tests"
run npm test
if [[ "$FULL" == true ]]; then
  info "--full: running API end-to-end tests (requires local PostgreSQL + object storage)"
  run npm run test:e2e
fi

# ── [8/8] Commit and push ────────────────────────────────────────────────────

section 8 "Commit and push"

# Stage explicitly: exactly the changes validated in step 2, minus protected paths (never a
# blind `git add .`; files created later by the build or tests are never picked up).
TO_STAGE=()
for path in "${CANDIDATES[@]}"; do
  [[ -n "$path" ]] && ! is_protected "$path" && TO_STAGE+=("$path")
done
STAGED_BY_SCRIPT=true
if [[ ${#TO_STAGE[@]} -gt 0 ]]; then
  CURRENT_COMMAND="git add"
  # --all also records deletions of the listed paths.
  git add --all -- "${TO_STAGE[@]}"
  CURRENT_COMMAND=""
fi

# Final guard: verify exactly what is staged.
mapfile -t STAGED < <(git diff --cached --name-only)
BLOCKED=()
for path in "${STAGED[@]}"; do
  [[ -n "$path" ]] && is_protected "$path" && BLOCKED+=("$path")
done
if [[ ${#BLOCKED[@]} -gt 0 ]]; then
  printf '  %s\n' "${BLOCKED[@]}" >&2
  fail "Protected files were staged and have been unstaged again."
fi

info "git status --short:"
git status --short | sed 's/^/    /'

if [[ ${#STAGED[@]} -eq 0 ]]; then
  ok "Nothing to commit: the working tree matches HEAD. No deployment triggered."
  exit 0
fi
ok "${#STAGED[@]} file(s) staged"

if [[ "$DRY_RUN" == true ]]; then
  git restore --staged -- . >/dev/null 2>&1 || git reset -q
  STAGED_BY_SCRIPT=false
  printf '\n%s✓ Dry run complete: all checks passed. Changes unstaged; nothing committed or pushed.%s\n' \
    "$GREEN$BOLD" "$RESET"
  exit 0
fi

CURRENT_COMMAND="git commit"
git commit --quiet -m "$MESSAGE"
COMMITTED=true
CURRENT_COMMAND="git push $REMOTE $DEPLOY_BRANCH"
git push --quiet "$REMOTE" "$DEPLOY_BRANCH"
CURRENT_COMMAND=""

COMMIT="$(git rev-parse --short HEAD)"
printf '\n%s✓ Deployed: pushed to %s/%s%s\n' "$GREEN$BOLD" "$REMOTE" "$DEPLOY_BRANCH" "$RESET"
info "Commit:   $COMMIT  $MESSAGE"
info "Branch:   $DEPLOY_BRANCH"
info "Frontend: $FRONTEND_TARGET"
info "Backend:  $BACKEND_TARGET"
info "Vercel and Render deploy automatically from this push; follow progress in their dashboards."
info "Render applies database migrations when the API container starts."
