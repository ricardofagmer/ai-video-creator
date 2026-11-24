#!/usr/bin/env bash
# Builds the installer's static ffmpeg and ffprobe for macOS arm64 from the pinned sources in
# sources.lock.json, and the complete corresponding source archive the GPL requires (plan 9.2,
# contract C4 rev 1; vetting 0006 section 10). Takes no arguments; the only input is the optional
# ENGINEOS_FFMPEG_BUILD_DIR (absolute output folder, default apps/shell/out/ffmpeg).
#
# Fail closed: the lock is validated before any download, every download is checked against its
# pin (and FFmpeg against its OpenPGP signature), and the output folder is replaced only after the
# binaries, licences, source archive and build-manifest.json all exist.
# Compatible with the bash 3.2 that macOS ships.
set -euo pipefail
umask 022
export LC_ALL=C COPYFILE_DISABLE=1

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd -P)"
LOCK_FILE="$SCRIPT_DIR/sources.lock.json"
LOCK_TOOL="$SCRIPT_DIR/lock-tool.mjs"
OUT_DIR="${ENGINEOS_FFMPEG_BUILD_DIR:-$REPO_ROOT/apps/shell/out/ffmpeg}"
MAX_REDIRECTS=5
# Every encoder and filter the studio and its HyperFrames renderer call (ticket 10 usage list).
REQUIRED_ENCODERS="libx264 libmp3lame aac h264_videotoolbox mjpeg png pcm_s16le pcm_s24le pcm_f32le"
REQUIRED_FILTERS="scale overlay fade afade blackdetect silencedetect loudnorm ebur128 sidechaincompress amix aresample aformat atrim volume adelay apad asetpts alimiter concat hstack color testsrc2"

die() { printf 'ERROR (ffmpeg build): %s\n' "$*" >&2; exit 1; }
say() { printf '%s\n' "$*"; }

check_host() {
  [ "$(uname -s)" = Darwin ] && [ "$(uname -m)" = arm64 ] || die "builds on macOS arm64 only."
  local tool
  for tool in clang make pkg-config gpg gpgv git curl tar gzip shasum md5 node otool lipo xcrun sysctl; do
    command -v "$tool" >/dev/null 2>&1 || die "required tool '$tool' is not installed (see scripts/ffmpeg-build/README.md)."
  done
}

# The output folder is deleted and replaced, so refuse anything that is not plainly ours.
check_out_dir() {
  case "$OUT_DIR" in /?*) ;; *) die "ENGINEOS_FFMPEG_BUILD_DIR must be an absolute path." ;; esac
  case "$OUT_DIR" in *$'\n'*|*'/../'*|*'/..'|*'/./'*|*'/.'|*'//'*|*/) die "ENGINEOS_FFMPEG_BUILD_DIR must be a normalized path." ;; esac
  [ "$OUT_DIR" != "$HOME" ] && [ "$OUT_DIR" != "$REPO_ROOT" ] || die "refusing to replace $OUT_DIR."
  if [ -e "$OUT_DIR" ] || [ -L "$OUT_DIR" ]; then
    [ -d "$OUT_DIR" ] && [ ! -L "$OUT_DIR" ] || die "$OUT_DIR exists and is not a plain folder."
    if [ -n "$(ls -A "$OUT_DIR")" ] && [ ! -f "$OUT_DIR/build-manifest.json" ]; then
      die "$OUT_DIR is not empty and holds no build-manifest.json; refusing to replace it."
    fi
  fi
}

url_host() {
  if [[ $1 =~ ^https://([a-z0-9.-]+)(/[^[:space:]]*)?$ ]]; then printf '%s\n' "${BASH_REMATCH[1]}"; else return 1; fi
}

host_allowed() {
  local host=$1 allowed IFS=,
  for allowed in $2; do
    case "$allowed" in
      .*) [[ $host == *"$allowed" ]] && return 0 ;;
      *) [ "$host" = "$allowed" ] && return 0 ;;
    esac
  done
  return 1
}

# Plain HTTPS GET; redirects are followed by hand so every hop's host is checked before contact.
fetch_pinned() {
  local url=$1 dest=$2 hosts=$3 hop=0 host result code
  rm -f "$dest" "$dest.part"
  while [ "$hop" -le "$MAX_REDIRECTS" ]; do
    host=$(url_host "$url") || die "refusing a non-https or malformed URL: $url"
    host_allowed "$host" "$hosts" || die "refusing host $host; allowed: $hosts."
    result=$(curl --silent --show-error --proto '=https' --tlsv1.2 --max-redirs 0 --connect-timeout 30 \
      --max-time 1800 --retry 2 --output "$dest.part" --write-out '%{http_code} %{redirect_url}' -- "$url") \
      || die "download failed: $url"
    code=${result%% *}
    case "$code" in
      200) mv "$dest.part" "$dest"; return 0 ;;
      301|302|303|307|308) url=${result#* }; [ -n "$url" ] || die "redirect without a location from $host." ;;
      *) die "$host answered $code." ;;
    esac
    hop=$((hop + 1))
  done
  die "more than $MAX_REDIRECTS redirects for $(basename "$dest")."
}

