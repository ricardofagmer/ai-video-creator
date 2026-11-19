#!/bin/bash
#
# Video Studio installer (SPEC 0002 R1-22, PRD 0001 section 11). Run it in Terminal on the Mac
# that hosts the studio:
#
#   scripts/install.sh [--dry-run] [--yes] [--reset-passphrase]
#
#   --dry-run           lists every step and what it would change, and changes nothing. It only
#                       reads state: command lookups, versions, file tests, `launchctl print`.
#   --yes               skips the single Homebrew confirmation, and nothing else.
#   --reset-passphrase  runs `studio passphrase set` to replace the web passphrase.
#
# Safe to rerun (criterion 2): every step checks state first and skips or no-ops when it is
# already satisfied; no step resets, deletes or rewrites user data. It never uses sudo, never
# installs Homebrew, never asks for or stores a provider key, and never sees the passphrase: the
# CLI reads it on the terminal and stores only its argon2id hash (A13). No Python (criterion 30).

set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd -P)"
# shellcheck source=lib/common.sh
. "$SCRIPT_DIR/lib/common.sh"

readonly TOTAL_STEPS=14
readonly MIN_NODE_MAJOR=22

# No telemetry from the build tools this script runs (PRD 12 "no telemetry"). Not secrets.
export DO_NOT_TRACK=1 TURBO_TELEMETRY_DISABLED=1 NEXT_TELEMETRY_DISABLED=1 CHECKPOINT_DISABLE=1
# Corepack fetches the pinned pnpm without an interactive prompt; the Homebrew step already asked.
export COREPACK_ENABLE_DOWNLOAD_PROMPT=0

ASSUME_YES=0
RESET_PASSPHRASE=0
NODE_BIN=''
PNPM_VERSION=''
LINK_PATH=''
PASSPHRASE_STATE='não verificada'
SUMMARY_NOTES=''
PLIST_TEMP=''
IS_RERUN=0

usage() {
  cat <<'USAGE'
Uso: scripts/install.sh [--dry-run] [--yes] [--reset-passphrase]

  --dry-run           mostra cada etapa e o que mudaria, sem mudar nada
  --yes               pula só a confirmação do Homebrew
  --reset-passphrase  define uma nova senha do studio
USAGE
}

parse_arguments() {
  while [ "$#" -gt 0 ]; do
    case "$1" in
      --dry-run) DRY_RUN=1 ;;
      --yes) ASSUME_YES=1 ;;
      --reset-passphrase) RESET_PASSPHRASE=1 ;;
      -h | --help)
        usage
        exit 0
        ;;
      *)
        usage >&2
        die "opção desconhecida: $1"
        ;;
    esac
    shift
  done
}

add_note() {
  SUMMARY_NOTES="${SUMMARY_NOTES}  - $1${NEWLINE}"
}

cleanup() {
  if [ -n "$PLIST_TEMP" ] && [ -f "$PLIST_TEMP" ]; then
    rm -f "$PLIST_TEMP"
  fi
}

# ---------------------------------------------------------------------------------------------
# 1. macOS, Apple Silicon, Homebrew
# ---------------------------------------------------------------------------------------------

