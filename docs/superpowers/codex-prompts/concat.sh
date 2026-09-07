#!/bin/bash
# Concatenate the shared preamble with one task prompt.
# Usage: ./concat.sh 03   → outputs the full prompt for task 3

set -euo pipefail

TASK_NUM="${1:?usage: $0 <task-number 01-14>}"
PROMPTS_DIR="$(cd "$(dirname "$0")" && pwd)"

cat "${PROMPTS_DIR}/00-preamble.md"
echo ""
cat "${PROMPTS_DIR}/$(printf '%02d' "$TASK_NUM")-"*.md