sha256_of() { shasum -a 256 "$1" | awk '{print $1}'; }

# gpgv with a one-key keyring: no agent, no user keyring, and only the pinned key can vouch.
verify_signature() {
  local file=$1 signature=$2 key=$3 fingerprint=$4 keyring="$WORK_DIR/gpg/pinned.gpg"
  mkdir -p -m 700 "$WORK_DIR/gpg"
  gpg --batch --no-options --homedir "$WORK_DIR/gpg" --dearmor --output "$keyring" "$key" || die "could not read the signing key."
  gpgv --keyring "$keyring" --status-fd 1 "$signature" "$file" >"$WORK_DIR/gpg/status" 2>/dev/null \
    || die "the OpenPGP signature of $(basename "$file") does not verify."
  awk -v fpr="$fingerprint" '$1 == "[GNUPG:]" && $2 == "VALIDSIG" && ($3 == fpr || $NF == fpr) { found = 1 } END { exit found ? 0 : 1 }' \
    "$WORK_DIR/gpg/status" || die "$(basename "$file") is not signed by the pinned key $fingerprint."
}

unpack() {
  local archive=$1 directory=$2 name=$3 scratch="$WORK_DIR/unpack/$3"
  mkdir -p "$scratch"
  tar -xf "$archive" -C "$scratch"
  [ -d "$scratch/$directory" ] || die "$(basename "$archive") has no top folder $directory."
  mv "$scratch/$directory" "$SRC/$name"
}

fetch_tarball() {
  local name=$1 url=$2 file=$3 directory=$4 sha256=$5 md5=$6 hosts=$7 sig_url=$8 key_url=$9 fingerprint=${10}
  local tarball="$UPSTREAM/$file" actual
  fetch_pinned "$url" "$tarball" "$hosts"
  if [ "$fingerprint" != - ]; then
    fetch_pinned "$sig_url" "$UPSTREAM/$file.asc" "$hosts"
    fetch_pinned "$key_url" "$UPSTREAM/$name-signing-key.asc" "$hosts"
    verify_signature "$tarball" "$UPSTREAM/$file.asc" "$UPSTREAM/$name-signing-key.asc" "$fingerprint"
  fi
  actual=$(sha256_of "$tarball")
  [ "$sha256" = - ] || [ "$actual" = "$sha256" ] || die "$file SHA-256 $actual does not match the pin $sha256."
  [ "$md5" = - ] || [ "$(md5 -q "$tarball")" = "$md5" ] || die "$file MD5 does not match the publisher's value."
  unpack "$tarball" "$directory" "$name"
  printf '%s\t%s\t-\n' "$name" "$actual" >>"$RESOLVED"
  say "verified $file sha-256 $actual"
}

# The archived tree is exactly what is built: git archive of the pinned commit, then unpacked.
fetch_git() {
  local name=$1 url=$2 directory=$3 commit=$4 hosts=$5 host clone="$WORK_DIR/git/$1" archive="$UPSTREAM/$1-$4.tar.gz"
  host=$(url_host "$url") || die "refusing a non-https git URL: $url"
  host_allowed "$host" "$hosts" || die "refusing git host $host."
  export GIT_TERMINAL_PROMPT=0 GIT_CONFIG_NOSYSTEM=1 GIT_CONFIG_GLOBAL=/dev/null
  git -c http.followRedirects=false -c protocol.allow=never -c protocol.https.allow=always -c credential.helper= \
    clone --quiet --no-checkout -- "$url" "$clone" || die "git clone of $name failed."
  git -C "$clone" -c advice.detachedHead=false checkout --quiet --detach "$commit" || die "$name has no commit $commit."
  [ "$(git -C "$clone" rev-parse HEAD)" = "$commit" ] || die "$name HEAD is not the pinned commit."
  git -C "$clone" archive --format=tar --prefix="$directory/" "$commit" | gzip -n >"$archive"
  unpack "$archive" "$directory" "$name"
  printf '%s\t-\t%s\n' "$name" "$commit" >>"$RESOLVED"
  say "verified $name at commit $commit"
}

copy_licences() {
  local name=$1 files=$2 file IFS=,
  mkdir -p "$STAGE/licenses/$name"
  for file in $files; do
    [ -f "$SRC/$name/$file" ] || die "$name has no licence file $file."
    cp "$SRC/$name/$file" "$STAGE/licenses/$name/$file"
  done
}