step_platform() {
  begin_step 1 "$TOTAL_STEPS" 'macOS, arquitetura e Homebrew'
  if [ "$(uname -s)" != 'Darwin' ]; then
    die 'este instalador roda só no macOS.'
  fi
  if [ "$UID" -eq 0 ]; then
    die 'não rode como root nem com sudo: o studio é instalado para o seu usuário.'
  fi
  case "$(uname -m)" in
    arm64) info 'macOS em Apple Silicon (arm64).' ;;
    x86_64)
      if [ "$(sysctl -n hw.optional.arm64 2>/dev/null || true)" = '1' ]; then
        die 'este terminal roda sob Rosetta (x86_64); abra um terminal nativo arm64 e rode de novo.'
      fi
      die 'Mac Intel (x86_64) não é suportado no R1 (SPEC 0002 A18: somente Apple Silicon).'
      ;;
    *) die "arquitetura $(uname -m) não suportada (SPEC 0002 A18: somente Apple Silicon)." ;;
  esac
  if command -v brew >/dev/null 2>&1; then
    info "Homebrew em $(command -v brew)."
  elif [ -x /opt/homebrew/bin/brew ]; then
    # Homebrew is installed but this shell never ran its shellenv: use it for this run only.
    PATH="/opt/homebrew/bin:/opt/homebrew/sbin:$PATH"
    export PATH
    info 'Homebrew em /opt/homebrew/bin (fora do PATH deste terminal; usado só nesta execução).'
  else
    die 'Homebrew não encontrado. Instale-o seguindo https://brew.sh e rode este script de novo (o instalador não instala o Homebrew).'
  fi
}

# ---------------------------------------------------------------------------------------------
# 2. Homebrew dependencies: node >= 22, ffmpeg/ffprobe (and corepack when node lacks it)
# ---------------------------------------------------------------------------------------------

node_major_on_path() {
  local version
  if ! command -v node >/dev/null 2>&1; then
    return 0
  fi
  version="$(node --version 2>/dev/null || true)"
  version="${version#v}"
  printf '%s' "${version%%.*}"
}

node_is_satisfying() {
  local major
  major="$(node_major_on_path)"
  is_number "$major" && [ "$major" -ge "$MIN_NODE_MAJOR" ]
}

ffmpeg_is_present() {
  command -v ffmpeg >/dev/null 2>&1 && command -v ffprobe >/dev/null 2>&1
}

step_homebrew_dependencies() {
  begin_step 2 "$TOTAL_STEPS" 'dependências do Homebrew'
  local formulas=() node_listed=0
  if node_is_satisfying; then
    info "node $(node --version) ok."
  else
    formulas+=(node)
    node_listed=1
    if command -v node >/dev/null 2>&1; then
      info "node $(node --version 2>/dev/null || printf '?') é anterior ao $MIN_NODE_MAJOR."
    else
      info 'node ausente.'
    fi
  fi
  if ffmpeg_is_present; then
    info 'ffmpeg e ffprobe ok.'
  else
    formulas+=(ffmpeg)
    info 'ffmpeg/ffprobe ausente.'
  fi
  # Node 25 and later no longer bundle Corepack. With node itself missing, the check waits until
  # after its install, under the same confirmation.
  if [ "$node_listed" -eq 0 ] && ! command -v corepack >/dev/null 2>&1; then
    formulas+=(corepack)
    info 'corepack ausente.'
  fi

  if [ "${#formulas[@]}" -eq 0 ]; then
    info 'nada a instalar pelo Homebrew.'
  else
    say "  Faltando: ${formulas[*]}"
    if [ "$node_listed" -eq 1 ]; then
      info '(e corepack, se o node instalado não o trouxer)'
    fi
    if [ "$DRY_RUN" -eq 0 ] && [ "$ASSUME_YES" -eq 0 ]; then
      if ! confirm "  Rodar 'brew install ${formulas[*]}' agora?"; then
        die "cancelado: instale ${formulas[*]} e rode o script de novo."
      fi
    fi
    run brew install "${formulas[@]}"
    hash -r
    if [ "$DRY_RUN" -eq 0 ] && [ "$node_listed" -eq 1 ] && ! command -v corepack >/dev/null 2>&1; then
      run brew install corepack
      hash -r
    fi
  fi

  if [ "$DRY_RUN" -eq 0 ]; then
    if ! node_is_satisfying; then
      die "o node do PATH ($(command -v node || printf 'nenhum')) ainda é anterior ao $MIN_NODE_MAJOR; ajuste o PATH (nvm, asdf...) para o node do Homebrew e rode de novo."
    fi
    if ! ffmpeg_is_present; then
      die 'ffmpeg/ffprobe continuam fora do PATH depois do brew install.'
    fi
    if ! command -v corepack >/dev/null 2>&1; then
      die 'corepack continua fora do PATH depois do brew install.'
    fi
  fi
  if command -v node >/dev/null 2>&1; then
    NODE_BIN="$(real_path "$(command -v node)")"
    # A Cellar realpath disappears on `brew upgrade node`, which would stop the watcher agent.
    # Homebrew's opt link survives upgrades, so use it when it resolves to the same binary.
    local brew_node_prefix=''
    brew_node_prefix="$(brew --prefix node 2>/dev/null || true)"
    if [ -n "$brew_node_prefix" ] && [ -x "$brew_node_prefix/bin/node" ] &&
      [ "$(real_path "$brew_node_prefix/bin/node")" = "$NODE_BIN" ]; then
      NODE_BIN="$brew_node_prefix/bin/node"
    fi
    info "node usado pelo studio: $NODE_BIN"
  fi
}

