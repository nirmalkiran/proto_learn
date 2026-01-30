#!/bin/bash
set -e

TOKEN=$1
URL=$2
DIR="wispr-agent"

echo "================================================"
echo "   WISPR Agent - Linux/macOS Setup Initializing"
echo "================================================"

# Clean up any existing directory to avoid duplicates
if [ -d "$DIR" ]; then
  echo "Removing existing $DIR directory..."
  rm -rf "$DIR"
fi

mkdir -p "$DIR"
cd "$DIR"

FILES=(
  "agent.js" "package.json" "config.js"
  "controllers/appium-controller.js" "controllers/device-controller.js" "controllers/emulator-controller.js"
  "services/recording-service.js" "services/replay-engine.js" "services/screenshot-service.js"
  "utils/adb-utils.js" "utils/process-manager.js" "README.md" "Dockerfile"
)

for f in "${FILES[@]}"; do
  mkdir -p "$(dirname "$f")"
  echo "Downloading: $f"
  curl -sSL "$URL/agent-package/$f" -o "$f"
done

echo -e "\nInstalling dependencies... (this may take a minute)"
npm install

echo -e "\nStarting WISPR Agent..."
export WISPR_API_TOKEN="$TOKEN"
npm start
