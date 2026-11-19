#!/bin/bash
#
# Video Studio uninstaller (SPEC 0002 R1-22, PRD 0001 section 11, criterion 25):
#
#   scripts/uninstall.sh [--dry-run] [--purge] [--remove-keys]
#
#   --dry-run      lists what would be removed and removes nothing.
#   --purge        also deletes the data home, after showing its path and size and only when the
#                  owner types the confirmation word. Without it the data home is kept.
#   --remove-keys  offers to delete each studio Keychain entry, asking once per entry.
#
# Removes the launchd agent and its plist, stops web and api, and removes the `studio` link only
# when it points into this repository. It never touches the repository, node_modules, Homebrew
# packages, files registered by reference outside the data home, or the Keychain without
# --remove-keys. Rerunning it is safe: whatever is already gone is reported and skipped.

set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd -P)"
# shellcheck source=lib/common.sh
. "$SCRIPT_DIR/lib/common.sh"

readonly TOTAL_STEPS=5
readonly PURGE_WORD='APAGAR'

PURGE=0
REMOVE_KEYS=0
DATA_HOME_RESULT='mantida'
KEYS_RESULT='não tocadas'

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
# 1. launchd agent
# ---------------------------------------------------------------------------------------------

step_launchd() {
  begin_step 1 "$TOTAL_STEPS" "agente launchd ($STUDIO_LAUNCHD_LABEL)"
  bootout_agent
  if [ -e "$PLIST_PATH" ] || [ -L "$PLIST_PATH" ]; then
    run rm -f "$PLIST_PATH"
    outcome "plist removido: $PLIST_PATH" "removeria o plist: $PLIST_PATH"
  else
    info "sem plist em $PLIST_PATH."
  fi
}

# ---------------------------------------------------------------------------------------------
# 2. Web and api
# ---------------------------------------------------------------------------------------------

step_stop_services() {
  begin_step 2 "$TOTAL_STEPS" 'parar web e api (studio stop)'
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
# 3. `studio` link
# ---------------------------------------------------------------------------------------------

step_remove_link() {
  begin_step 3 "$TOTAL_STEPS" 'comando studio no PATH'
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
# 4. Data home (kept unless --purge and the typed confirmation)
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
  begin_step 4 "$TOTAL_STEPS" 'pasta de dados'
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
# 5. Keychain (only with --remove-keys, one question per entry)
# ---------------------------------------------------------------------------------------------

# Without -w or -g, `security` prints item attributes only, never the value; output is discarded.
keychain_entry_exists() {
  /usr/bin/security find-generic-password -s "$STUDIO_KEYCHAIN_SERVICE" -a "$1" >/dev/null 2>&1
}

step_keychain() {
  begin_step 5 "$TOTAL_STEPS" 'chaves no Keychain'
  local account removed=0
  if [ "$REMOVE_KEYS" -eq 0 ]; then
    info 'não tocadas (use --remove-keys para revisar uma a uma).'
    return 0
  fi
  for account in "${STUDIO_KEYCHAIN_ACCOUNTS[@]}"; do
    if ! keychain_entry_exists "$account"; then
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
  info "Agente launchd:  removido ($STUDIO_LAUNCHD_LABEL)"
  info 'Comando studio:  link deste repositório removido'
  info "Pasta de dados:  $DATA_HOME_RESULT"
  info "Chaves:          $KEYS_RESULT"
  info 'Repositório, node_modules e pacotes do Homebrew não foram tocados.'
}

main() {
  parse_arguments "$@"
  enable_error_trap
  resolve_repo_root "$SCRIPT_DIR"
  say "Video Studio: desinstalação ($REPO_ROOT)"
  if [ "$DRY_RUN" -eq 1 ]; then
    say 'Modo simulação (--dry-run): nada é removido.'
  fi
  step_launchd
  step_stop_services
  step_remove_link
  step_data_home
  step_keychain
  print_summary
}

main "$@"
