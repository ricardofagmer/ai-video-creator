# shellcheck shell=bash
# shellcheck disable=SC2034  # constants and paths here are read by the scripts that source this file
#
# Shared helpers of scripts/install.sh and scripts/uninstall.sh (SPEC 0002 R1-22). Sourced, never
# executed. Written for the bash 3.2 that ships with macOS: no associative arrays, no mapfile, no
# case-changing expansions, and no expansion of an array that may be empty (set -u rejects it).
#
# Nothing here reads, prints or stores a secret. Values that reach a log are paths, versions and
# exit codes only.

# A9: launchd label of the watcher user agent; doctor (tools/cli) reads the same label.
readonly STUDIO_LAUNCHD_LABEL='com.videostudio.watcher'
# A9: default web port; `studio` reads VIDEO_STUDIO_WEB_PORT to move it.
readonly STUDIO_DEFAULT_WEB_PORT='4310'
# Keychain item names written by `studio secrets set` (packages/core/src/secrets/secret-names.ts,
# KEYCHAIN_SERVICE and KEYCHAIN_ACCOUNTS). Names only, never values; keep in step with that file.
readonly STUDIO_KEYCHAIN_SERVICE='com.videostudio.provider-keys'
STUDIO_KEYCHAIN_ACCOUNTS=(anthropic-api-key elevenlabs-api-key)

readonly NEWLINE=$'\n'

DRY_RUN=0
CURRENT_STEP='preparação'

# Set by resolve_repo_root / define_studio_paths.
REPO_ROOT=''
CLI_PACKAGE_JSON=''
CLI_MAIN=''
WATCHER_DIR=''
WATCHER_MAIN=''
PLIST_TEMPLATE=''
LAUNCH_AGENTS_DIR=''
PLIST_PATH=''
LAUNCHD_SERVICE_TARGET=''

# Set by resolve_data_home_expected / resolve_data_home_with_core.
DATA_HOME=''
DATABASE_URL=''

# ---------------------------------------------------------------------------------------------
# Output
# ---------------------------------------------------------------------------------------------

say() { printf '%s\n' "$*"; }
info() { printf '  %s\n' "$*"; }
warn() { printf '  AVISO: %s\n' "$*" >&2; }

# One line naming the step that stopped, then exit 1.
die() {
  printf 'ERRO na etapa %s: %s\n' "$CURRENT_STEP" "$*" >&2
  exit 1
}

# Prints the first text on a real run and the second on --dry-run.
outcome() {
  if [ "$DRY_RUN" -eq 1 ]; then info "(simulação) $2"; else info "$1"; fi
}

begin_step() {
  CURRENT_STEP="$1/$2 ($3)"
  printf '\n[%s/%s] %s\n' "$1" "$2" "$3"
}

on_error() {
  printf 'ERRO na etapa %s: um comando saiu com código %s (linha %s). Nada foi desfeito; corrija a causa e rode o script de novo, ele é seguro para repetir.\n' \
    "$CURRENT_STEP" "$1" "$2" >&2
  exit "$1"
}

enable_error_trap() {
  trap 'on_error "$?" "$LINENO"' ERR
}

# ---------------------------------------------------------------------------------------------
# Execution
# ---------------------------------------------------------------------------------------------

# Runs a command, or on --dry-run prints it (shell-quoted) and runs nothing.
run() {
  if [ "$DRY_RUN" -eq 1 ]; then
    printf '  (simulação) executaria:'
    printf ' %q' "$@"
    printf '\n'
    return 0
  fi
  "$@"
}

# y/N question on the terminal. Without a terminal the answer is "no": silence is never consent.
confirm() {
  local answer=''
  if [ ! -t 0 ]; then
    return 1
  fi
  printf '%s [s/N] ' "$1"
  IFS= read -r answer || return 1
  case "$answer" in
    s | S | sim | Sim | SIM | y | Y | yes) return 0 ;;
    *) return 1 ;;
  esac
}

