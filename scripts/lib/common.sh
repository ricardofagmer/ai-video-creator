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
# A9: default web port; `studio` reads ENGINEOS_VIDEO_CREATOR_WEB_PORT to move it.
readonly STUDIO_DEFAULT_WEB_PORT='4310'
# A9: default api port; `studio` reads ENGINEOS_VIDEO_CREATOR_API_PORT to move it (tools/cli cli-settings.ts).
readonly STUDIO_DEFAULT_API_PORT='4311'
# Menu-bar app (SPEC 0006 R3-08, ADR 0005): the name and bundle id apps/shell/scripts/package-app.mjs
# gives it. The uninstaller removes only a folder carrying this bundle id.
readonly STUDIO_SHELL_APP_NAME='EngineOS Video Creator'
readonly STUDIO_SHELL_BUNDLE_ID='com.videostudio.shell'
# vetting 0002 section 12: the one host of the Electron framework download and the pinned version.
readonly STUDIO_ELECTRON_DOWNLOAD_HOST='https://github.com/electron/electron/releases/download/'
readonly STUDIO_ELECTRON_VERSION='45.4.1'
# vetting 0002 section 12 "Download redirect variables": every spelling @electron/get 5.1.0 and
# electron 45.4.1 read to redirect the host or path, the cache, the checksum source, the platform,
# the framework folder or the proxy. The installer removes them from the packager's environment and
# never sets one; package-app.mjs refuses to run if any spelling is still set.
STUDIO_ELECTRON_DOWNLOAD_VARIABLES=(
  ELECTRON_MIRROR ELECTRON_NIGHTLY_MIRROR ELECTRON_CUSTOM_DIR ELECTRON_CUSTOM_FILENAME ELECTRON_CUSTOM_VERSION
  NPM_CONFIG_ELECTRON_MIRROR NPM_CONFIG_ELECTRON_NIGHTLY_MIRROR NPM_CONFIG_ELECTRON_CUSTOM_DIR
  NPM_CONFIG_ELECTRON_CUSTOM_FILENAME NPM_CONFIG_ELECTRON_CUSTOM_VERSION
  npm_config_electron_mirror npm_config_electron_nightlyMirror npm_config_electron_nightly_mirror
  npm_config_electron_customDir npm_config_electron_custom_dir npm_config_electron_customFilename
  npm_config_electron_custom_filename npm_config_electron_customVersion npm_config_electron_custom_version
  npm_package_config_electron_mirror npm_package_config_electron_nightlyMirror
  npm_package_config_electron_nightly_mirror npm_package_config_electron_customDir
  npm_package_config_electron_custom_dir npm_package_config_electron_customFilename
  npm_package_config_electron_custom_filename npm_package_config_electron_customVersion
  npm_package_config_electron_custom_version
  electron_config_cache force_no_cache electron_use_remote_checksums npm_config_electron_use_remote_checksums
  ELECTRON_INSTALL_PLATFORM ELECTRON_INSTALL_ARCH ELECTRON_OVERRIDE_DIST_PATH ELECTRON_GET_USE_PROXY
  ELECTRON_SKIP_BINARY_DOWNLOAD
)
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
SHELL_PACKAGE_DIR=''
SHELL_MAIN=''
SHELL_PACKAGE_SCRIPT=''
SHELL_OUT_DIR=''
SHELL_BUILT_APP=''
SHELL_STAMP_FILE=''
SHELL_APPS_DIR=''
SHELL_APP_PATH=''
SHELL_APP_EXECUTABLE=''
ELECTRON_CACHE_DIR=''

# Set by is_studio_shell_app when it answers no: the reason, for the caller's message.
SHELL_APP_REJECTION=''

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
    die "não encontrei o monorepo do EngineOS Video Creator em $REPO_ROOT (esperado package.json, pnpm-workspace.yaml e apps/watcher)."
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
  SHELL_PACKAGE_DIR="$REPO_ROOT/apps/shell"
  # apps/shell/package.json "build" writes dist/main.js; "package" runs scripts/package-app.mjs.
  SHELL_MAIN="$SHELL_PACKAGE_DIR/dist/main.js"
  SHELL_PACKAGE_SCRIPT="$SHELL_PACKAGE_DIR/scripts/package-app.mjs"
  # Build output, ignored by git (`out/`); the packager names its folder <name>-<platform>-<arch>.
  SHELL_OUT_DIR="$SHELL_PACKAGE_DIR/out"
  SHELL_BUILT_APP="$SHELL_OUT_DIR/$STUDIO_SHELL_APP_NAME-darwin-arm64/$STUDIO_SHELL_APP_NAME.app"
  SHELL_STAMP_FILE="$SHELL_OUT_DIR/install-stamp.txt"
  # User-owned install location: no sudo, no /Applications.
  SHELL_APPS_DIR="$HOME/Applications"
  SHELL_APP_PATH="$SHELL_APPS_DIR/$STUDIO_SHELL_APP_NAME.app"
  SHELL_APP_EXECUTABLE="$SHELL_APP_PATH/Contents/MacOS/$STUDIO_SHELL_APP_NAME"
  # vetting 0002 section 12, check 3: env-paths cache of @electron/get on macOS, shared by every
  # Electron project of this user, so the scripts never delete it.
  ELECTRON_CACHE_DIR="$HOME/Library/Caches/electron"
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

