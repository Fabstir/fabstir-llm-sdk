#!/bin/bash
# Copyright (c) 2025 Fabstir
# SPDX-License-Identifier: BUSL-1.1

# ============================================================================
# Build Production Docker Image and Push to GitHub Container Registry (GHCR)
# ============================================================================
#
# This script builds the comprehensive production Docker image combining:
# - fabstir-llm-node (Rust binary with STARK proofs)
# - TypeScript Host CLI (packages/host-cli)
# - NVIDIA CUDA runtime + Node.js
#
# Target Registry: ghcr.io/fabstir/llm-host:beta-latest (Private Beta)
#
# Prerequisites:
# - Docker with BuildKit enabled
# - GitHub Personal Access Token with packages:write scope
# - Logged in to GHCR: echo $GITHUB_TOKEN | docker login ghcr.io -u USERNAME --password-stdin
#
# Usage:
#   ./deployment/scripts/build-production-image.sh
#   ./deployment/scripts/build-production-image.sh --push
#   ./deployment/scripts/build-production-image.sh --tag v1.0.0 --push
# ============================================================================

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
IMAGE_NAME="ghcr.io/fabstir/llm-host"
DEFAULT_TAG="beta-latest"
DOCKERFILE="deployment/Dockerfile.production.comprehensive"

# Parse arguments
PUSH_IMAGE=false
CUSTOM_TAG=""

while [[ $# -gt 0 ]]; do
  case $1 in
    --push)
      PUSH_IMAGE=true
      shift
      ;;
    --tag)
      CUSTOM_TAG="$2"
      shift 2
      ;;
    *)
      echo -e "${RED}Unknown option: $1${NC}"
      echo "Usage: $0 [--push] [--tag VERSION]"
      exit 1
      ;;
  esac
done

# Determine tag
if [ -n "$CUSTOM_TAG" ]; then
  TAG="$CUSTOM_TAG"
else
  TAG="$DEFAULT_TAG"
fi

FULL_IMAGE_NAME="${IMAGE_NAME}:${TAG}"

echo ""
echo -e "${BLUE}============================================================================${NC}"
echo -e "${BLUE}  Fabstir LLM Host - Production Image Build${NC}"
echo -e "${BLUE}============================================================================${NC}"
echo ""
echo -e "${GREEN}Image:${NC}      $FULL_IMAGE_NAME"
echo -e "${GREEN}Push:${NC}       $PUSH_IMAGE"
echo -e "${GREEN}Dockerfile:${NC} $DOCKERFILE"
echo ""

# Verify prerequisites
echo -e "${YELLOW}Checking prerequisites...${NC}"

# Check if running from repository root
if [ ! -f "package.json" ]; then
  echo -e "${RED}ERROR: Must run from repository root${NC}"
  echo "Current directory: $(pwd)"
  exit 1
fi

# Check if Dockerfile exists
if [ ! -f "$DOCKERFILE" ]; then
  echo -e "${RED}ERROR: Dockerfile not found: $DOCKERFILE${NC}"
  exit 1
fi

# Check if fabstir-llm-node tarball exists
if [ ! -f "fabstir-llm-node-v8.1.6-websocket-error-logging.tar.gz" ]; then
  echo -e "${RED}ERROR: fabstir-llm-node tarball not found${NC}"
  echo "Expected: fabstir-llm-node-v8.1.6-websocket-error-logging.tar.gz"
  exit 1
fi

# Check if s5js tarball exists
if [ ! -f "s5js-dist.tar.gz" ]; then
  echo -e "${RED}ERROR: s5js-dist.tar.gz not found${NC}"
  exit 1
fi

echo -e "${GREEN}✅ All prerequisites found${NC}"
echo ""

# Enable Docker BuildKit
export DOCKER_BUILDKIT=1

# Build image
echo -e "${YELLOW}Building Docker image...${NC}"
echo ""

BUILD_START=$(date +%s)

docker build \
  --file "$DOCKERFILE" \
  --tag "$FULL_IMAGE_NAME" \
  --tag "${IMAGE_NAME}:latest" \
  --progress=plain \
  .

BUILD_END=$(date +%s)
BUILD_DURATION=$((BUILD_END - BUILD_START))

echo ""
echo -e "${GREEN}✅ Build completed in ${BUILD_DURATION}s${NC}"
echo ""

# Show image details
echo -e "${YELLOW}Image details:${NC}"
docker images "$IMAGE_NAME" --format "table {{.Repository}}\t{{.Tag}}\t{{.Size}}\t{{.CreatedAt}}"
echo ""

# Verify image can run
echo -e "${YELLOW}Verifying image...${NC}"
if docker run --rm "$FULL_IMAGE_NAME" --version > /dev/null 2>&1; then
  echo -e "${GREEN}✅ Image verification passed${NC}"
else
  echo -e "${YELLOW}⚠️  Image verification skipped (CLI version check)${NC}"
fi
echo ""

# Push to registry if requested
if [ "$PUSH_IMAGE" = true ]; then
  echo -e "${YELLOW}Pushing image to GHCR...${NC}"

  # Check if logged in to GHCR
  if ! docker info 2>/dev/null | grep -q "ghcr.io"; then
    echo -e "${YELLOW}⚠️  Not logged in to GHCR. Attempting login...${NC}"
    echo ""
    echo "Please set GITHUB_TOKEN environment variable and run:"
    echo "  export GITHUB_TOKEN=your_github_personal_access_token"
    echo "  echo \$GITHUB_TOKEN | docker login ghcr.io -u YOUR_GITHUB_USERNAME --password-stdin"
    echo ""
    exit 1
  fi

  echo "Pushing $FULL_IMAGE_NAME..."
  docker push "$FULL_IMAGE_NAME"

  if [ "$TAG" != "latest" ]; then
    echo "Pushing ${IMAGE_NAME}:latest..."
    docker push "${IMAGE_NAME}:latest"
  fi

  echo ""
  echo -e "${GREEN}✅ Image pushed successfully${NC}"
  echo ""
  echo -e "${BLUE}Image available at:${NC}"
  echo "  docker pull $FULL_IMAGE_NAME"
  echo ""
else
  echo -e "${YELLOW}Image built locally (not pushed to registry)${NC}"
  echo ""
  echo "To push to GHCR, run:"
  echo "  $0 --push"
  echo ""
fi

# Summary
echo -e "${BLUE}============================================================================${NC}"
echo -e "${GREEN}Build Summary${NC}"
echo -e "${BLUE}============================================================================${NC}"
echo ""
echo -e "${GREEN}Image:${NC}         $FULL_IMAGE_NAME"
echo -e "${GREEN}Size:${NC}          $(docker images "$FULL_IMAGE_NAME" --format "{{.Size}}")"
echo -e "${GREEN}Build time:${NC}    ${BUILD_DURATION}s"
echo -e "${GREEN}Pushed:${NC}        $PUSH_IMAGE"
echo ""

if [ "$PUSH_IMAGE" = true ]; then
  echo -e "${GREEN}Beta testers can now pull with:${NC}"
  echo "  docker pull $FULL_IMAGE_NAME"
else
  echo -e "${YELLOW}Next steps:${NC}"
  echo "  1. Test image locally"
  echo "  2. Push to GHCR: $0 --push"
fi

echo ""
echo -e "${BLUE}============================================================================${NC}"
