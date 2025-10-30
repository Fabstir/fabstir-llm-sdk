# Registry Migration Guide: GHCR → Docker Hub

**For Project Team**: How to transition from private beta (GHCR) to public launch (Docker Hub)

---

## Overview

This guide covers the migration from private beta on GitHub Container Registry (GHCR) to public launch on Docker Hub.

### Registry Strategy

| Phase | Registry | Image Name | Access | Purpose |
|-------|----------|------------|--------|---------|
| **Private Beta** | GHCR | `ghcr.io/fabstir/llm-host:beta-latest` | GitHub Auth | Controlled testing with invited beta testers |
| **Public Launch** | Docker Hub | `fabstir/llm-host:v1.0` | Public | Open access for all GPU providers |

---

## Timeline

### Week 1-3: Private Beta (GHCR)
- ✅ Limited access to invited beta testers
- ✅ GitHub authentication required
- ✅ Testing on Base Sepolia testnet
- ✅ Collect feedback and fix issues

### Week 4: Transition Preparation
- 📝 Final testing and bug fixes
- 📝 Documentation polish
- 📝 Docker Hub setup and verification
- 📝 Prepare migration scripts

### Week 5+: Public Launch (Docker Hub)
- 🚀 Push to Docker Hub
- 🚀 Update all documentation
- 🚀 Announce public availability
- 🚀 Keep GHCR as mirror/backup

---

## Docker Hub Setup

### 1. Create Docker Hub Repository

```bash
# Login to Docker Hub
docker login

# Create repository (via web UI or CLI)
# https://hub.docker.com/repository/create
# Repository name: fabstir/llm-host
# Visibility: Public
# Description: Decentralized AI marketplace GPU host node
```

### 2. Configure Repository Settings

**Description**:
```
Fabstir LLM Host - Run AI inference workloads and earn USDC/FAB tokens

This Docker image contains everything needed to run a GPU node in the Fabstir decentralized AI marketplace:
- fabstir-llm-node (Rust inference server with STARK proofs)
- TypeScript Host CLI for blockchain registration
- NVIDIA CUDA runtime for GPU acceleration
- Support for GGUF models (LLaMA, GPT, Mistral, etc.)

Documentation: https://docs.fabstir.com
GitHub: https://github.com/fabstir/fabstir-llm-sdk
```

**Tags**:
- `latest` - Latest stable release
- `v1.0`, `v1.1`, etc. - Version releases
- `beta` - Beta builds (mirror from GHCR)

---

## Migration Steps

### Phase 1: Build and Tag for Docker Hub

```bash
# Navigate to repository root
cd fabstir-llm-sdk

# Build production image (if not already built)
./deployment/scripts/build-production-image.sh

# Tag for Docker Hub
docker tag ghcr.io/fabstir/llm-host:beta-latest fabstir/llm-host:v1.0
docker tag ghcr.io/fabstir/llm-host:beta-latest fabstir/llm-host:latest
```

### Phase 2: Push to Docker Hub

```bash
# Login to Docker Hub
docker login
# Enter Docker Hub credentials

# Push versioned tag
docker push fabstir/llm-host:v1.0

# Push latest tag
docker push fabstir/llm-host:latest
```

### Phase 3: Verify Docker Hub Image

```bash
# Pull from Docker Hub (fresh)
docker pull fabstir/llm-host:v1.0

# Test image
docker run --rm fabstir/llm-host:v1.0 --version

# Verify GPU access
docker run --rm --gpus all fabstir/llm-host:v1.0 --help
```

### Phase 4: Update Documentation

**Files to update**:

1. **`deployment/docs/BETA_TESTER_QUICK_START.md`**
   ```diff
   - docker pull ghcr.io/fabstir/llm-host:beta-latest
   + docker pull fabstir/llm-host:v1.0
   ```

2. **`deployment/scripts/deploy-host3-vultr.sh`**
   ```diff
   - DOCKER_IMAGE="ghcr.io/fabstir/llm-host:beta-latest"
   + DOCKER_IMAGE="fabstir/llm-host:v1.0"
   ```

3. **`README.md`**
   ```diff
   - # Private Beta - Invitation Required
   + # Public Launch - Open to All GPU Providers
   ```