fetch_sources() {
  local kind name version type url file directory sha256 commit md5 hosts sig_url key_url fingerprint licences
  while IFS=$'\t' read -r kind name version type url file directory sha256 commit md5 hosts sig_url key_url fingerprint licences; do
    [ "$kind" = source ] || continue
    case "$name" in ffmpeg|x264|lame) ;; *) die "source $name has no build step in this script." ;; esac
    if [ "$type" = git ]; then fetch_git "$name" "$url" "$directory" "$commit" "$hosts"
    else fetch_tarball "$name" "$url" "$file" "$directory" "$sha256" "$md5" "$hosts" "$sig_url" "$key_url" "$fingerprint"; fi
    [ "$name" != ffmpeg ] || FFMPEG_VERSION=$version
    copy_licences "$name" "$licences"
  done <"$WORK_DIR/lock.tsv"
  local required
  for required in ffmpeg x264 lame; do [ -d "$SRC/$required" ] || die "the lock file has no source $required."; done
}

build_libraries() {
  say "building x264 and lame (static, macOS $TARGET)"
  (cd "$SRC/x264" && ./configure --prefix="$PREFIX" --enable-static --enable-pic --disable-cli --disable-opencl \
    --extra-cflags="$ARCH_FLAGS" --extra-ldflags="$ARCH_FLAGS" && make -j"$JOBS" && make install-lib-static) || die "x264 build failed."
  (cd "$SRC/lame" && ./configure --prefix="$PREFIX" --enable-static --disable-shared --disable-frontend --disable-decoder \
    --disable-dependency-tracking CFLAGS="$ARCH_FLAGS -O2" LDFLAGS="$ARCH_FLAGS" && make -j"$JOBS" && make install) \
    || die "lame build failed."
}

# --disable-autodetect: nothing on the build machine (Homebrew libraries) is linked by accident;
# only the system frameworks and libraries named here, and the two static libraries above.
FFMPEG_FLAGS=(
  --arch=aarch64 --target-os=darwin --cc=clang --extra-version=engineos
  --enable-gpl --enable-version3 --disable-autodetect
  --enable-static --disable-shared --pkg-config-flags=--static
  --disable-ffplay --disable-doc --disable-debug --disable-network
  --enable-pthreads --enable-zlib --enable-bzlib --enable-videotoolbox --enable-audiotoolbox
  --enable-libx264 --enable-libmp3lame
)

build_ffmpeg() {
  say "building ffmpeg $FFMPEG_VERSION"
  printf '%s\n' "${FFMPEG_FLAGS[@]}" >"$WORK_DIR/configure-flags.txt"
  (cd "$SRC/ffmpeg" && ./configure --prefix="$PREFIX" "${FFMPEG_FLAGS[@]}" \
    --extra-cflags="$ARCH_FLAGS -I$PREFIX/include" --extra-ldflags="$ARCH_FLAGS -L$PREFIX/lib" \
    && make -j"$JOBS") || die "ffmpeg build failed (see $SRC/ffmpeg/ffbuild/config.log)."
  mkdir -p "$STAGE/bin"
  cp "$SRC/ffmpeg/ffmpeg" "$SRC/ffmpeg/ffprobe" "$STAGE/bin/"
  chmod 755 "$STAGE/bin/ffmpeg" "$STAGE/bin/ffprobe"
}

check_binary() {
  local program=$1 foreign minos
  [ "$(lipo -archs "$program")" = arm64 ] || die "$(basename "$program") is not arm64 only."
  foreign=$(otool -L "$program" | tail -n +2 | awk '{print $1}' | grep -v -e '^/usr/lib/' -e '^/System/Library/' || true)
  [ -z "$foreign" ] || die "$(basename "$program") links libraries outside the OS: $foreign"
  # awk reads to the end (no exit) so otool never meets a closed pipe under pipefail.
  minos=$(otool -l "$program" | awk '/LC_BUILD_VERSION/ { seen = 1 } seen && $1 == "minos" && !done { print $2; done = 1 }')
  [ "$minos" = "$TARGET" ] || die "$(basename "$program") targets macOS $minos, expected $TARGET."
}

check_build() {
  local ffmpeg="$STAGE/bin/ffmpeg" name buildconf licence_text
  check_binary "$ffmpeg"
  check_binary "$STAGE/bin/ffprobe"
  "$STAGE/bin/ffprobe" -hide_banner -version >/dev/null || die "ffprobe does not run."
  buildconf=$("$ffmpeg" -hide_banner -buildconf)
  [[ $buildconf != *--enable-nonfree* && $buildconf == *--enable-gpl* ]] || die "unexpected licence flags in -buildconf."
  # Captured, not piped into grep -q: an early grep exit would SIGPIPE ffmpeg and trip pipefail.
  licence_text=$("$ffmpeg" -hide_banner -L)
  [[ $licence_text == *'either version 3 of the License'* ]] || die "ffmpeg -L does not state GPL version 3 or later."
  "$ffmpeg" -hide_banner -encoders >"$WORK_DIR/encoders.txt"
  for name in $REQUIRED_ENCODERS; do grep -Eq "^ [A-Z.]{6} $name " "$WORK_DIR/encoders.txt" || die "encoder $name is missing."; done
  "$ffmpeg" -hide_banner -filters >"$WORK_DIR/filters.txt"
  for name in $REQUIRED_FILTERS; do grep -Eq "^ [A-Z.]{2,3} $name " "$WORK_DIR/filters.txt" || die "filter $name is missing."; done
  printf '%s\n' "$buildconf" >"$STAGE/licenses/BUILDCONF.txt"
}

