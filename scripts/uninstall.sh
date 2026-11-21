#!/bin/bash
#
# Video Studio uninstaller (SPEC 0002 R1-22, PRD 0001 section 11, criterion 25):
#
#   scripts/uninstall.sh [--dry-run] [--purge] [--remove-keys]
#
#   --dry-run      lists what would be removed and removes nothing.
#   --purge        also deletes the data home, after showing its path and size and only when the
#                  owner types the confirmation word. Without it the data home is kept.
#   --remove-keys  offers to delete each studio Keychain entry (provider keys and the platform app
#                  credentials), asking once per entry.
#
# Always deletes the connected-platform token items (SPEC 0007 section 5.2, service
# com.videostudio.platform-tokens, accounts youtube, instagram and tiktok) after the watcher and the
# api are stopped, and reports each one: they authorize posting on the owner's accounts and are
# useless without the studio. Only item attributes are ever read; no token value is printed.
#
# Removes the menu-bar app (SPEC 0006 R3-08, ADR 0005 decision 5) only when ~/Applications/Video
# Studio.app carries the bundle id com.videostudio.shell, after unregistering its login item and
# asking it to quit, plus its build output apps/shell/out/. Removes the launchd agent and its plist,
# stops web and api, and removes the `studio` link only when it points into this repository. It
# never touches the repository sources, node_modules, the Electron download cache, Homebrew
# packages, files registered by reference outside the data home, or the provider keys and app
# credentials in the Keychain without --remove-keys. It refuses to run as root. Rerunning it is
# safe: whatever is already gone is reported and skipped.

set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd -P)"
# shellcheck source=lib/common.sh
. "$SCRIPT_DIR/lib/common.sh"

readonly TOTAL_STEPS=7
readonly PURGE_WORD='APAGAR'
# SPEC 0007 section 5.2: one token item per platform, the account being the platform name. Same
# literal as core PLATFORM_TOKEN_KEYCHAIN_SERVICE (packages/core/src/platforms/vault/token-vault.port.ts).
readonly PLATFORM_TOKEN_SERVICE='com.videostudio.platform-tokens'
PLATFORM_TOKEN_ACCOUNTS=(youtube instagram tiktok)
# SPEC 0007 section 5.2: the six app credentials share the provider-key service (core
# PLATFORM_CLIENT_SECRET_NAMES); offered under --remove-keys like the provider keys.
PLATFORM_CLIENT_ACCOUNTS=(youtube-oauth-client-id youtube-oauth-client-secret instagram-app-id instagram-app-secret tiktok-client-key tiktok-client-secret)
# Bounded wait for the app run with --unregister-login-item, which exits on its own.
readonly UNREGISTER_WAIT_SECONDS=15

PURGE=0
REMOVE_KEYS=0
SHELL_RESULT='não verificado'
DATA_HOME_RESULT='mantida'
KEYS_RESULT='não tocadas'
TOKENS_RESULT='não verificados'

usage() {
  cat <<'USAGE'
Uso: scripts/uninstall.sh [--dry-run] [--purge] [--remove-keys]

  --dry-run      mostra o que seria removido, sem remover nada
  --purge        apaga também a pasta de dados, depois de confirmação digitada
  --remove-keys  oferece apagar cada chave do studio no Keychain, uma a uma
USAGE
}

parse_arguments() {
  while [ "$#" -gt 0 ]; do
    case "$1" in
      --dry-run) DRY_RUN=1 ;;
      --purge) PURGE=1 ;;
      --remove-keys) REMOVE_KEYS=1 ;;
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

# ---------------------------------------------------------------------------------------------
# 1. Menu-bar app: login item, the app folder, the build output
# ---------------------------------------------------------------------------------------------

# Runs the installed app once with --unregister-login-item (apps/shell/src/cli/shell-arguments.ts);
# it removes its login item and exits. On timeout that one child is asked to end with TERM, never -9.
unregister_shell_login_item() {
  local pid waited=0 status=0
  "$SHELL_APP_EXECUTABLE" --unregister-login-item >/dev/null 2>&1 &
  pid=$!
  while kill -0 "$pid" 2>/dev/null; do
    if [ "$waited" -ge "$UNREGISTER_WAIT_SECONDS" ]; then
      kill -TERM "$pid" 2>/dev/null || true
      wait "$pid" 2>/dev/null || true
      return 1
    fi
    sleep 1
    waited=$((waited + 1))
  done
  wait "$pid" || status=$?
  return "$status"
}

