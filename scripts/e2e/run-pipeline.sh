#!/usr/bin/env bash
# End-to-end smoke run of the real studio pipeline on this Mac.
#
# Starts the services if they are down, queues a real run with the `studio` CLI, answers each
# in-run gate from the CLI (unless --no-approve), waits until the run reaches review or fails,
# then copies final.mp4, plan.md and report.md to an output folder and prints what ffprobe sees.
# The final review stays in the web, as the product intends.
#
# Usage: scripts/e2e/run-pipeline.sh [--recipe <id@version>] [--brief <file.json>]
#          [--reference <assetId@version>]... [--title <text>] [--timeout-min <n>]
#          [--out <dir>] [--no-approve] [--no-start]
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
DATA_HOME="${STUDIO_DATA_HOME:-$HOME/Library/Application Support/VideoStudio}"
RUNS_DIR="$DATA_HOME/runs"
WATCHER_LABEL="com.videostudio.watcher"
WATCHER_PLIST="$HOME/Library/LaunchAgents/$WATCHER_LABEL.plist"

recipe=""
brief="$SCRIPT_DIR/sample-brief.json"
title="E2E smoke $(date '+%Y-%m-%d %H:%M')"
timeout_min=30
out_root="$REPO_DIR/out/e2e"
auto_approve=1
start_services=1
references=()

usage() {
  sed -n '2,11p' "$0" | sed 's/^# \{0,1\}//'
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --recipe) recipe="$2"; shift 2 ;;
    --brief) brief="$2"; shift 2 ;;
    --reference) references+=("$2"); shift 2 ;;
    --title) title="$2"; shift 2 ;;
    --timeout-min) timeout_min="$2"; shift 2 ;;
    --out) out_root="$2"; shift 2 ;;
    --no-approve) auto_approve=0; shift ;;
    --no-start) start_services=0; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown option: $1" >&2; usage >&2; exit 64 ;;
  esac
done

log() { printf '[e2e %s] %s\n' "$(date '+%H:%M:%S')" "$*"; }
fail() { printf '[e2e] FAIL: %s\n' "$*" >&2; exit 1; }

# studio prints a harmless keychain warning per system certificate; keep the output readable.
studio_cli() {
  local err_file code=0
  err_file="$(mktemp)"
  studio "$@" 2>"$err_file" || code=$?
  grep -v 'trust settings of system certificate' "$err_file" >&2 || true
  rm -f "$err_file"
  return "$code"
}

json_get() {
  # json_get <file> <js expression over `r`>
  node -e 'const r=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));const v=(new Function("r","return ("+process.argv[2]+")"))(r);process.stdout.write(v==null?"":typeof v==="string"?v:JSON.stringify(v));' "$1" "$2"
}

preflight() {
  command -v studio >/dev/null || fail "studio CLI not on PATH; run scripts/install.sh first."
  command -v node >/dev/null || fail "node not on PATH."
  command -v ffprobe >/dev/null || fail "ffprobe not on PATH."
  [[ -f "$brief" ]] || fail "brief file not found: $brief"
  [[ -d "$RUNS_DIR" ]] || fail "runs folder not found: $RUNS_DIR"
}

default_recipe() {
  # The recipe of the newest run that reached review is a known-good choice on this machine.
  # Scanned in node because the data folder path holds a space ("Application Support").
  node -e '
    const fs = require("fs"), path = require("path");
    const dir = process.argv[1];
    const runs = fs.readdirSync(dir)
      .map((id) => path.join(dir, id, "run.json"))
      .filter((file) => fs.existsSync(file))
      .map((file) => ({ file, mtime: fs.statSync(file).mtimeMs }))
      .sort((a, b) => b.mtime - a.mtime);
    for (const { file } of runs) {
      const run = JSON.parse(fs.readFileSync(file, "utf8"));
      if (["review", "published"].includes(run.state?.status)) { process.stdout.write(run.recipe.ref); process.exit(0); }
    }
    process.exit(1);
  ' "$RUNS_DIR"
}

ensure_watcher() {
  if launchctl print "gui/$(id -u)/$WATCHER_LABEL" >/dev/null 2>&1; then
    log "watcher: loaded in launchd."
    return 0
  fi
  [[ -f "$WATCHER_PLIST" ]] || fail "watcher plist missing ($WATCHER_PLIST); run scripts/install.sh."
  log "watcher: not loaded, bootstrapping $WATCHER_LABEL."
  launchctl bootstrap "gui/$(id -u)" "$WATCHER_PLIST" || fail "could not load the watcher agent."
}

start_stack() {
  log "starting api and web (no-op when already running)."
  studio_cli start || log "warning: studio start reported a problem; continuing, the run only needs the watcher."
  ensure_watcher
}

