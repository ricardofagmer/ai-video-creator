#!/bin/bash
#
# Places the local search model in the data home (SPEC 0003 section 5.2, ADR 0004, B6, B7):
#
#   scripts/models/fetch-embedding-model.sh --data-home <absolute path> [--node <node binary>] [--dry-run]
#
# Run by scripts/install.sh (step 7) and meant to be the one implementation behind
# `studio models fetch`. It reads two committed files: the manifest (embedding-model.manifest.json,
# validated with @studio/shared's EmbeddingModelManifestSchema) pins every file by sha-256 and
# size, and embedding-model.source.json pins the download host, repository and revision, which
# the strict manifest schema has no field for.
#
# Rerun-safe (R2-AC-27): a file already present with its pinned size and sha-256 is skipped, so a
# second run downloads nothing and changes no byte. A missing or different file is downloaded
# from the pinned revision to a temporary name in its own folder, checked, then renamed; a
# mismatch deletes the temporary file and names the file. Folders are 0700 and symlinks refused.
#
# The download is the feature's only network use (SPEC 0003 Q6). Each request is a plain HTTPS
# GET of one pinned file: no cookie, token, header or catalog data, and curl's own config file is
# ignored (-q). Placeholder pins (pinState "placeholder", an all-zero sha-256, a zero size) are
# never trusted: the script downloads nothing.
#
# Exit codes: 0 model verified in place (or dry run done); 1 a folder, download or hash check
# failed; 2 the committed pins are still placeholders; 3 the manifest or source file is invalid,
# or @studio/shared is not built yet. Callers treat every non-zero code as a warning (B7).

set -Eeuo pipefail
umask 077

MODELS_DIR="$(cd "$(dirname "$0")" && pwd -P)"
# shellcheck source=../lib/common.sh
. "$MODELS_DIR/../lib/common.sh"

readonly MANIFEST_FILE="$MODELS_DIR/embedding-model.manifest.json"
readonly SOURCE_FILE="$MODELS_DIR/embedding-model.source.json"
readonly EXIT_UNPINNED=2
readonly EXIT_INVALID=3

TARGET_DATA_HOME=''
MANIFEST_NODE='node'
DOWNLOAD_TEMP=''
SOURCE_HOST=''
SOURCE_REPOSITORY=''
SOURCE_REVISION=''
MODEL_REF=''
PINNED_FILES=''
# The file `@studio/shared` is resolved from: packages/core/package.json of the checkout, or the
# same relative path under the packaged resources, whose lookup walks up to payload/node_modules.
MANIFEST_RESOLVE_FROM=''

# Validates both committed files and prints, one per line: host, repository, revision, modelRef,
# then "<sha256> <size> <path>" per file. The manifest goes through the frozen shared schema
# (paths are [A-Za-z0-9._-] segments, so a space separates the fields safely). Exit 10: shared
# is not built; 11: invalid; 12: placeholder pins. A fixed literal; paths arrive as arguments.
readonly MANIFEST_READER_JS='
const { readFileSync } = require("node:fs");
const { createRequire } = require("node:module");
const [corePackageJson, manifestFile, sourceFile] = process.argv.slice(1);
let schema;
try {
  schema = createRequire(corePackageJson)("@studio/shared/catalog").EmbeddingModelManifestSchema;
} catch (error) {
  process.exit(10);
}
const readJson = (file) => {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch (error) {
    process.exit(11);
  }
};
const parsed = schema.safeParse(readJson(manifestFile));
const source = readJson(sourceFile);
if (!parsed.success || typeof source !== "object" || source === null || Array.isArray(source)) process.exit(11);
if (Object.keys(source).sort().join(",") !== "host,pinState,repository,revision") process.exit(11);
const manifest = parsed.data;
const placeholder = "0".repeat(64);
const unpinnedFile = manifest.files.some((file) => file.sha256 === placeholder || file.sizeBytes === 0);
if (source.pinState !== "pinned" || typeof source.revision !== "string" || !/^[0-9a-f]{40}$/.test(source.revision) || unpinnedFile) process.exit(12);
let host;
try {
  host = new URL(source.host);
} catch (error) {
  process.exit(11);
}
if (host.protocol !== "https:" || host.username !== "" || host.password !== "" || host.port !== "" || source.host !== host.origin) process.exit(11);
if (typeof source.repository !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._-]*\/[A-Za-z0-9][A-Za-z0-9._-]*$/.test(source.repository)) process.exit(11);
if (manifest.modelRef.slice(manifest.modelRef.indexOf("@") + 1) !== source.revision) process.exit(11);
const lines = [host.origin, source.repository, source.revision, manifest.modelRef];
for (const file of manifest.files) lines.push(file.sha256 + " " + file.sizeBytes + " " + file.path);
process.stdout.write(lines.join("\n") + "\n");
'