### Phase 5: Update GitHub Actions Workflow

Create new workflow for Docker Hub builds:

```yaml
# .github/workflows/docker-build-public.yml
name: Build and Push to Docker Hub

on:
  push:
    tags:
      - 'v*.*.*'  # Trigger on version tags (v1.0.0, v1.1.0, etc.)

jobs:
  build-and-push:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3

      - name: Login to Docker Hub
        uses: docker/login-action@v3
        with:
          username: ${{ secrets.DOCKERHUB_USERNAME }}
          password: ${{ secrets.DOCKERHUB_TOKEN }}

      - name: Extract version
        id: meta
        uses: docker/metadata-action@v5
        with:
          images: fabstir/llm-host

      - name: Build and push
        uses: docker/build-push-action@v5
        with:
          context: .
          file: deployment/Dockerfile.production.comprehensive
          push: true
          tags: ${{ steps.meta.outputs.tags }}
          labels: ${{ steps.meta.outputs.labels }}
```

**Required GitHub Secrets**:
- `DOCKERHUB_USERNAME`: Your Docker Hub username
- `DOCKERHUB_TOKEN`: Docker Hub access token (create at https://hub.docker.com/settings/security)

### Phase 6: Announce Public Launch

**GitHub Release Notes**:
```markdown
# Fabstir LLM Host v1.0 - Public Launch 🚀

We're excited to announce the public launch of Fabstir LLM Host!

## What's New
- 🌍 Public availability on Docker Hub
- 📦 Simplified deployment (3 commands)
- 🔧 Production-ready with STARK proof generation
- 💰 Earn USDC/FAB for AI inference workloads

## Quick Start
```bash
docker pull fabstir/llm-host:v1.0
docker run -d --gpus all fabstir/llm-host:v1.0 start
```

See full guide: https://docs.fabstir.com/deployment

## For Beta Testers
Your GHCR image will continue to work. To migrate to Docker Hub:
```bash
docker pull fabstir/llm-host:v1.0
# Update your docker run command
```

Thank you for being part of our beta! 🙏
```

**Social Media**:
- Twitter/X announcement
- Discord announcement (#announcements)
- Reddit post (r/machinelearning, r/cryptocurrency)
- HackerNews "Show HN"

---

## Backward Compatibility for Beta Testers

### Keep GHCR Image Available

Even after public launch, maintain GHCR for existing beta testers:

```bash
# Continue pushing to GHCR as mirror
docker tag fabstir/llm-host:v1.0 ghcr.io/fabstir/llm-host:v1.0
docker push ghcr.io/fabstir/llm-host:v1.0

# Keep beta-latest for legacy compatibility
docker tag fabstir/llm-host:v1.0 ghcr.io/fabstir/llm-host:beta-latest
docker push ghcr.io/fabstir/llm-host:beta-latest
```

### Migration Notice for Beta Testers

Send email to beta testers:

```
Subject: Fabstir LLM Host - Public Launch & Migration

Hi [Beta Tester],

Great news! Fabstir LLM Host is now publicly available on Docker Hub.

## What this means for you:

1. Your current GHCR image will continue to work
2. We recommend migrating to Docker Hub for easier updates
3. No breaking changes - same configuration works

## How to migrate (optional):

```bash
# Pull new image
docker pull fabstir/llm-host:v1.0

# Stop current container
docker stop fabstir-host && docker rm fabstir-host

# Run with new image
docker run -d --gpus all \
  --name fabstir-host \
  -p 8083:8083 -p 9000:9000 \
  -v ~/fabstir-models:/models \
  --env-file .env \
  fabstir/llm-host:v1.0 start --daemon
```

## Benefits of migrating:

- ✅ No GitHub authentication needed
- ✅ Simpler pull commands
- ✅ Better discoverability
- ✅ Faster updates via Docker Hub

Thanks for being part of our beta! Your feedback was invaluable.

Best,
Fabstir Team
```

---

## Tagging Strategy

### Version Tags

```bash
# Major.Minor.Patch semantic versioning
docker tag fabstir/llm-host:latest fabstir/llm-host:v1.0.0
docker tag fabstir/llm-host:latest fabstir/llm-host:v1.0
docker tag fabstir/llm-host:latest fabstir/llm-host:v1

# Push all tags
docker push fabstir/llm-host:v1.0.0
docker push fabstir/llm-host:v1.0
docker push fabstir/llm-host:v1
docker push fabstir/llm-host:latest
```

### Special Tags

```bash
# Beta builds (mirror from GHCR)
docker tag ghcr.io/fabstir/llm-host:beta-latest fabstir/llm-host:beta

# Development builds
docker tag fabstir/llm-host:latest fabstir/llm-host:dev

# Testnet vs Mainnet
docker tag fabstir/llm-host:v1.0 fabstir/llm-host:testnet-v1.0
docker tag fabstir/llm-host:v1.0 fabstir/llm-host:mainnet-v1.0
```

---

## Automated Build Pipeline

### Full CI/CD Workflow

```yaml
# .github/workflows/docker-build-all.yml
name: Build and Push to All Registries

on:
  push:
    branches:
      - main
    tags:
      - 'v*.*.*'

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3

      # Login to GHCR
      - name: Login to GitHub Container Registry
        uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      # Login to Docker Hub
      - name: Login to Docker Hub
        uses: docker/login-action@v3
        with:
          username: ${{ secrets.DOCKERHUB_USERNAME }}
          password: ${{ secrets.DOCKERHUB_TOKEN }}

      # Build and push to both registries
      - name: Build and push
        uses: docker/build-push-action@v5
        with:
          context: .
          file: deployment/Dockerfile.production.comprehensive
          push: true
          tags: |
            ghcr.io/fabstir/llm-host:beta-latest
            ghcr.io/fabstir/llm-host:${{ github.ref_name }}
            fabstir/llm-host:latest
            fabstir/llm-host:${{ github.ref_name }}
```

---

## Monitoring Post-Migration

### Track Pull Statistics

**Docker Hub**:
- View at: https://hub.docker.com/r/fabstir/llm-host/tags
- Metrics: Pulls, stars, watchers

**GHCR**:
- View at: https://github.com/fabstir/fabstir-llm-sdk/pkgs/container/llm-host
- Metrics: Pulls (limited stats)

### Beta Tester Migration Rate

Track which beta testers have migrated:

```bash
# Log Docker Hub pulls by unique IPs
# Compare with GHCR pull stats
# Send reminder emails to non-migrated testers
```

---

## Rollback Plan

If issues arise after public launch:

### Option 1: Quick Rollback

```bash
# Untag latest on Docker Hub
docker rmi fabstir/llm-host:latest

# Push previous version as latest
docker tag fabstir/llm-host:v0.9 fabstir/llm-host:latest
docker push fabstir/llm-host:latest

# Update documentation
git revert <migration-commit>
```

### Option 2: Hide Docker Hub Image

```bash
# Make repository private on Docker Hub (web UI)
# Notify users via GitHub release notes
# Continue using GHCR for beta testers
```

---

## Post-Launch Checklist

- [ ] Docker Hub repository created and public
- [ ] Image built and pushed successfully
- [ ] Test pull from fresh environment
- [ ] All documentation updated (links, commands)
- [ ] GitHub Actions workflows updated
- [ ] Beta testers notified via email
- [ ] Public announcement posted (GitHub, Twitter, Discord)
- [ ] GHCR image kept as mirror/backup
- [ ] Monitoring set up for pull statistics
- [ ] Support channels ready for new users

---

## Timeline Summary

| Week | Phase | Actions |
|------|-------|---------|
| 1-3 | Private Beta | GHCR-only, invited testers, collect feedback |
| 4 | Preparation | Final fixes, Docker Hub setup, docs update |
| 5 | Public Launch | Push to Docker Hub, announce, monitor |
| 6+ | Post-Launch | Support, iterate based on feedback, maintain both registries |

---

## Support

**For Beta Testers**:
- Email: beta@fabstir.com
- Discord: #beta-testing

**For Public Users**:
- Email: support@fabstir.com
- Discord: #support
- GitHub Issues: https://github.com/fabstir/fabstir-llm-sdk/issues

---

**Last Updated**: 2025-01-21