remove_shell_app() {
  if [ "$DRY_RUN" -eq 1 ]; then
    run "$SHELL_APP_EXECUTABLE" --unregister-login-item
  elif [ -x "$SHELL_APP_EXECUTABLE" ] && [ ! -L "$SHELL_APP_EXECUTABLE" ] && unregister_shell_login_item; then
    info 'login item removido ("Abrir ao iniciar sessão" desligado).'
  else
    warn 'não foi possível confirmar a remoção do login item; confira em Ajustes do Sistema > Geral > Itens de Início.'
  fi
  if ! quit_shell_app; then
    warn 'o app do menu continua aberto; feche-o pelo item "Sair" e rode scripts/uninstall.sh de novo. Nada foi apagado.'
    SHELL_RESULT='mantido: o app continuava aberto'
    return 0
  fi
  # The four checks again, right before the removal.
  if ! is_studio_shell_app "$SHELL_APP_PATH"; then
    warn "recusado: $SHELL_APP_PATH ($SHELL_APP_REJECTION); nada foi apagado."
    SHELL_RESULT="mantido: $SHELL_APP_PATH ($SHELL_APP_REJECTION)"
    return 0
  fi
  run rm -rf -- "$SHELL_APP_PATH"
  outcome "app removido: $SHELL_APP_PATH" "removeria o app: $SHELL_APP_PATH"
  SHELL_RESULT="removido ($SHELL_APP_PATH)"
}

# apps/shell/out/ is a build artefact (ignored by git): the staging folder, the packaged app and
# the install stamp. Only that exact folder, and only when it is a real folder.
remove_shell_build_output() {
  if [ ! -e "$SHELL_OUT_DIR" ] && [ ! -L "$SHELL_OUT_DIR" ]; then
    info "sem saída de build em $SHELL_OUT_DIR."
    return 0
  fi
  if [ -L "$SHELL_OUT_DIR" ] || [ ! -d "$SHELL_OUT_DIR" ] || ! path_is_within "$SHELL_OUT_DIR" "$SHELL_PACKAGE_DIR"; then
    info "mantido: $SHELL_OUT_DIR não é uma pasta de build comum."
    return 0
  fi
  if [ "$DRY_RUN" -eq 0 ] && shell_app_running; then
    warn "um app do menu ainda roda; $SHELL_OUT_DIR foi mantida."
    return 0
  fi
  run rm -rf -- "$SHELL_OUT_DIR"
  outcome "saída de build removida: $SHELL_OUT_DIR" "removeria a saída de build: $SHELL_OUT_DIR"
}

step_menu_bar_app() {
  begin_step 1 "$TOTAL_STEPS" "app do menu ($STUDIO_SHELL_BUNDLE_ID)"
  if [ ! -e "$SHELL_APP_PATH" ] && [ ! -L "$SHELL_APP_PATH" ]; then
    info "sem app em $SHELL_APP_PATH."
    SHELL_RESULT='já ausente'
  elif ! is_studio_shell_app "$SHELL_APP_PATH"; then
    info "mantido: $SHELL_APP_PATH não é este app ($SHELL_APP_REJECTION)."
    SHELL_RESULT="mantido: $SHELL_APP_PATH não é este app"
  else
    remove_shell_app
  fi
  remove_shell_build_output
  info "o cache do download do Electron fica em $ELECTRON_CACHE_DIR e não é tocado (outros apps Electron podem usá-lo)."
  info "para apagá-lo à mão: rm -rf \"$ELECTRON_CACHE_DIR\""
}

# ---------------------------------------------------------------------------------------------
# 2. launchd agent
# ---------------------------------------------------------------------------------------------

step_launchd() {
  begin_step 2 "$TOTAL_STEPS" "agente launchd ($STUDIO_LAUNCHD_LABEL)"
  bootout_agent
  if [ -e "$PLIST_PATH" ] || [ -L "$PLIST_PATH" ]; then
    run rm -f "$PLIST_PATH"
    outcome "plist removido: $PLIST_PATH" "removeria o plist: $PLIST_PATH"
  else
    info "sem plist em $PLIST_PATH."
  fi
}

# ---------------------------------------------------------------------------------------------
# 3. Web and api
# ---------------------------------------------------------------------------------------------

step_stop_services() {
  begin_step 3 "$TOTAL_STEPS" 'parar web e api (studio stop)'
  local status=0
  if ! command -v node >/dev/null 2>&1 || [ ! -f "$CLI_MAIN" ]; then
    info 'CLI do studio ausente (node ou build); nada a parar por ele.'
    return 0
  fi
  run node "$CLI_MAIN" stop || status=$?
  if [ "$status" -ne 0 ]; then
    warn "studio stop saiu com código $status; confira com 'studio doctor' se web ou api ficaram rodando."
  fi
}

# ---------------------------------------------------------------------------------------------
# 4. `studio` link
# ---------------------------------------------------------------------------------------------

