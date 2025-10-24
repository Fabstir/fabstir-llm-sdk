#!/bin/bash
# Copyright (c) 2025 Fabstir
# SPDX-License-Identifier: BUSL-1.1

# ============================================================================
# Download Test Model for Fabstir LLM Host
# ============================================================================
#
# Downloads TinyVicuna 1B GGUF model (~1GB) from HuggingFace
# This is the approved test model with hash:
#   0x0b75a2061e70e736924a30c0a327db7ab719402129f76f631adbd7b7a5a5bced
#
# Usage:
#   ./deployment/scripts/download-test-model.sh
#   bash <(curl -s https://raw.githubusercontent.com/fabstir/fabstir-llm-sdk/main/deployment/scripts/download-test-model.sh)
#
# Model will be downloaded to: ~/fabstir-models/tiny-vicuna-1b.q4_k_m.gguf
# ============================================================================

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
MODEL_URL="https://huggingface.co/afrideva/Tiny-Vicuna-1B-GGUF/resolve/main/tiny-vicuna-1b.q4_k_m.gguf"
MODEL_NAME="tiny-vicuna-1b.q4_k_m.gguf"
MODEL_DIR="${HOME}/fabstir-models"
MODEL_PATH="${MODEL_DIR}/${MODEL_NAME}"
EXPECTED_SIZE_MB=690  # Approximate size in MB

echo ""
echo -e "${BLUE}============================================================================${NC}"
echo -e "${BLUE}  Fabstir LLM Host - Model Download${NC}"
echo -e "${BLUE}============================================================================${NC}"
echo ""
echo -e "${GREEN}Model:${NC}       TinyVicuna 1B (GGUF Q4_K_M)"
echo -e "${GREEN}Size:${NC}        ~${EXPECTED_SIZE_MB}MB"
echo -e "${GREEN}Source:${NC}      HuggingFace (afrideva/Tiny-Vicuna-1B-GGUF)"
echo -e "${GREEN}Destination:${NC} ${MODEL_PATH}"
echo ""

# Check if model already exists
if [ -f "$MODEL_PATH" ]; then
  FILE_SIZE=$(du -m "$MODEL_PATH" | cut -f1)
  echo -e "${YELLOW}Model already exists!${NC}"
  echo -e "${GREEN}File:${NC} ${MODEL_PATH}"
  echo -e "${GREEN}Size:${NC} ${FILE_SIZE}MB"
  echo ""
  read -p "Re-download? (y/N) " -n 1 -r
  echo
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo -e "${GREEN}Using existing model${NC}"
    exit 0
  fi
  echo -e "${YELLOW}Re-downloading...${NC}"
  rm -f "$MODEL_PATH"
fi

# Create models directory if it doesn't exist
echo -e "${YELLOW}Creating models directory...${NC}"
mkdir -p "$MODEL_DIR"

# Check for required tools
if ! command -v curl &> /dev/null && ! command -v wget &> /dev/null; then
  echo -e "${RED}ERROR: Neither curl nor wget found${NC}"
  echo "Please install curl or wget to download the model"
  exit 1
fi

# Download model
echo -e "${YELLOW}Downloading model from HuggingFace...${NC}"
echo ""
echo "This will download ~${EXPECTED_SIZE_MB}MB. Please be patient."
echo ""

DOWNLOAD_START=$(date +%s)

if command -v curl &> /dev/null; then
  # Use curl with progress bar
  curl -L \
    --progress-bar \
    --output "$MODEL_PATH" \
    "$MODEL_URL"
elif command -v wget &> /dev/null; then
  # Use wget with progress bar
  wget \
    --show-progress \
    --output-document "$MODEL_PATH" \
    "$MODEL_URL"
fi

DOWNLOAD_END=$(date +%s)
DOWNLOAD_DURATION=$((DOWNLOAD_END - DOWNLOAD_START))

echo ""
echo -e "${GREEN}✅ Download completed in ${DOWNLOAD_DURATION}s${NC}"
echo ""

# Verify download
echo -e "${YELLOW}Verifying download...${NC}"

if [ ! -f "$MODEL_PATH" ]; then
  echo -e "${RED}ERROR: Model file not found after download${NC}"
  exit 1
fi

FILE_SIZE=$(du -m "$MODEL_PATH" | cut -f1)

# Check if file size is reasonable (within 20% of expected)
MIN_SIZE=$((EXPECTED_SIZE_MB * 80 / 100))
MAX_SIZE=$((EXPECTED_SIZE_MB * 120 / 100))

if [ "$FILE_SIZE" -lt "$MIN_SIZE" ] || [ "$FILE_SIZE" -gt "$MAX_SIZE" ]; then
  echo -e "${RED}WARNING: Unexpected file size${NC}"
  echo "  Expected: ~${EXPECTED_SIZE_MB}MB"
  echo "  Got:      ${FILE_SIZE}MB"
  echo ""
  echo "The download may be incomplete. Please try again."
  exit 1
fi

echo -e "${GREEN}✅ Verification passed${NC}"
echo ""

# Summary
echo -e "${BLUE}============================================================================${NC}"
echo -e "${GREEN}Download Summary${NC}"
echo -e "${BLUE}============================================================================${NC}"
echo ""
echo -e "${GREEN}Model file:${NC}      ${MODEL_PATH}"
echo -e "${GREEN}File size:${NC}       ${FILE_SIZE}MB"
echo -e "${GREEN}Download time:${NC}   ${DOWNLOAD_DURATION}s"
echo -e "${GREEN}Model format:${NC}    GGUF (Q4_K_M quantization)"
echo ""
echo -e "${GREEN}Model hash (for registration):${NC}"
echo "  0x0b75a2061e70e736924a30c0a327db7ab719402129f76f631adbd7b7a5a5bced"
echo ""
echo -e "${GREEN}Model string (for registration):${NC}"
echo "  CohereForAI/TinyVicuna-1B-32k-GGUF:tiny-vicuna-1b.q4_k_m.gguf"
echo ""
echo -e "${BLUE}============================================================================${NC}"
echo ""
echo -e "${YELLOW}Next steps:${NC}"
echo "  1. Run Docker container with volume mount:"
echo "     docker run -v ${MODEL_DIR}:/models ..."
echo ""
echo "  2. Or specify model path in .env:"
echo "     MODEL_PATH=/models/${MODEL_NAME}"
echo ""
echo -e "${GREEN}Model is ready to use!${NC}"
echo ""