queue_run() {
  local args=(run --recipe "$recipe" --brief "$brief" --title "$title")
  local ref
  for ref in "${references[@]+"${references[@]}"}"; do args+=(--reference "$ref"); done
  log "queueing: studio ${args[*]}"
  local output
  output="$(studio_cli "${args[@]}")" || fail "studio run failed:\n$output"
  printf '%s\n' "$output" >&2
  run_id="$(printf '%s' "$output" | grep -oE '\b[0-9A-HJKMNP-TV-Z]{26}\b' | head -1)"
  [[ -n "$run_id" ]] || fail "could not read the run id from studio run output."
  log "run id: $run_id"
}

wait_for_outcome() {
  local run_json="$RUNS_DIR/$run_id/run.json"
  local deadline=$(( $(date +%s) + timeout_min * 60 ))
  local last_line="" status cause line stage
  while (( $(date +%s) < deadline )); do
    if [[ -f "$run_json" ]]; then
      status="$(json_get "$run_json" 'r.state.status')"
      cause="$(json_get "$run_json" 'r.state.cause ? (r.state.cause.gate || r.state.cause.kind) : ""')"
      stage="$( [[ -f "$RUNS_DIR/$run_id/now.json" ]] && json_get "$RUNS_DIR/$run_id/now.json" 'r.stageNumber+"/"+r.stageId+" "+(r.step||"")' || true)"
      line="status=$status${cause:+ cause=$cause}${stage:+ stage=$stage}"
      [[ "$line" != "$last_line" ]] && log "$line" && last_line="$line"
      case "$status" in
        review|published) return 0 ;;
        failed|stopped|cancelled) return 1 ;;
        waiting)
          if [[ "$cause" == "plan" || "$cause" == "planner-questions" || -n "$(json_get "$run_json" 'r.state.cause && r.state.cause.kind==="gate" ? "g" : ""')" ]]; then
            if (( auto_approve )); then
              log "approving gate '$cause' from the CLI."
              studio_cli approve "$run_id" --notes "Auto-approved by scripts/e2e/run-pipeline.sh" >&2 || fail "approve failed."
            else
              log "waiting on gate '$cause'; approve it in the web or with: studio approve $run_id"
            fi
          else
            log "run waits on something the script cannot answer: $(json_get "$run_json" 'r.state.reason || ""')"
            return 2
          fi
          ;;
      esac
    fi
    sleep 5
  done
  log "timed out after $timeout_min minutes."
  return 3
}

report() {
  local outcome="$1"
  local run_dir="$RUNS_DIR/$run_id"
  local dest="$out_root/$run_id"
  mkdir -p "$dest"
  local file
  for file in final.mp4 plan.md report.md cost.json run.json; do
    [[ -f "$run_dir/$file" ]] && cp "$run_dir/$file" "$dest/"
  done
  echo
  echo "================ E2E outcome ================"
  echo "Run:       $run_id"
  echo "Recipe:    $recipe"
  echo "Outcome:   $outcome"
  echo "Run dir:   $run_dir"
  echo "Copied to: $dest"
  echo "Stages:"
  ls "$run_dir/stages" 2>/dev/null | sed 's/^/  - /'
  if [[ -f "$dest/cost.json" ]]; then
    echo "Cost:      $(json_get "$dest/cost.json" 'r.totalUsd ?? r.total ?? r')"
  fi
  if [[ -f "$dest/final.mp4" ]]; then
    echo "final.mp4:"
    ffprobe -v error -show_entries format=duration,size:stream=codec_type,codec_name,width,height \
      -of default=noprint_wrappers=1 "$dest/final.mp4" | sed 's/^/  /'
    echo "Open it:   open \"$dest/final.mp4\""
  else
    echo "final.mp4: not produced"
  fi
  echo "Review in the web: http://127.0.0.1:4310/runs/$run_id"
  echo "============================================="
}

main() {
  preflight
  if [[ -z "$recipe" ]]; then
    recipe="$(default_recipe)" || fail "no finished run to borrow a recipe from; pass --recipe <id@version>."
    log "recipe (from newest finished run): $recipe"
  fi
  (( start_services )) && start_stack
  queue_run
  local code=0
  wait_for_outcome || code=$?
  case "$code" in
    0) report "PASS (reached review)" ;;
    1) report "FAIL ($(json_get "$RUNS_DIR/$run_id/run.json" 'r.state.status + ": " + (r.state.reason || "")'))" ;;
    2) report "BLOCKED (needs a human answer)" ;;
    *) report "TIMEOUT" ;;
  esac
  exit "$code"
}

main