step_remove_link() {
  begin_step 4 "$TOTAL_STEPS" 'comando studio no PATH'
  local directory link found=0
  while IFS= read -r directory; do
    link="$directory/studio"
    if link_points_into_repo "$link"; then
      found=1
      run rm -f "$link"
      outcome "link removido: $link" "removeria o link: $link"
    elif [ -e "$link" ] || [ -L "$link" ]; then
      info "mantido: $link não aponta para este repositório."
    fi
  done <<EOF
$(cli_link_directories)
EOF
  if [ "$found" -eq 0 ]; then
    info 'nenhum link do studio deste repositório.'
  fi
}

# ---------------------------------------------------------------------------------------------
# 5. Data home (kept unless --purge and the typed confirmation)
# ---------------------------------------------------------------------------------------------

# Same answer the installer used: core when built, else the bash mirror of its rule.
resolve_data_home() {
  if command -v node >/dev/null 2>&1 && [ -d "$REPO_ROOT/tools/cli/node_modules" ] &&
    resolve_data_home_with_core "$(command -v node)"; then
    return 0
  fi
  resolve_data_home_expected
}

# Refuses anything that is not plainly a studio data home: the home folder or an ancestor, the
# repository or anything around it, a symlink, or a folder without the four D5 subfolders.
assert_purgeable_data_home() {
  local subfolder
  assert_data_home_shape "$DATA_HOME"
  if [ -L "$DATA_HOME" ] || [ ! -d "$DATA_HOME" ]; then
    die "$DATA_HOME não é uma pasta; nada foi apagado."
  fi
  if path_is_within "$HOME" "$DATA_HOME"; then
    die "recusado: $DATA_HOME contém a pasta pessoal; nada foi apagado."
  fi
  if path_is_within "$REPO_ROOT" "$DATA_HOME" || path_is_within "$DATA_HOME" "$REPO_ROOT"; then
    die "recusado: $DATA_HOME contém o repositório ou está dentro dele; nada foi apagado."
  fi
  for subfolder in db assets runs logs; do
    if [ ! -d "$DATA_HOME/$subfolder" ]; then
      die "recusado: $DATA_HOME não tem a pasta $subfolder/ de uma pasta de dados do studio; apague-a à mão se tiver certeza."
    fi
  done
}

purge_data_home() {
  local size answer=''
  assert_purgeable_data_home
  size="$(du -sh "$DATA_HOME" 2>/dev/null | cut -f1 || true)"
  if [ -z "$size" ]; then
    size='?'
  fi
  say "  Pasta de dados: $DATA_HOME"
  say "  Tamanho:        $size"
  say '  Apaga o banco, os assets copiados, as execuções e os logs. Arquivos registrados por'
  say '  referência ficam fora desta pasta e não são tocados.'
  if [ "$DRY_RUN" -eq 1 ]; then
    info "(simulação) pediria a palavra $PURGE_WORD e só então:"
    run rm -rf -- "$DATA_HOME"
    DATA_HOME_RESULT="seria apagada após confirmação: $DATA_HOME"
    return 0
  fi
  if [ ! -t 0 ]; then
    die '--purge precisa de um terminal para a confirmação digitada; nada foi apagado.'
  fi
  printf '  Para apagar, digite %s (qualquer outra resposta cancela): ' "$PURGE_WORD"
  IFS= read -r answer || answer=''
  if [ "$answer" != "$PURGE_WORD" ]; then
    info 'confirmação diferente: pasta de dados mantida.'
    DATA_HOME_RESULT="mantida: $DATA_HOME"
    return 0
  fi
  rm -rf -- "$DATA_HOME"
  info "apagada: $DATA_HOME"
  DATA_HOME_RESULT="apagada: $DATA_HOME"
}

step_data_home() {
  begin_step 5 "$TOTAL_STEPS" 'pasta de dados'
  resolve_data_home
  if [ "$PURGE" -eq 0 ]; then
    info "mantida: $DATA_HOME (use --purge para apagar)."
    DATA_HOME_RESULT="mantida: $DATA_HOME"
    return 0
  fi
  if [ ! -e "$DATA_HOME" ]; then
    info "não existe: $DATA_HOME"
    DATA_HOME_RESULT="já ausente: $DATA_HOME"
    return 0
  fi
  purge_data_home
}

# ---------------------------------------------------------------------------------------------
# 6. Platform tokens in the Keychain (always; one report line per platform)
# ---------------------------------------------------------------------------------------------

# Without -w or -g, `security` prints item attributes only, never the value; output is discarded.
# $1 is the service, $2 the account; both are literals of this script, never caller text.
keychain_item_exists() {
  /usr/bin/security find-generic-password -s "$1" -a "$2" >/dev/null 2>&1
}