# ---------------------------------------------------------------------------------------------
# Small predicates
# ---------------------------------------------------------------------------------------------

is_number() {
  case "$1" in
    '' | *[!0-9]*) return 1 ;;
    *) return 0 ;;
  esac
}

trim() {
  local value="$1"
  value="${value#"${value%%[![:space:]]*}"}"
  value="${value%"${value##*[![:space:]]}"}"
  printf '%s' "$value"
}

dir_on_path() {
  case ":${PATH}:" in
    *":$1:"*) return 0 ;;
    *) return 1 ;;
  esac
}

# True when $1 equals $2 or lies under it (textual; both must be absolute and normalized).
path_is_within() {
  if [ "$2" = '/' ]; then
    return 0
  fi
  case "$1" in
    "$2" | "$2"/*) return 0 ;;
    *) return 1 ;;
  esac
}

# Absolute path with every symlink resolved. /bin/realpath exists from macOS 13; the readlink
# loop covers older systems.
real_path() {
  local target="$1" link
  if command -v realpath >/dev/null 2>&1; then
    realpath "$target"
    return
  fi
  while [ -L "$target" ]; do
    link="$(readlink "$target")"
    case "$link" in
      /*) target="$link" ;;
      *) target="$(dirname "$target")/$link" ;;
    esac
  done
  printf '%s/%s\n' "$(cd "$(dirname "$target")" && pwd -P)" "$(basename "$target")"
}

# ---------------------------------------------------------------------------------------------
# Repository and studio paths
# ---------------------------------------------------------------------------------------------

# $1 = the scripts/ folder. The repo root is its parent; it must look like the studio monorepo.
resolve_repo_root() {
  REPO_ROOT="$(cd "$1/.." && pwd -P)"
  if [ ! -f "$REPO_ROOT/package.json" ] || [ ! -f "$REPO_ROOT/pnpm-workspace.yaml" ] || [ ! -d "$REPO_ROOT/apps/watcher" ]; then
    die "não encontrei o monorepo do Video Studio em $REPO_ROOT (esperado package.json, pnpm-workspace.yaml e apps/watcher)."
  fi
  define_studio_paths
}

define_studio_paths() {
  CLI_PACKAGE_JSON="$REPO_ROOT/tools/cli/package.json"
  # tools/cli/package.json "bin": { "studio": "dist/main.js" }
  CLI_MAIN="$REPO_ROOT/tools/cli/dist/main.js"
  WATCHER_DIR="$REPO_ROOT/apps/watcher"
  WATCHER_MAIN="$WATCHER_DIR/dist/main.js"
  PLIST_TEMPLATE="$WATCHER_DIR/launchd/$STUDIO_LAUNCHD_LABEL.plist.template"
  LAUNCH_AGENTS_DIR="$HOME/Library/LaunchAgents"
  PLIST_PATH="$LAUNCH_AGENTS_DIR/$STUDIO_LAUNCHD_LABEL.plist"
  LAUNCHD_SERVICE_TARGET="gui/$UID/$STUDIO_LAUNCHD_LABEL"
}

# Folders where a `studio` link may live, in preference order.
cli_link_directories() {
  printf '%s\n' "$HOME/.local/bin" '/usr/local/bin'
}

# True when the symlink $1 points at a file inside this repository (no `..` tricks accepted).
link_points_into_repo() {
  local target
  if [ ! -L "$1" ]; then
    return 1
  fi
  target="$(readlink "$1")"
  case "$target" in
    /*) ;;
    *) target="$(dirname "$1")/$target" ;;
  esac
  case "$target" in
    */../* | */.. | */./* | */.) return 1 ;;
  esac
  path_is_within "$target" "$REPO_ROOT"
}

# ---------------------------------------------------------------------------------------------
# Data home (D5)
# ---------------------------------------------------------------------------------------------

