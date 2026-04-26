#!/bin/bash
# ============================================================
# VideoShift End-to-End Demo Script
# ============================================================
# Demonstrates the full conversion flow:
#   1. Check server health
#   2. Register (or login) a test user
#   3. Upload a synthetic test video
#   4. List available output formats
#   5. Start a conversion job
#   6. Poll until the job completes
#   7. Download the converted file
#
# Usage:
#   chmod +x demo.sh
#   ./demo.sh                         # default: localhost:3001 → mp4
#   API_URL=http://myserver ./demo.sh
#   OUTPUT_FORMAT=mp3 ./demo.sh
# ============================================================

set -euo pipefail

# ── Config ───────────────────────────────────────────────────
API_URL="${API_URL:-http://localhost:3001}"
TEST_EMAIL="${TEST_EMAIL:-demo_$(date +%s)@videoshift.test}"
TEST_PASSWORD="${TEST_PASSWORD:-demo_password_123}"
OUTPUT_FORMAT="${OUTPUT_FORMAT:-mp4}"
COOKIE_JAR="${TMPDIR:-/tmp}/videoshift_demo_cookies_$$.txt"
TEST_VIDEO="${TMPDIR:-/tmp}/videoshift_demo_$$.mp4"
DOWNLOAD_DIR="${TMPDIR:-/tmp}"
MAX_POLL_ATTEMPTS=60   # 2 minutes at 2-second intervals

# ── Colors ───────────────────────────────────────────────────
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

step()  { echo -e "\n${CYAN}${BOLD}▶ $*${NC}"; }
ok()    { echo -e "  ${GREEN}✓ $*${NC}"; }
warn()  { echo -e "  ${YELLOW}⚠ $*${NC}"; }
err()   { echo -e "  ${RED}✗ $*${NC}" >&2; }
die()   { err "$*"; exit 1; }

# ── Helpers ───────────────────────────────────────────────────
require_cmd() {
  command -v "$1" &>/dev/null || die "Required command not found: $1"
}

json_field() {
  # Extract a JSON string field by key name (no jq dependency)
  local key="$1" json="$2"
  echo "$json" | grep -oP "\"${key}\"\\s*:\\s*\"[^\"]*\"" | head -1 \
    | sed 's/.*":\s*"//' | sed 's/"$//'
}

json_number() {
  local key="$1" json="$2"
  echo "$json" | grep -oP "\"${key}\"\\s*:\\s*[0-9]+" | head -1 \
    | grep -oP '[0-9]+$'
}

# ── Cleanup ───────────────────────────────────────────────────
cleanup() {
  rm -f "$COOKIE_JAR" "$TEST_VIDEO"
}
trap cleanup EXIT

# ── Steps ─────────────────────────────────────────────────────

check_deps() {
  step "Checking dependencies"
  require_cmd curl
  if command -v ffmpeg &>/dev/null; then
    ok "ffmpeg found — will create a real test video"
    HAVE_FFMPEG=true
  else
    warn "ffmpeg not found — will use a minimal stub file"
    HAVE_FFMPEG=false
  fi
}

check_server() {
  step "Checking API server at ${API_URL}"
  local resp
  resp=$(curl -sf "${API_URL}/health" 2>/dev/null) \
    || die "Server not reachable at ${API_URL}. Start it with: docker-compose up -d"
  ok "Server is up: $resp"
}

create_test_video() {
  step "Creating test video"
  if [ "$HAVE_FFMPEG" = "true" ]; then
    ffmpeg -f lavfi -i "testsrc=duration=3:size=320x240:rate=24" \
           -f lavfi -i "sine=frequency=440:duration=3" \
           -c:v libx264 -c:a aac -pix_fmt yuv420p \
           "$TEST_VIDEO" -y 2>/dev/null
    local size
    size=$(wc -c < "$TEST_VIDEO" | tr -d ' ')
    ok "Created ${TEST_VIDEO} (${size} bytes)"
  else
    # Minimal valid MP4-like stub (enough for the upload endpoint)
    printf '\x00\x00\x00\x20\x66\x74\x79\x70\x6d\x70\x34\x32' > "$TEST_VIDEO"
    warn "Using stub file (${TEST_VIDEO}). Real conversion may fail without ffmpeg."
  fi
}

register_or_login() {
  step "Registering user: ${TEST_EMAIL}"
  local resp
  resp=$(curl -sf -X POST "${API_URL}/api/auth/register" \
    -H "Content-Type: application/json" \
    -c "$COOKIE_JAR" \
    -d "{\"email\":\"${TEST_EMAIL}\",\"password\":\"${TEST_PASSWORD}\"}" 2>/dev/null) || true

  if echo "$resp" | grep -q '"id"'; then
    ok "Registered successfully"
    return
  fi

  # Already registered — fall back to login
  warn "Registration returned: $resp — trying login instead"
  step "Logging in as ${TEST_EMAIL}"
  resp=$(curl -sf -X POST "${API_URL}/api/auth/login" \
    -H "Content-Type: application/json" \
    -c "$COOKIE_JAR" \
    -d "{\"email\":\"${TEST_EMAIL}\",\"password\":\"${TEST_PASSWORD}\"}" 2>/dev/null) \
    || die "Login failed: $resp"

  echo "$resp" | grep -q '"id"' || die "Login response unexpected: $resp"
  ok "Logged in"
}

