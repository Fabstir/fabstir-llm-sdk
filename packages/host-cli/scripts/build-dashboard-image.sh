#!/bin/bash
# Build and push the lightweight dashboard Docker image

set -e

# Configuration
IMAGE_NAME="${IMAGE_NAME:-fabstir/host-cli}"
IMAGE_TAG="${IMAGE_TAG:-latest}"

echo "Building Fabstir Host CLI Dashboard image..."
echo "Image: ${IMAGE_NAME}:${IMAGE_TAG}"

# Build from repo root (needed for workspace context)
cd "$(dirname "$0")/../../.."

# Build the image
docker build \
  -f packages/host-cli/Dockerfile.dashboard \
  -t "${IMAGE_NAME}:${IMAGE_TAG}" \
  .

echo ""
echo "Build complete!"
echo ""
echo "To test locally:"
echo "  docker run --rm -it --network host ${IMAGE_NAME}:${IMAGE_TAG} dashboard"
echo ""
echo "To push to Docker Hub:"
echo "  docker push ${IMAGE_NAME}:${IMAGE_TAG}"