# Bash mirror of @studio/core `resolveDataHome`: ENGINEOS_VIDEO_CREATOR_HOME (trimmed) when set, else
# ~/Library/Application Support/VideoStudio. Used for --dry-run and when core is not built;
# a real install takes the value from core itself (resolve_data_home_with_core).
resolve_data_home_expected() {
  local override
  override="$(trim "${ENGINEOS_VIDEO_CREATOR_HOME:-}")"
  if [ -n "$override" ]; then
    DATA_HOME="$override"
  else
    DATA_HOME="$HOME/Library/Application Support/VideoStudio"
  fi
  DATABASE_URL=''
}

# Asks the built @studio/core for the data home and the SQLite URL, through its public subpaths
# `@studio/core/paths` and `@studio/core/prisma`, resolved from tools/cli (which depends on core).
# The script is a fixed literal; HOME and ENGINEOS_VIDEO_CREATOR_HOME reach it through the environment only.
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
    *) die "pasta de dados inválida ($1): precisa ser um caminho absoluto (ENGINEOS_VIDEO_CREATOR_HOME)." ;;
  esac
  case "$1" in
    */ | *//* | */./* | */../* | */. | */.. | *"$NEWLINE"*)
      die "pasta de dados inválida ($1): caminho não normalizado (ENGINEOS_VIDEO_CREATOR_HOME)." ;;
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

# ---------------------------------------------------------------------------------------------
# Menu-bar app (SPEC 0006 R3-08, ADR 0005 decision 5)
# ---------------------------------------------------------------------------------------------

# Prints the CFBundleIdentifier of the app folder $1, or nothing when it has no readable Info.plist.
# PlistBuddy's Print only reads the file.
shell_app_bundle_id() {
  local plist="$1/Contents/Info.plist"
  if [ -L "$plist" ] || [ ! -f "$plist" ]; then
    return 0
  fi
  /usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$plist" 2>/dev/null || true
}

# True when $1 is the menu-bar app this studio installs, by four checks: an absolute, normalized
# path ending in .app; under $HOME/Applications; a real folder, not a symlink; bundle id
# com.videostudio.shell. On "no" the reason is left in SHELL_APP_REJECTION.
is_studio_shell_app() {
  SHELL_APP_REJECTION=''
  case "$1" in
    /*.app) ;;
    *)
      SHELL_APP_REJECTION='não é um caminho absoluto terminado em .app'
      return 1
      ;;
  esac
  case "$1" in
    *//* | */./* | */../*)
      SHELL_APP_REJECTION='caminho não normalizado'
      return 1
      ;;
  esac
  if [ "$1" = "$SHELL_APPS_DIR" ] || ! path_is_within "$1" "$SHELL_APPS_DIR"; then
    SHELL_APP_REJECTION="fora de $SHELL_APPS_DIR"
    return 1
  fi
  if [ -L "$1" ]; then
    SHELL_APP_REJECTION='é um link simbólico'
    return 1
  fi
  if [ ! -d "$1" ]; then
    SHELL_APP_REJECTION='não é uma pasta de app'
    return 1
  fi
  if [ "$(shell_app_bundle_id "$1")" != "$STUDIO_SHELL_BUNDLE_ID" ]; then
    SHELL_APP_REJECTION="o bundle id não é $STUDIO_SHELL_BUNDLE_ID"
    return 1
  fi
}

# True while a process runs from the installed app or from the build output. `ps -o comm` prints
# the executable's full path on macOS; read-only.
shell_app_running() {
  local command_path
  while IFS= read -r command_path; do
    case "$command_path" in
      "$SHELL_APP_PATH/Contents/"* | "$SHELL_BUILT_APP/Contents/"*) return 0 ;;
    esac
  done <<EOF_PROCESSES
$(ps -axo comm= 2>/dev/null || true)
EOF_PROCESSES
  return 1
}

# Asks a running menu-bar app to quit through its bundle id and waits up to 15 s. Never a signal:
# returns non-zero when it is still running (or macOS refused the Apple event), and the caller
# leaves the app in place. The first quit may make macOS ask once to let the terminal control it.
quit_shell_app() {
  local waited=0
  if [ "$DRY_RUN" -eq 1 ]; then
    info '(simulação) se o app do menu estiver aberto, pediria para fechar:'
    run /usr/bin/osascript -e "quit app id \"$STUDIO_SHELL_BUNDLE_ID\""
    return 0
  fi
  if ! shell_app_running; then
    return 0
  fi
  info 'pedindo ao app do menu para fechar.'
  # A refused Apple event is not final: the wait below decides from the process list.
  /usr/bin/osascript -e "quit app id \"$STUDIO_SHELL_BUNDLE_ID\"" >/dev/null 2>&1 || true
  while shell_app_running; do
    if [ "$waited" -ge 15 ]; then
      return 1
    fi
    sleep 1
    waited=$((waited + 1))
  done
  info 'app do menu fechado.'
}
