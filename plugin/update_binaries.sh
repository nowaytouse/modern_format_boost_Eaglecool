#!/bin/bash
# Auto-updating binary dependency manager for Modern Format Boost Eagle Plugin
# Uses git sparse-checkout to efficiently fetch only binary files

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BIN_DIR="$SCRIPT_DIR/bin"
CONFIG_FILE="$SCRIPT_DIR/.binary_source"

# Default repository URL (can be overridden in config)
DEFAULT_REPO_URL="https://github.com/nowaytouse/modern-format-boost.git"
DEFAULT_BRANCH="main"

# Load configuration
if [ -f "$CONFIG_FILE" ]; then
    source "$CONFIG_FILE"
else
    REPO_URL="${REPO_URL:-$DEFAULT_REPO_URL}"
    BRANCH="${BRANCH:-$DEFAULT_BRANCH}"
fi

TEMP_DIR=$(mktemp -d)

echo "🔄 Modern Format Boost Binary Updater"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📦 Repository: $REPO_URL"
echo "🌿 Branch: $BRANCH"
echo ""

cleanup() {
    rm -rf "$TEMP_DIR"
}
trap cleanup EXIT

# Check if git is available
if ! command -v git &> /dev/null; then
    echo "❌ Error: git is not installed"
    exit 1
fi

# Clone repository with sparse checkout
echo "📥 Fetching latest binaries..."
git clone --depth 1 --filter=blob:none --sparse --branch "$BRANCH" "$REPO_URL" "$TEMP_DIR" 2>&1 | grep -v "Cloning into" || {
    echo "❌ Failed to clone repository. Please check:"
    echo "   - Repository URL: $REPO_URL"
    echo "   - Branch name: $BRANCH"
    echo "   - Network connection"
    exit 1
}

cd "$TEMP_DIR"

# Configure sparse checkout for binaries only
echo "🎯 Configuring sparse checkout..."
git sparse-checkout set \
    "target/release/img-hevc" \
    "target/release/vid-hevc" \
    "target/release/img-av1" \
    "target/release/vid-av1" \
    2>/dev/null

# Verify binaries exist
FOUND_COUNT=0
BINARIES=("img-hevc" "vid-hevc" "img-av1" "vid-av1")

for binary in "${BINARIES[@]}"; do
    if [ -f "target/release/$binary" ]; then
        ((FOUND_COUNT++))
    fi
done

if [ $FOUND_COUNT -eq 0 ]; then
    echo "❌ No binaries found in repository"
    echo "   Expected location: target/release/"
    exit 1
fi

# Create bin directory
mkdir -p "$BIN_DIR"

# Install binaries
echo ""
echo "📦 Installing binaries..."
for binary in "${BINARIES[@]}"; do
    if [ -f "target/release/$binary" ]; then
        cp "target/release/$binary" "$BIN_DIR/"
        chmod +x "$BIN_DIR/$binary"

        # Get file size
        SIZE=$(du -h "$BIN_DIR/$binary" | cut -f1)
        echo "✅ $binary ($SIZE)"
    else
        echo "⚠️  $binary (not found)"
    fi
done

# Save update timestamp
date +%s > "$BIN_DIR/.last_update"

echo ""
echo "✨ Binary update complete!"
echo "📍 Location: $BIN_DIR"
echo ""

# Display version info if available
if [ -x "$BIN_DIR/img-hevc" ]; then
    echo "ℹ️  Version check:"
    "$BIN_DIR/img-hevc" --version 2>/dev/null | head -1 || echo "   (version info not available)"
fi