usage() {
  printf '%s\n' 'Uso: scripts/models/fetch-embedding-model.sh --data-home <pasta absoluta> [--node <node>] [--dry-run]'
}

# A failure here never stops the installer (B7), so it is reported as a warning, not an error.
fail() {
  warn "modelo de busca: $*"
  exit 1
}

cleanup() {
  if [ -n "$DOWNLOAD_TEMP" ] && [ -f "$DOWNLOAD_TEMP" ]; then
    rm -f "$DOWNLOAD_TEMP"
  fi
}

parse_arguments() {
  while [ "$#" -gt 0 ]; do
    case "$1" in
      --data-home)
        [ "$#" -ge 2 ] || fail 'falta o valor de --data-home.'
        TARGET_DATA_HOME="$2"
        shift
        ;;
      --node)
        [ "$#" -ge 2 ] || fail 'falta o valor de --node.'
        MANIFEST_NODE="$2"
        shift
        ;;
      --dry-run) DRY_RUN=1 ;;
      -h | --help)
        usage
        exit 0
        ;;
      *)
        usage >&2
        fail "opção desconhecida: $1"
        ;;
    esac
    shift
  done
  [ -n "$TARGET_DATA_HOME" ] || fail 'informe --data-home.'
  case "$TARGET_DATA_HOME" in
    /*) ;;
    *) fail "a pasta de dados precisa ser um caminho absoluto: $TARGET_DATA_HOME" ;;
  esac
  case "$TARGET_DATA_HOME" in
    */ | *//* | */./* | */../* | */. | */.. | *"$NEWLINE"*) fail "pasta de dados não normalizada: $TARGET_DATA_HOME" ;;
  esac
}

read_pinned_model() {
  local output status=0 line index=0
  output="$(
    trap - ERR
    "$MANIFEST_NODE" -e "$MANIFEST_READER_JS" "$MANIFEST_RESOLVE_FROM" "$MANIFEST_FILE" "$SOURCE_FILE"
  )" || status=$?
  case "$status" in
    0) ;;
    10)
      warn 'modelo de busca: @studio/shared ainda não foi construído; o manifesto não pôde ser validado.'
      exit "$EXIT_INVALID"
      ;;
    127)
      warn "modelo de busca: node não encontrado ($MANIFEST_NODE); o manifesto não pôde ser validado."
      exit "$EXIT_INVALID"
      ;;
    12)
      warn 'modelo de busca: o manifesto ainda tem valores provisórios (revisão, sha-256 ou tamanho); nada é baixado.'
      exit "$EXIT_UNPINNED"
      ;;
    *)
      warn "modelo de busca: manifesto ou fonte inválidos em $MODELS_DIR (código $status)."
      exit "$EXIT_INVALID"
      ;;
  esac
  while IFS= read -r line; do
    case "$index" in
      0) SOURCE_HOST="$line" ;;
      1) SOURCE_REPOSITORY="$line" ;;
      2) SOURCE_REVISION="$line" ;;
      3) MODEL_REF="$line" ;;
      *) PINNED_FILES="${PINNED_FILES}${line}${NEWLINE}" ;;
    esac
    index=$((index + 1))
  done <<EOF
$output
EOF
  [ -n "$MODEL_REF" ] && [ -n "$PINNED_FILES" ] || fail 'o leitor do manifesto não devolveu os arquivos.'
}

# Same rules as install.sh's data-home folders, but a failure is a warning (fail), never fatal.
ensure_model_directory() {
  local mode
  if [ -L "$1" ]; then
    fail "$1 é um link simbólico; esperado uma pasta."
  fi
  if [ -d "$1" ]; then
    mode="$(stat -f '%Lp' "$1")"
    if [ "$mode" != '700' ]; then
      run chmod 700 "$1"
      outcome "permissão ajustada para 700: $1 (era $mode)" "ajustaria a permissão para 700: $1 (hoje $mode)"
    fi
    return 0
  fi
  if [ -e "$1" ]; then
    fail "$1 existe e não é uma pasta."
  fi
  run mkdir -m 700 "$1"
  outcome "criada: $1 (700)" "criaria: $1 (700)"
}

# $1 = model folder, $2 = manifest-relative path: creates each folder between them (onnx/...).
ensure_parent_directories() {
  local relative='' rest="$2" segment
  while :; do
    case "$rest" in
      */*) ;;
      *) return 0 ;;
    esac
    segment="${rest%%/*}"
    rest="${rest#*/}"
    relative="${relative:+$relative/}$segment"
    ensure_model_directory "$1/$relative"
  done
}

