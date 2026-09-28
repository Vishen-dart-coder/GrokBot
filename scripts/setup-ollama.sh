#!/usr/bin/env bash
# Installs and starts Ollama for GrokBot Local. It does NOT download or run any model
# unless you pass a model name:   npm run ollama:setup -- qwen3:8b
set -euo pipefail

HOST="${OLLAMA_HOST:-http://127.0.0.1:11434}"
MODEL="${1:-}"

say() { printf '\033[1m==>\033[0m %s\n' "$*"; }

if ! command -v ollama >/dev/null 2>&1; then
  case "$(uname -s)" in
    Darwin)
      if command -v brew >/dev/null 2>&1; then
        say "Installing Ollama with Homebrew…"
        brew install ollama
      else
        say "Download the Ollama app from https://ollama.com/download/mac, open it once, then re-run this script."
        exit 1
      fi
      ;;
    Linux)
      say "Installing Ollama with the official install script…"
      curl -fsSL https://ollama.com/install.sh | sh
      ;;
    *)
      say "Install Ollama from https://ollama.com/download (Windows installer), then re-run this script."
      exit 1
      ;;
  esac
fi

say "Ollama $(ollama --version 2>/dev/null | awk '{print $NF}') installed."

if curl -fsS "$HOST/api/version" >/dev/null 2>&1; then
  say "Ollama server already running at $HOST"
else
  say "Starting Ollama server in the background (logs: /tmp/ollama.log)…"
  if [[ "$(uname -s)" == "Darwin" ]] && command -v brew >/dev/null 2>&1 && brew list ollama >/dev/null 2>&1; then
    brew services start ollama >/dev/null
  else
    nohup ollama serve >/tmp/ollama.log 2>&1 &
  fi
  for _ in $(seq 1 30); do
    curl -fsS "$HOST/api/version" >/dev/null 2>&1 && break
    sleep 1
  done
  curl -fsS "$HOST/api/version" >/dev/null || { echo "Ollama did not start. See /tmp/ollama.log"; exit 1; }
  say "Ollama server is up at $HOST"
fi

say "Installed models:"
ollama list || true

if [[ -n "$MODEL" ]]; then
  say "Downloading $MODEL (download only — it is not run)…"
  ollama pull "$MODEL"
else
  cat <<EOF

No model downloaded. When you're ready, pick one with tool-calling support, e.g.:
  ollama pull qwen3:8b        # ~5 GB, good all-round agent
  ollama pull llama3.1:8b     # ~5 GB
  ollama pull gpt-oss:20b     # ~13 GB, needs 16 GB+ RAM
or use Settings → Model → "Download a model" inside GrokBot Local.
EOF
fi