# ---------------------------------------------------------------------------------------------
# 3. pnpm through Corepack, at the version pinned in package.json "packageManager"
# ---------------------------------------------------------------------------------------------

read_pinned_pnpm_version() {
  local spec
  spec="$(sed -n 's/^[[:space:]]*"packageManager":[[:space:]]*"pnpm@\([^"]*\)".*/\1/p' "$REPO_ROOT/package.json")"
  spec="${spec%%+*}"
  case "$spec" in
    '' | *[!0-9.]*) die 'package.json não fixa o pnpm em "packageManager" (esperado "pnpm@X.Y.Z").' ;;
  esac
  PNPM_VERSION="$spec"
}

step_pnpm() {
  read_pinned_pnpm_version
  begin_step 3 "$TOTAL_STEPS" "pnpm $PNPM_VERSION via Corepack"
  local pnpm_path corepack_dir current
  if command -v pnpm >/dev/null 2>&1; then
    pnpm_path="$(real_path "$(command -v pnpm)")"
    case "$pnpm_path" in
      */corepack/shims/*) info 'o comando pnpm já é o do Corepack.' ;;
      *) warn "o pnpm em $(command -v pnpm) não vem do Corepack e foi mantido; este script usa 'corepack pnpm' na versão $PNPM_VERSION." ;;
    esac
  elif command -v corepack >/dev/null 2>&1; then
    corepack_dir="$(dirname "$(command -v corepack)")"
    if [ -w "$corepack_dir" ]; then
      run corepack enable pnpm
    else
      # The node folder belongs to another user (an installer package): put the shim in the
      # user's own bin folder instead, never with sudo.
      run mkdir -p "$HOME/.local/bin"
      run corepack enable --install-directory "$HOME/.local/bin" pnpm
    fi
  else
    run corepack enable pnpm
  fi
  # Reads "packageManager" from the repo root (the current folder); a no-op when cached.
  run corepack install
  if [ "$DRY_RUN" -eq 0 ]; then
    current="$(corepack pnpm --version)"
    if [ "$current" != "$PNPM_VERSION" ]; then
      die "corepack pnpm respondeu $current, esperado $PNPM_VERSION."
    fi
    info "pnpm $current ativo neste repositório."
  fi
}

# ---------------------------------------------------------------------------------------------
# 4. Workspace dependencies
# ---------------------------------------------------------------------------------------------

step_workspace_install() {
  begin_step 4 "$TOTAL_STEPS" 'dependências do workspace'
  if [ -f "$REPO_ROOT/pnpm-lock.yaml" ]; then
    run corepack pnpm install --frozen-lockfile
  else
    info 'sem pnpm-lock.yaml: rodando "pnpm install" sem --frozen-lockfile; o pnpm cria o lockfile no repositório.'
    add_note 'pnpm-lock.yaml foi criado por esta instalação; revise e versione-o.'
    run corepack pnpm install
  fi
}

# ---------------------------------------------------------------------------------------------
# 5. Build (Turborepo, root "build" script)
# ---------------------------------------------------------------------------------------------

step_build() {
  begin_step 5 "$TOTAL_STEPS" 'build (turbo run build)'
  run corepack pnpm run build
  if [ "$DRY_RUN" -eq 0 ]; then
    if [ ! -f "$CLI_MAIN" ]; then
      die "o build não gerou $CLI_MAIN."
    fi
    if [ ! -f "$WATCHER_MAIN" ]; then
      die "o build não gerou $WATCHER_MAIN."
    fi
    info 'build pronto (o cache do Turborepo pula o que não mudou).'
  fi
}

# ---------------------------------------------------------------------------------------------
# 6. Data home folders, mode 700 (D5)
# ---------------------------------------------------------------------------------------------

ensure_private_directory() {
  local mode
  if [ -L "$1" ]; then
    die "$1 é um link simbólico; esperado uma pasta."
  fi
  if [ -d "$1" ]; then
    mode="$(stat -f '%Lp' "$1")"
    if [ "$mode" = '700' ]; then
      info "ok: $1 (700)"
    else
      run chmod 700 "$1"
      outcome "permissão ajustada para 700: $1 (era $mode)" "ajustaria a permissão para 700: $1 (hoje $mode)"
    fi
    return 0
  fi
  if [ -e "$1" ]; then
    die "$1 existe e não é uma pasta."
  fi
  run mkdir -m 700 "$1"
  outcome "criada: $1 (700)" "criaria: $1 (700)"
}

step_data_home() {
  begin_step 6 "$TOTAL_STEPS" 'pasta de dados'
  local folder
  if [ "$DRY_RUN" -eq 1 ]; then
    resolve_data_home_expected
    info "(simulação) pasta prevista: $DATA_HOME (o valor final vem de @studio/core depois do build)"
  elif ! resolve_data_home_with_core "$NODE_BIN"; then
    die 'o @studio/core construído não informou a pasta de dados; confira o build da etapa 5.'
  fi
  assert_data_home_shape "$DATA_HOME"
  if [ ! -d "$(dirname "$DATA_HOME")" ]; then
    die "a pasta-mãe de $DATA_HOME não existe; crie-a ou ajuste VIDEO_STUDIO_HOME."
  fi
  for folder in "$DATA_HOME" "$DATA_HOME/db" "$DATA_HOME/assets" "$DATA_HOME/runs" "$DATA_HOME/logs"; do
    ensure_private_directory "$folder"
  done
}

# ---------------------------------------------------------------------------------------------
# 7. Local search model (optional: a failure warns and the install goes on, SPEC 0003 B7)
# ---------------------------------------------------------------------------------------------

step_embedding_model() {
  begin_step 7 "$TOTAL_STEPS" 'modelo da busca por significado (opcional)'
  local status=0 arguments=(--data-home "$DATA_HOME")
  if [ -n "$NODE_BIN" ]; then
    arguments+=(--node "$NODE_BIN")
  fi
  if [ "$DRY_RUN" -eq 1 ]; then
    arguments+=(--dry-run)
  fi
  # The feature's only network use (SPEC 0003 Q6): pinned files from the revision named in
  # scripts/models/embedding-model.source.json, each checked against the manifest's sha-256. No
  # catalog data exists in that process. On --dry-run it only reads state and prints what it would do.
  "$BASH" "$SCRIPT_DIR/models/fetch-embedding-model.sh" "${arguments[@]}" || status=$?
  case "$status" in
    0) ;;
    2)
      warn 'o manifesto do modelo de busca ainda tem valores provisórios; nada foi baixado e a busca por significado fica indisponível. O resto do studio funciona.'
      add_note 'busca por significado: o modelo ainda não foi fixado em scripts/models (manifesto provisório).'
      ;;
    *)
      warn "o modelo de busca não foi instalado (código $status); a busca por significado fica indisponível. O resto do studio funciona."
      add_note 'busca por significado: modelo ausente; rode "studio models fetch" quando a rede estiver disponível.'
      ;;
  esac
}

# ---------------------------------------------------------------------------------------------
# 8. Prisma migrations against the data-home database
# ---------------------------------------------------------------------------------------------

step_migrations() {
  begin_step 8 "$TOTAL_STEPS" 'migrações do banco (prisma migrate deploy)'
  info "banco: $DATA_HOME/db/studio.sqlite"
  # Only pending migrations are applied; never `migrate dev`, `db push` or a reset. The URL comes
  # from core's sqliteDatasourceUrl and is set for this one command only.
  run env "VIDEO_STUDIO_DATABASE_URL=${DATABASE_URL:-<url calculada pelo @studio/core>}" \
    corepack pnpm --filter @studio/core run prisma:migrate:deploy
}

# ---------------------------------------------------------------------------------------------
# 9. Playwright browser (Chromium only)
# ---------------------------------------------------------------------------------------------

step_playwright() {
  begin_step 9 "$TOTAL_STEPS" 'navegador do Playwright (Chromium)'
  # Uses the workspace's Playwright (packages/toolbox); an installed revision is skipped.
  run corepack pnpm --filter @ace/toolbox exec playwright install chromium
}

# ---------------------------------------------------------------------------------------------
# 10. Web passphrase (only its hash is stored, by the CLI)
# ---------------------------------------------------------------------------------------------

step_passphrase() {
  begin_step 10 "$TOTAL_STEPS" 'senha do studio'
  local status=0
  if [ "$DRY_RUN" -eq 1 ]; then
    if [ "$RESET_PASSPHRASE" -eq 1 ]; then
      info '(simulação) executaria "studio passphrase set" para trocar a senha.'
    else
      info '(simulação) executaria "studio passphrase status" e, se a senha não existir, "studio passphrase set".'
    fi
    PASSPHRASE_STATE='não alterada (simulação)'
    return 0
  fi
  if [ ! -t 0 ] || [ ! -t 1 ]; then
    if [ "$RESET_PASSPHRASE" -eq 1 ]; then
      die '--reset-passphrase precisa de um terminal interativo.'
    fi
    warn 'sem terminal interativo: senha não pedida.'
    PASSPHRASE_STATE='não definida nesta execução'
    add_note 'defina a senha do web com: studio passphrase set'
    return 0
  fi
  if [ "$RESET_PASSPHRASE" -eq 1 ]; then
    info 'definindo uma nova senha (--reset-passphrase).'
  else
    local existing_status=0
    "$NODE_BIN" "$CLI_MAIN" passphrase status >/dev/null 2>&1 || existing_status=$?
    if [ "$existing_status" -eq 0 ]; then
      PASSPHRASE_STATE='mantida (já definida; use --reset-passphrase para trocar)'
      info 'senha já definida; nada a fazer.'
      return 0
    fi
    if [ "$existing_status" -ne 3 ]; then
      info 'não foi possível saber se a senha existe. Se você já a definiu, pressione Ctrl-C para mantê-la.'
    fi
  fi
  # The CLI reads the passphrase itself with echo off; this script never sees it. A handler (not
  # an ignore) keeps Ctrl-C from ending the installer while the CLI still receives it.
  trap ':' INT
  "$NODE_BIN" "$CLI_MAIN" passphrase set || status=$?
  trap - INT
  case "$status" in
    0) PASSPHRASE_STATE='definida (somente o hash argon2id foi gravado)' ;;
    130)
      PASSPHRASE_STATE='mantida (Ctrl-C)'
      info 'senha não alterada.'
      ;;
    *)
      PASSPHRASE_STATE="não definida (studio passphrase set saiu com código $status)"
      warn 'a senha não foi gravada.'
      add_note 'defina a senha do web com: studio passphrase set'
      ;;
  esac
}

# ---------------------------------------------------------------------------------------------
# 11. `studio` on the PATH (symlink, no sudo)
# ---------------------------------------------------------------------------------------------

# Prints the existing `studio` link of this repo, if any, in either candidate folder.
existing_repo_link() {
  local directory
  while IFS= read -r directory; do
    if link_points_into_repo "$directory/studio"; then
      printf '%s' "$directory/studio"
      return 0
    fi
  done <<EOF
$(cli_link_directories)
EOF
}

# ~/.local/bin, unless it is off the PATH while a writable /usr/local/bin is on it.
choose_link_directory() {
  if ! dir_on_path "$HOME/.local/bin" && [ -d /usr/local/bin ] && [ -w /usr/local/bin ] && dir_on_path /usr/local/bin; then
    printf '%s' '/usr/local/bin'
  else
    printf '%s' "$HOME/.local/bin"
  fi
}

step_link_cli() {
  begin_step 11 "$TOTAL_STEPS" 'comando studio no PATH'
  local link directory
  link="$(existing_repo_link)"
  if [ -n "$link" ]; then
    if [ "$(readlink "$link")" = "$CLI_MAIN" ]; then
      info "ok: $link -> $CLI_MAIN"
    else
      run ln -sfh "$CLI_MAIN" "$link"
      outcome "link atualizado: $link -> $CLI_MAIN" "atualizaria o link: $link -> $CLI_MAIN"
    fi
  else
    directory="$(choose_link_directory)"
    link="$directory/studio"
    if [ -e "$link" ] || [ -L "$link" ]; then
      die "$link já existe e não é deste studio; renomeie-o ou remova-o e rode de novo."
    fi
    if [ ! -d "$directory" ]; then
      run mkdir -p "$directory"
    fi
    run ln -s "$CLI_MAIN" "$link"
    outcome "link criado: $link -> $CLI_MAIN" "criaria o link: $link -> $CLI_MAIN"
  fi
  LINK_PATH="$link"
  if ! dir_on_path "$(dirname "$link")"; then
    warn "$(dirname "$link") não está no PATH."
    add_note "adicione ao ~/.zshrc: export PATH=\"$(dirname "$link"):\$PATH\""
  fi
  if [ "$DRY_RUN" -eq 0 ] && [ ! -x "$CLI_MAIN" ]; then
    warn "$CLI_MAIN não é executável; o comando studio no PATH falha até o build do CLI marcar o arquivo."
    add_note "o comando studio no PATH ainda não executa ($CLI_MAIN sem permissão de execução); enquanto isso use: node \"$CLI_MAIN\" <comando>"
  fi
}

# ---------------------------------------------------------------------------------------------
# 12. launchd agent of the watcher
# ---------------------------------------------------------------------------------------------

# Plist values are substituted verbatim, so only plain path characters are accepted: nothing that
# needs XML escaping or is special in a bash replacement (&, <, >, quotes, backslash).
assert_plist_path() {
  case "$2" in
    /*) ;;
    *) die "$1 não é um caminho absoluto: $2" ;;
  esac
  case "$2" in
    *[![:alnum:]\ ._/@+-]*) die "$1 tem caracteres que o plist não aceita sem escape: $2" ;;
  esac
}

# Template with its header comment removed (it documents the placeholders) and the four
# placeholders replaced. Fails when a placeholder survives.
render_plist() {
  local content
  content="$(cat "$PLIST_TEMPLATE")"
  case "$content" in
    *"<!--"*"-->"*) content="${content%%"<!--"*}${content#*"-->"}" ;;
  esac
  content="${content//__NODE_BIN__/$NODE_BIN}"
  content="${content//__WATCHER_MAIN__/$WATCHER_MAIN}"
  content="${content//__WORKING_DIR__/$WATCHER_DIR}"
  content="${content//__LOGS_DIR__/$DATA_HOME/logs}"
  case "$content" in
    *__NODE_BIN__* | *__WATCHER_MAIN__* | *__WORKING_DIR__* | *__LOGS_DIR__*)
      die 'um marcador do modelo do plist não foi substituído.' ;;
  esac
  printf '%s\n' "$content"
}

step_launchd() {
  begin_step 12 "$TOTAL_STEPS" "agente launchd do watcher ($STUDIO_LAUNCHD_LABEL)"
  local changed=1
  if [ ! -f "$PLIST_TEMPLATE" ]; then
    die "modelo do plist não encontrado: $PLIST_TEMPLATE"
  fi
  if [ "$DRY_RUN" -eq 1 ]; then
    info "(simulação) node: ${NODE_BIN:-<node do Homebrew>}; watcher: $WATCHER_MAIN; logs: $DATA_HOME/logs"
    info "(simulação) geraria o plist a partir de $PLIST_TEMPLATE, validaria com plutil -lint e gravaria $PLIST_PATH (644) se o conteúdo mudou; então:"
    run launchctl bootout "$LAUNCHD_SERVICE_TARGET"
    run launchctl bootstrap "gui/$UID" "$PLIST_PATH"
    return 0
  fi
  if [ ! -f "$WATCHER_MAIN" ]; then
    die "watcher não construído: $WATCHER_MAIN"
  fi
  assert_plist_path 'node' "$NODE_BIN"
  assert_plist_path 'watcher' "$WATCHER_MAIN"
  assert_plist_path 'pasta do watcher' "$WATCHER_DIR"
  assert_plist_path 'pasta de logs' "$DATA_HOME/logs"

  if [ ! -d "$LAUNCH_AGENTS_DIR" ]; then
    mkdir -p "$LAUNCH_AGENTS_DIR"
  fi
  # Written under umask 022 so the file is 644 without a chmod; checked before it replaces anything.
  PLIST_TEMP="$PLIST_PATH.tmp.$$"
  (umask 022 && render_plist >"$PLIST_TEMP")
  plutil -lint -s "$PLIST_TEMP"
  if [ -f "$PLIST_PATH" ] && [ "$(stat -f '%Lp' "$PLIST_PATH")" = '644' ] && cmp -s "$PLIST_TEMP" "$PLIST_PATH"; then
    changed=0
    rm -f "$PLIST_TEMP"
    info "plist sem mudança: $PLIST_PATH"
  else
    mv -f "$PLIST_TEMP" "$PLIST_PATH"
    info "plist gravado: $PLIST_PATH (644)"
  fi
  PLIST_TEMP=''

  if [ "$changed" -eq 0 ] && launchd_agent_loaded; then
    info 'agente já carregado com este plist; não foi reiniciado.'
    IS_RERUN=1
    add_note "se o build do watcher mudou, reinicie-o com: launchctl kickstart -k $LAUNCHD_SERVICE_TARGET"
    return 0
  fi
  if launchd_agent_loaded; then
    info 'o plist mudou: o watcher é reiniciado; uma execução em andamento retoma do passo atual.'
  fi
  bootout_agent
  launchctl bootstrap "gui/$UID" "$PLIST_PATH"
  if ! launchd_agent_loaded; then
    die "launchctl não mostra o agente $STUDIO_LAUNCHD_LABEL depois do bootstrap."
  fi
  info "agente $STUDIO_LAUNCHD_LABEL registrado (inicia no login e reinicia se cair)."
}

# ---------------------------------------------------------------------------------------------
# 13. Seed catalog
# ---------------------------------------------------------------------------------------------

step_seed() {
  begin_step 13 "$TOTAL_STEPS" 'catálogo inicial (studio catalog seed)'
  local status=0 arguments=(catalog seed)
  if [ -n "${VIDEO_STUDIO_SEED_SOURCE_ROOT:-}" ]; then
    arguments+=(--source-root "$VIDEO_STUDIO_SEED_SOURCE_ROOT")
  fi
  # Idempotent in core: an entry whose hash already exists is reported "sem mudança".
  run "${NODE_BIN:-node}" "$CLI_MAIN" "${arguments[@]}" || status=$?
  case "$status" in
    0) ;;
    7)
      warn 'o seed terminou com itens com falha (listados acima).'
      add_note 'alguns itens do seed falharam; veja a saída da etapa 13 e rode "studio catalog seed" de novo.'
      ;;
    *) die "studio catalog seed saiu com código $status." ;;
  esac
}

# ---------------------------------------------------------------------------------------------
# 14. Start web and api, doctor, summary
# ---------------------------------------------------------------------------------------------

web_url() {
  local port="${VIDEO_STUDIO_WEB_PORT:-$STUDIO_DEFAULT_WEB_PORT}"
  if ! is_number "$port"; then
    port="$STUDIO_DEFAULT_WEB_PORT"
  fi
  printf 'http://127.0.0.1:%s' "$port"
}

print_summary() {
  local doctor_status="$1"
  say ''
  if [ "$DRY_RUN" -eq 1 ]; then
    say 'Simulação concluída: nada foi alterado.'
    return 0
  fi
  if [ "$doctor_status" -eq 0 ]; then
    say 'Video Studio instalado.'
  else
    say "Video Studio instalado, mas o studio doctor apontou problemas (código $doctor_status)."
  fi
  info "Web:            $(web_url)"
  info "Dados:          $DATA_HOME"
  info "Watcher:        agente launchd $STUDIO_LAUNCHD_LABEL"
  info "Comando:        ${LINK_PATH:-não ligado}"
  info "Senha:          $PASSPHRASE_STATE"
  info 'Chaves:         nenhuma foi pedida; sem chaves o studio roda em modo simulado.'
  info '                Para provedores reais: studio secrets set anthropic-api-key'
  info '                                       studio secrets set elevenlabs-api-key'
  if [ -n "$SUMMARY_NOTES" ]; then
    say 'Pendências:'
    printf '%s' "$SUMMARY_NOTES"
  fi
}

step_start_and_doctor() {
  begin_step 14 "$TOTAL_STEPS" 'iniciar web e api, studio doctor'
  local status=0 doctor_status=0
  # "já estava rodando" is a success; a rerun does not restart services that are already up.
  run "${NODE_BIN:-node}" "$CLI_MAIN" start || status=$?
  if [ "$status" -ne 0 ]; then
    warn "studio start saiu com código $status; o doctor abaixo mostra o motivo."
  fi
  run "${NODE_BIN:-node}" "$CLI_MAIN" doctor || doctor_status=$?
  if [ "$doctor_status" -ne 0 ]; then
    add_note 'rode "studio doctor" depois de corrigir os itens marcados.'
  fi
  if [ "$IS_RERUN" -eq 1 ]; then
    add_note 'se o build mudou e web/api já estavam rodando, recarregue com: studio stop && studio start'
  fi
  print_summary "$doctor_status"
  if [ "$doctor_status" -ne 0 ]; then
    die "studio doctor saiu com código $doctor_status."
  fi
}

main() {
  parse_arguments "$@"
  enable_error_trap
  trap cleanup EXIT
  resolve_repo_root "$SCRIPT_DIR"
  # Corepack reads "packageManager" from the current folder; every pnpm call below runs here.
  cd "$REPO_ROOT"
  say "Video Studio: instalação em $REPO_ROOT"
  if [ "$DRY_RUN" -eq 1 ]; then
    say 'Modo simulação (--dry-run): só leitura de estado; nada é instalado, gravado ou registrado.'
  fi
  step_platform
  step_homebrew_dependencies
  step_pnpm
  step_workspace_install
  step_build
  step_data_home
  step_embedding_model
  step_migrations
  step_playwright
  step_passphrase
  step_link_cli
  step_launchd
  step_seed
  step_start_and_doctor
}

main "$@"