write_source_archive() {
  local root="ffmpeg-sources-$FFMPEG_VERSION" build_info
  mkdir -p "$ARCHIVE_DIR/$root/build"
  mv "$UPSTREAM" "$ARCHIVE_DIR/$root/upstream"
  cp "$SCRIPT_DIR/build-ffmpeg.sh" "$SCRIPT_DIR/lock-tool.mjs" "$SCRIPT_DIR/sources.lock.json" "$SCRIPT_DIR/README.md" "$ARCHIVE_DIR/$root/build/"
  build_info="$ARCHIVE_DIR/$root/BUILD-INFO.txt"
  {
    say "Corresponding source of ffmpeg/ffprobe $FFMPEG_VERSION (macOS arm64, minimum macOS $TARGET)."
    say "Rebuild: run build/build-ffmpeg.sh from a checkout laid out as scripts/ffmpeg-build/."
    say "upstream/ holds every source exactly as built; x264 is a git archive of the pinned commit."
    say ""; say "Sources (name, sha256, commit):"; cat "$RESOLVED"
    say ""; say "ffmpeg configure flags:"; cat "$WORK_DIR/configure-flags.txt"
    say ""; say "Toolchain:"; clang --version | awk 'NR == 1'; say "SDK $(xcrun --show-sdk-version)"; say "macOS $(sw_vers -productVersion)"
  } >"$build_info"
  tar -C "$ARCHIVE_DIR" --uid 0 --gid 0 --uname root --gname wheel -cf - "$root" | gzip -n -9 >"$STAGE/$root.tar.gz"
  {
    say "ffmpeg and ffprobe in this app are licensed GPL-3.0-or-later and statically link x264"
    say "(GPL-2.0-or-later) and LAME (LGPL-2.0-or-later). Their complete corresponding source is"
    say "published with every release as $root.tar.gz."
  } >"$STAGE/licenses/SOURCE.txt"
}

main() {
  check_host
  check_out_dir
  STAGE="$OUT_DIR.partial"
  [ ! -L "$STAGE" ] || die "$STAGE is a symlink."
  WORK_DIR=$(mktemp -d "${TMPDIR:-/tmp}/engineos-ffmpeg.XXXXXX")
  # A failed build leaves neither its sources nor a half-written output folder behind.
  trap 'rm -rf "$WORK_DIR" "$STAGE"' EXIT
  # The lock is validated before the first download (C4 fail-closed rule).
  node "$LOCK_TOOL" check "$LOCK_FILE" >"$WORK_DIR/lock.tsv" || die "sources.lock.json was refused; nothing was downloaded."
  TARGET=$(awk -F '\t' '$1 == "target" { print $2 }' "$WORK_DIR/lock.tsv")
  SRC="$WORK_DIR/src"; PREFIX="$WORK_DIR/prefix"; UPSTREAM="$WORK_DIR/upstream"; ARCHIVE_DIR="$WORK_DIR/archive"
  RESOLVED="$WORK_DIR/resolved.tsv"; FFMPEG_VERSION=""
  JOBS=$(sysctl -n hw.ncpu)
  ARCH_FLAGS="-arch arm64 -mmacosx-version-min=$TARGET"
  # Only the libraries built here are visible to pkg-config, never Homebrew's.
  export MACOSX_DEPLOYMENT_TARGET="$TARGET" PKG_CONFIG_LIBDIR="$PREFIX/lib/pkgconfig"
  unset PKG_CONFIG_PATH
  rm -rf "$STAGE"
  mkdir -p "$SRC" "$PREFIX" "$UPSTREAM" "$ARCHIVE_DIR" "$STAGE/licenses"
  : >"$RESOLVED"
  fetch_sources
  build_libraries
  build_ffmpeg
  check_build
  write_source_archive
  node "$LOCK_TOOL" manifest "$LOCK_FILE" "$STAGE" "$RESOLVED" "$WORK_DIR/configure-flags.txt" || die "build-manifest.json was not written."
  rm -rf "$OUT_DIR"
  mv "$STAGE" "$OUT_DIR"
  say "ffmpeg $FFMPEG_VERSION build ready: $OUT_DIR"
}

main