list_formats() {
  step "Fetching supported formats"
  local resp
  resp=$(curl -sf "${API_URL}/api/convert/formats" 2>/dev/null) \
    || die "Could not fetch formats"
  echo "  $resp" | grep -oP '"id":"[^"]*"' | sed 's/"id":"/  • /' | sed 's/"$//'
  ok "Done"
}

upload_file() {
  step "Uploading ${TEST_VIDEO}"
  local resp
  resp=$(curl -sf -X POST "${API_URL}/api/upload" \
    -b "$COOKIE_JAR" \
    -F "file=@${TEST_VIDEO};type=video/mp4" 2>/dev/null) \
    || die "Upload request failed"

  echo "$resp" | grep -q '"fileId"' || die "Upload failed: $resp"
  FILE_ID=$(json_field "fileId" "$resp")
  [[ -n "$FILE_ID" ]] || die "Could not parse fileId from: $resp"
  ok "Uploaded — fileId: ${FILE_ID}"
}

start_conversion() {
  step "Starting conversion to ${OUTPUT_FORMAT}"
  local resp
  resp=$(curl -sf -X POST "${API_URL}/api/convert" \
    -H "Content-Type: application/json" \
    -b "$COOKIE_JAR" \
    -d "{\"fileId\":\"${FILE_ID}\",\"outputFormat\":\"${OUTPUT_FORMAT}\"}" 2>/dev/null) \
    || die "Conversion request failed"

  echo "$resp" | grep -q '"jobId"' || die "Conversion failed: $resp"
  JOB_ID=$(json_field "jobId" "$resp")
  [[ -n "$JOB_ID" ]] || die "Could not parse jobId from: $resp"
  ok "Job queued — jobId: ${JOB_ID}"
}

poll_job() {
  step "Polling job ${JOB_ID} (max $((MAX_POLL_ATTEMPTS * 2))s)"
  local attempt=0 status progress

  while [ $attempt -lt $MAX_POLL_ATTEMPTS ]; do
    local resp
    resp=$(curl -sf "${API_URL}/api/convert/job/${JOB_ID}" \
      -b "$COOKIE_JAR" 2>/dev/null) || true

    status=$(json_field "status" "$resp")
    progress=$(json_number "progress" "$resp")
    progress="${progress:-0}"

    printf "  attempt %2d/%d — status: %-12s progress: %s%%\n" \
      "$((attempt + 1))" "$MAX_POLL_ATTEMPTS" "$status" "$progress"

    case "$status" in
      completed)
        ok "Conversion complete!"
        DOWNLOAD_URL=$(json_field "downloadUrl" "$resp")
        return 0
        ;;
      failed)
        local errMsg
        errMsg=$(json_field "errorMessage" "$resp")
        die "Conversion failed: $errMsg"
        ;;
    esac

    sleep 2
    attempt=$((attempt + 1))
  done

  die "Timed out waiting for conversion after $((MAX_POLL_ATTEMPTS * 2)) seconds"
}

download_result() {
  if [[ -z "${DOWNLOAD_URL:-}" ]]; then
    warn "No download URL returned — skipping download step"
    return
  fi

  step "Downloading result"
  local out_file="${DOWNLOAD_DIR}/videoshift_result_$$.${OUTPUT_FORMAT}"
  curl -sf -b "$COOKIE_JAR" \
    "${API_URL}${DOWNLOAD_URL}" \
    -o "$out_file" 2>/dev/null \
    || { warn "Download failed — the file may still be on the server at: ${DOWNLOAD_URL}"; return; }

  local size
  size=$(wc -c < "$out_file" | tr -d ' ')
  ok "Saved to ${out_file} (${size} bytes)"
}

# ── Main ──────────────────────────────────────────────────────
main() {
  echo ""
  echo -e "${BOLD}╔══════════════════════════════════════════╗"
  echo -e "║        VideoShift End-to-End Demo        ║"
  echo -e "╚══════════════════════════════════════════╝${NC}"
  echo "  API:    ${API_URL}"
  echo "  Format: ${OUTPUT_FORMAT}"
  echo ""

  check_deps
  check_server
  create_test_video
  list_formats
  register_or_login
  upload_file
  start_conversion
  poll_job
  download_result

  echo ""
  echo -e "${BOLD}${GREEN}╔══════════════════════════════════════════╗"
  echo -e "║        Demo completed successfully!      ║"
  echo -e "╚══════════════════════════════════════════╝${NC}"
}

main "$@"
