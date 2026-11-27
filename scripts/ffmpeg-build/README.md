# ffmpeg build for the macOS installer

Builds the `ffmpeg` and `ffprobe` that the `.dmg` ships in `runtime/bin/` from the pinned sources in
`sources.lock.json`, and the complete corresponding source archive the GPL requires (plan 9.2,
contract C4 rev 1; vetting 0006 section 10). Packaging (`apps/shell/scripts/package-dmg.mjs`) reads
the output folder and downloads no ffmpeg binary.

## Run it locally

```sh
scripts/ffmpeg-build/build-ffmpeg.sh
```

The script takes no arguments. Output goes to `apps/shell/out/ffmpeg/`, or to the absolute folder in
`ENGINEOS_FFMPEG_BUILD_DIR`. The folder is replaced only after a complete build:

```
bin/ffmpeg, bin/ffprobe            static, macOS arm64, minimum macOS 13.0 (Electron 45's floor)
licenses/<source>/...              licence texts of FFmpeg, x264 and LAME
licenses/BUILDCONF.txt, SOURCE.txt build configuration and the source notice
ffmpeg-sources-<version>.tar.gz    every source as built, plus this folder's files
build-manifest.json                plan 9.2 shape: binaries and archive with sha256 and bytes, sources
```

Then package as usual: `pnpm --filter @studio/shell run package:dmg`.

## Requirements (not installed by the script)

The script checks for each tool and stops when one is missing.

- macOS on Apple Silicon (arm64).
- Xcode command line tools (`clang`, `make`, `otool`, `lipo`, `xcrun`).
- `pkg-config` and GnuPG (`gpg`, `gpgv`), for example from Homebrew.
- Node.js (the repository's own requirement), which validates the lock file and writes the manifest.
- `git` and `curl`.
- `nasm` is not needed for arm64: x264 and FFmpeg assemble their arm64 code with clang.

Homebrew libraries are never linked: configure runs with `--disable-autodetect`, and pkg-config only
sees the libraries this script builds. The binaries link only system libraries and frameworks, and
the script checks this.

## What is built, and why

Only the libraries the studio's own ffmpeg calls need (ticket 10):

| Source | Why |
|---|---|
| FFmpeg 9.1 | native decoders, demuxers, filters, the AAC, MJPEG, PNG and PCM encoders |
| x264 (commit pin) | `libx264`: every H.264 encode; the reason the build is GPL |
| LAME 4.0 | `libmp3lame`: the local voice writes `narration.mp3` |
| VideoToolbox, AudioToolbox | Apple system frameworks; `h264_videotoolbox` for the HyperFrames renderer |

Captions are burned from pre-rendered PNG images, so no text stack (freetype, libass) is built.
The build stops when any encoder or filter the studio calls is missing (`REQUIRED_ENCODERS`,
`REQUIRED_FILTERS` in the script).

## Pins and checks

Each source in `sources.lock.json` carries `name`, `version`, `licence`, `url`, `hosts`, and a
`sha256` or a git `commit`. The lock is validated before anything is downloaded; a source with
neither stops the build. Downloads go only to that source's `hosts`, and every redirect hop is
checked before it is followed.

- FFmpeg: ffmpeg.org publishes no checksum, so the pinned `sha256` is the Homebrew formula's value
  for the same URL, and the tarball must also verify against its detached signature with the
  pinned key fingerprint `FCF986EA15E6E293A5644F10B4322F04D67658D8`. Both checks must pass.
- x264: cloned, checked out at the pinned commit, and archived with `git archive`. The build uses
  that archive, so the published source is exactly the source that was compiled.
- LAME: the publisher's MD5 and a SHA-256 (from the Homebrew formula for the same URL) are both
  checked.

## Bumping a pin

A pin change is a supply-chain review (rules/security.md), never a convenience edit.

1. Find the new version on the publisher's own page (ffmpeg.org/releases, code.videolan.org for
   x264, sourceforge.net/projects/lame) and note the date you read it.
2. Edit the entry in `sources.lock.json`: `version`, `url`, `directory` (the tarball's top folder),
   and `sha256` or `commit`. For x264 use a commit hash, never a branch name. For FFmpeg keep the
   `signature` block and check that the release is still signed by the pinned fingerprint.
3. Never leave `sha256` and `commit` both empty: the lock check refuses the source. For FFmpeg,
   take the checksum from a second publisher of the same URL (for example the Homebrew formula)
   and keep the signature check.
4. Run the build. It stops on any mismatch. Read `licenses/BUILDCONF.txt` and the manifest before
   using the output.
5. Record the change and its sources in the PR. The release workflow caches the build on the hash
   of `sources.lock.json`, so a changed lock always rebuilds.