file_size() {
  stat -f '%z' "$1"
}

file_sha256() {
  local output
  output="$(shasum -a 256 "$1")"
  printf '%s' "${output%% *}"
}

# True when $1 is a plain file of size $2 and sha-256 $3.
file_matches_pin() {
  [ -f "$1" ] && [ ! -L "$1" ] && [ "$(file_size "$1")" = "$2" ] && [ "$(file_sha256 "$1")" = "$3" ]
}

# $1 = model folder, $2 = sha-256, $3 = size in bytes, $4 = manifest-relative path.
fetch_pinned_file() {
  local target="$1/$4" url
  ensure_parent_directories "$1" "$4"
  if [ -L "$target" ]; then
    fail "$4 é um link simbólico; recusado."
  fi
  if [ -e "$target" ] && [ ! -f "$target" ]; then
    fail "$4 existe e não é um arquivo."
  fi
  if file_matches_pin "$target" "$3" "$2"; then
    info "ok: $4 (tamanho e sha-256 conferem; nada a baixar)"
    return 0
  fi
  url="$SOURCE_HOST/$SOURCE_REPOSITORY/resolve/$SOURCE_REVISION/$4"
  if [ "$DRY_RUN" -eq 1 ]; then
    info "(simulação) baixaria $4 ($3 bytes) de $url e conferiria tamanho e sha-256"
    return 0
  fi
  DOWNLOAD_TEMP="$(dirname "$target")/.$(basename "$target").download.$$"
  rm -f "$DOWNLOAD_TEMP"
  info "baixando $4 ($3 bytes)..."
  # -q first: ignore ~/.curlrc. HTTPS only, redirects included (the host redirects large files to
  # its CDN); integrity rests on the pinned sha-256, not on the host.
  if ! curl -q --fail --silent --show-error --location --proto '=https' --proto-redir '=https' --max-redirs 5 \
    --connect-timeout 20 --max-time 1800 --retry 2 --max-filesize "$3" --output "$DOWNLOAD_TEMP" "$url" </dev/null; then
    rm -f "$DOWNLOAD_TEMP"
    DOWNLOAD_TEMP=''
    fail "o download de $4 falhou (rede indisponível ou o servidor recusou)."
  fi
  if ! file_matches_pin "$DOWNLOAD_TEMP" "$3" "$2"; then
    rm -f "$DOWNLOAD_TEMP"
    DOWNLOAD_TEMP=''
    fail "$4 baixado não confere com o manifesto (tamanho ou sha-256); o arquivo temporário foi apagado."
  fi
  mv -f "$DOWNLOAD_TEMP" "$target"
  DOWNLOAD_TEMP=''
  info "instalado: $4 (tamanho e sha-256 conferem)"
}

main() {
  parse_arguments "$@"
  # shellcheck disable=SC2034  # read by common.sh die() when resolve_repo_root refuses the folder
  CURRENT_STEP='modelo de busca'
  trap 'warn "modelo de busca: um comando saiu com código $? (linha $LINENO)."; exit 1' ERR
  trap cleanup EXIT
  # Packaged app: the scripts sit in <runtime>/payload/resources (no monorepo around them).
  if resolve_packaged_resources_root "$MODELS_DIR/.."; then
    MANIFEST_RESOLVE_FROM="$PACKAGED_RESOURCES_ROOT/packages/core/package.json"
  else
    resolve_repo_root "$MODELS_DIR/.."
    MANIFEST_RESOLVE_FROM="$REPO_ROOT/packages/core/package.json"
  fi
  read_pinned_model
  local model_directory="$TARGET_DATA_HOME/models/embeddings/$MODEL_REF" sha size path
  info "modelo: $MODEL_REF ($SOURCE_HOST/$SOURCE_REPOSITORY na revisão $SOURCE_REVISION)"
  if [ "$DRY_RUN" -eq 0 ] && [ ! -d "$TARGET_DATA_HOME" ]; then
    fail "a pasta de dados não existe: $TARGET_DATA_HOME"
  fi
  ensure_model_directory "$TARGET_DATA_HOME/models"
  ensure_model_directory "$TARGET_DATA_HOME/models/embeddings"
  ensure_model_directory "$model_directory"
  while IFS=' ' read -r sha size path; do
    [ -n "$path" ] || continue
    fetch_pinned_file "$model_directory" "$sha" "$size" "$path"
  done <<EOF
$PINNED_FILES
EOF
  outcome "modelo pronto em $model_directory" "nenhum arquivo foi baixado nem gravado"
}

main "$@"