# Bash mirror of @studio/core `resolveDataHome`: VIDEO_STUDIO_HOME (trimmed) when set, else
# ~/Library/Application Support/VideoStudio. Used for --dry-run and when core is not built;
# a real install takes the value from core itself (resolve_data_home_with_core).
resolve_data_home_expected() {
  local override
  override="$(trim "${VIDEO_STUDIO_HOME:-}")"
  if [ -n "$override" ]; then
    DATA_HOME="$override"
  else
    DATA_HOME="$HOME/Library/Application Support/VideoStudio"
  fi
  DATABASE_URL=''
}

# Asks the built @studio/core for the data home and the SQLite URL, through its public subpaths
# `@studio/core/paths` and `@studio/core/prisma`, resolved from tools/cli (which depends on core).
# The script is a fixed literal; HOME and VIDEO_STUDIO_HOME reach it through the environment only.
readonly CORE_RESOLVE_JS='
const { createRequire } = require("node:module");
const { homedir } = require("node:os");
const load = createRequire(process.argv[1]);
load("reflect-metadata");
const paths = load("@studio/core/paths");
const prisma = load("@studio/core/prisma");
const home = paths.resolveDataHome({ homeDirectory: homedir(), override: process.env[paths.DATA_HOME_ENV_VAR] });
if (/[\r\n]/.test(home.root)) throw new Error("data home contains a line break");
process.stdout.write(home.root + "\n" + prisma.sqliteDatasourceUrl(home.databaseFile) + "\n");
'

# $1 = node binary. Sets DATA_HOME and DATABASE_URL; returns non-zero when core cannot answer.
resolve_data_home_with_core() {
  local output
  # The caller handles the failure, so the inherited ERR trap must not report it from the subshell.
  output="$(
    trap - ERR
    "$1" -e "$CORE_RESOLVE_JS" "$CLI_PACKAGE_JSON"
  )" || return 1
  DATA_HOME="${output%%"$NEWLINE"*}"
  DATABASE_URL="${output#*"$NEWLINE"}"
  DATABASE_URL="${DATABASE_URL%"$NEWLINE"}"
  if [ -z "$DATA_HOME" ] || [ -z "$DATABASE_URL" ]; then
    return 1
  fi
}

# Same shape rules as core: absolute, normalized, no trailing slash, no line break.
assert_data_home_shape() {
  case "$1" in
    /*) ;;
    *) die "pasta de dados inválida ($1): precisa ser um caminho absoluto (VIDEO_STUDIO_HOME)." ;;
  esac
  case "$1" in
    */ | *//* | */./* | */../* | */. | */.. | *"$NEWLINE"*)
      die "pasta de dados inválida ($1): caminho não normalizado (VIDEO_STUDIO_HOME)." ;;
  esac
}

# ---------------------------------------------------------------------------------------------
# launchd
# ---------------------------------------------------------------------------------------------

launchd_agent_loaded() {
  launchctl print "$LAUNCHD_SERVICE_TARGET" >/dev/null 2>&1
}

# Unloads the watcher agent if loaded and waits until launchd lets it go (ExitTimeOut is 30 s).
bootout_agent() {
  local waited=0
  if ! launchd_agent_loaded; then
    info "agente $STUDIO_LAUNCHD_LABEL não estava carregado."
    return 0
  fi
  # A not-loaded race between the check and the call is not an error; the wait below decides.
  run launchctl bootout "$LAUNCHD_SERVICE_TARGET" || true
  if [ "$DRY_RUN" -eq 1 ]; then
    return 0
  fi
  while launchd_agent_loaded; do
    if [ "$waited" -ge 40 ]; then
      die "o agente $STUDIO_LAUNCHD_LABEL não descarregou em 40 s; confira com 'launchctl print $LAUNCHD_SERVICE_TARGET'."
    fi
    sleep 1
    waited=$((waited + 1))
  done
  info "agente $STUDIO_LAUNCHD_LABEL descarregado."
}