# The watcher (launchd, step 2) and the api (step 3) are stopped by now, so no process refreshes or
# rewrites a token while it is deleted. In --dry-run nothing is deleted; each line says what would be.
step_platform_tokens() {
  begin_step 6 "$TOTAL_STEPS" "tokens das plataformas no Keychain ($PLATFORM_TOKEN_SERVICE)"
  local account removed=0 absent=0 failed=0
  for account in "${PLATFORM_TOKEN_ACCOUNTS[@]}"; do
    if ! keychain_item_exists "$PLATFORM_TOKEN_SERVICE" "$account"; then
      info "sem token: $account"
      absent=$((absent + 1))
      continue
    fi
    if [ "$DRY_RUN" -eq 1 ]; then
      run /usr/bin/security delete-generic-password -s "$PLATFORM_TOKEN_SERVICE" -a "$account"
      continue
    fi
    if /usr/bin/security delete-generic-password -s "$PLATFORM_TOKEN_SERVICE" -a "$account" >/dev/null 2>&1; then
      info "token apagado: $account"
      removed=$((removed + 1))
    else
      warn "não foi possível apagar o token de $account; apague o item $PLATFORM_TOKEN_SERVICE / $account no Acesso às Chaves."
      failed=$((failed + 1))
    fi
  done
  if [ "$DRY_RUN" -eq 1 ]; then
    TOKENS_RESULT='simulação'
  else
    TOKENS_RESULT="$removed apagado(s), $absent ausente(s), $failed com falha"
  fi
  if [ "$removed" -gt 0 ]; then
    info 'a autorização do Video Studio continua listada na sua conta de cada plataforma até você removê-la nas configurações de lá.'
    info 'se a pasta de dados foi mantida e o studio for reinstalado, conecte as contas de novo pela página Contas.'
  fi
}

# ---------------------------------------------------------------------------------------------
# 7. Keychain keys (only with --remove-keys, one question per entry)
# ---------------------------------------------------------------------------------------------

step_keychain() {
  begin_step 7 "$TOTAL_STEPS" 'chaves no Keychain'
  local account removed=0
  if [ "$REMOVE_KEYS" -eq 0 ]; then
    info 'não tocadas (use --remove-keys para revisar uma a uma).'
    return 0
  fi
  for account in "${STUDIO_KEYCHAIN_ACCOUNTS[@]}" "${PLATFORM_CLIENT_ACCOUNTS[@]}"; do
    if ! keychain_item_exists "$STUDIO_KEYCHAIN_SERVICE" "$account"; then
      info "sem item: $account"
      continue
    fi
    if [ "$DRY_RUN" -eq 1 ]; then
      run /usr/bin/security delete-generic-password -s "$STUDIO_KEYCHAIN_SERVICE" -a "$account"
      continue
    fi
    if confirm "  Apagar a chave '$account' (serviço $STUDIO_KEYCHAIN_SERVICE) do Keychain?"; then
      /usr/bin/security delete-generic-password -s "$STUDIO_KEYCHAIN_SERVICE" -a "$account" >/dev/null
      info "apagada: $account"
      removed=$((removed + 1))
    else
      info "mantida: $account"
    fi
  done
  KEYS_RESULT="$removed apagada(s)"
}

print_summary() {
  say ''
  if [ "$DRY_RUN" -eq 1 ]; then
    say 'Simulação concluída: nada foi removido.'
    return 0
  fi
  say 'Video Studio desinstalado.'
  info "App do menu:     $SHELL_RESULT"
  info "Agente launchd:  removido ($STUDIO_LAUNCHD_LABEL)"
  info 'Comando studio:  link deste repositório removido'
  info "Pasta de dados:  $DATA_HOME_RESULT"
  info "Tokens:          $TOKENS_RESULT"
  info "Chaves:          $KEYS_RESULT"
  info 'Fontes do repositório, node_modules, cache do Electron e pacotes do Homebrew não foram tocados.'
}

main() {
  # Same refusal as the installer: everything was installed for the user, never for root.
  if [ "$UID" -eq 0 ]; then
    die 'não rode como root nem com sudo: o studio foi instalado para o seu usuário.'
  fi
  parse_arguments "$@"
  enable_error_trap
  resolve_repo_root "$SCRIPT_DIR"
  say "Video Studio: desinstalação ($REPO_ROOT)"
  if [ "$DRY_RUN" -eq 1 ]; then
    say 'Modo simulação (--dry-run): nada é removido.'
  fi
  step_menu_bar_app
  step_launchd
  step_stop_services
  step_remove_link
  step_data_home
  step_platform_tokens
  step_keychain
  print_summary
}

main "$@"
