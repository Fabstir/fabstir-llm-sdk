# Model Download and Verification Guide

Complete guide to downloading, verifying, and managing AI models for Fabstir host nodes.

## Table of Contents
- [Approved Models](#approved-models)
- [Model String Format](#model-string-format)
- [Downloading Models](#downloading-models)
- [Verifying Models](#verifying-models)
- [Hardware Requirements](#hardware-requirements)
- [Directory Structure](#directory-structure)
- [Troubleshooting](#troubleshooting)

## Approved Models

Only models approved by the Fabstir ModelRegistry contract can be used. Using unapproved models will cause registration to fail.

### Currently Approved Models

#### 1. TinyLlama-1.1B (Recommended for Testing)

**Model String**:
```
TheBloke/TinyLlama-1.1B-Chat-v1.0-GGUF:tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf
```

**Model ID**: `0x14843424179fbcb9aeb7fd446fa97143300609757bd49ffb3ec7fb2f75aed1ca`

**Specifications**:
- Size: ~700MB
- Parameters: 1.1B
- Quantization: Q4_K_M (4-bit)
- Context: 2048 tokens
- License: Apache 2.0

**Download**:
```bash
cd ~/fabstir-models
wget https://huggingface.co/TheBloke/TinyLlama-1.1B-Chat-v1.0-GGUF/resolve/main/tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf
```

**Hardware Requirements**:
- RAM: 2GB minimum
- GPU: Optional (CPU is sufficient)
- Disk: 1GB free space

---

#### 2. TinyVicuna-1B (Alternative)

**Model String**:
```
CohereForAI/TinyVicuna-1B-32k-GGUF:tiny-vicuna-1b.q4_k_m.gguf
```

**Model ID**: `0x0b75a2061e70e736924a30c0a327db7ab719402129f76f631adbd7b7a5a5bced`

**Specifications**:
- Size: ~600MB
- Parameters: 1.1B
- Quantization: Q4_K_M (4-bit)
- Context: 32,768 tokens (32k!)
- License: Apache 2.0

**Download**:
```bash
cd ~/fabstir-models
wget https://huggingface.co/CohereForAI/TinyVicuna-1B-32k-GGUF/resolve/main/tiny-vicuna-1b.q4_k_m.gguf
```

**Hardware Requirements**:
- RAM: 2GB minimum
- GPU: Optional (CPU is sufficient)
- Disk: 1GB free space

---

### Future Models (Coming Soon)

Larger models will be added to the ModelRegistry after governance approval:
- Llama 2 7B (~4GB)
- Mistral 7B (~4GB)
- Mixtral 8x7B (~26GB)

Check the latest approved models:
```bash
# Query ModelRegistry contract
docker exec fabstir-host fabstir-host list-models
```

## Model String Format

### Format Structure

```
{repository}:{filename}
```

**Example breakdown**:
```
TheBloke/TinyLlama-1.1B-Chat-v1.0-GGUF:tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf
└─────────────┬──────────────────────┘ └──────────────┬───────────────────────┘
         Repository                              Filename
     (Hugging Face)                           (GGUF file)
```

### Components

1. **Repository**: Hugging Face repository path
   - Format: `{username}/{repo-name}`
   - Example: `TheBloke/TinyLlama-1.1B-Chat-v1.0-GGUF`

2. **Filename**: Exact GGUF file name
   - Must match Hugging Face file exactly
   - Example: `tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf`

3. **Separator**: Colon (`:`)
   - Required between repository and filename

### Model ID Generation

The model string is hashed to create a unique Model ID:
```
keccak256(modelString) = Model ID
```

This Model ID is stored in the blockchain's ModelRegistry contract.

## Downloading Models

### Method 1: Direct Download (Recommended)

```bash
# Create models directory
mkdir -p ~/fabstir-models
cd ~/fabstir-models

# Download TinyLlama
wget https://huggingface.co/TheBloke/TinyLlama-1.1B-Chat-v1.0-GGUF/resolve/main/tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf

# Verify download completed
ls -lh tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf
# Expected: ~700MB file
```

### Method 2: Using curl

```bash
curl -L -o tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf \
  https://huggingface.co/TheBloke/TinyLlama-1.1B-Chat-v1.0-GGUF/resolve/main/tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf
```

### Method 3: Using Hugging Face CLI

```bash
# Install Hugging Face CLI
pip install huggingface-hub

# Download model
huggingface-cli download \
  TheBloke/TinyLlama-1.1B-Chat-v1.0-GGUF \
  tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf \
  --local-dir ~/fabstir-models
```

### Method 4: Using git-lfs

```bash
# Install git-lfs
sudo apt-get install git-lfs  # Linux
brew install git-lfs          # macOS

# Initialize git-lfs
git lfs install

# Clone repository (only downloads specific file)
GIT_LFS_SKIP_SMUDGE=1 git clone https://huggingface.co/TheBloke/TinyLlama-1.1B-Chat-v1.0-GGUF
cd TinyLlama-1.1B-Chat-v1.0-GGUF
git lfs pull --include "tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf"
```

## Verifying Models

### File Integrity Check

```bash
# Calculate SHA256 hash
sha256sum tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf

# Compare with Hugging Face (check model card for hash)
```

### Model String Verification

Verify your model string matches the approved format:

```bash
# TinyLlama example
MODEL_STRING="TheBloke/TinyLlama-1.1B-Chat-v1.0-GGUF:tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf"

# Split into repository and filename
REPO="TheBloke/TinyLlama-1.1B-Chat-v1.0-GGUF"
FILE="tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf"

# Verify format
echo $MODEL_STRING | grep -E '^[^:]+:[^:]+$'
# Should match (no output = error)
```

### Blockchain Verification (Advanced)

Check if your model is approved on-chain:

```bash
# Inside Docker container
docker exec -it fabstir-host bash

# List approved models
fabstir-host list-models

# Expected output:
# ✅ Approved Models:
# 1. TinyLlama-1.1B-Chat-v1.0
#    ID: 0x14843424179fbcb9aeb7fd446fa97143300609757bd49ffb3ec7fb2f75aed1ca
#    String: TheBloke/TinyLlama-1.1B-Chat-v1.0-GGUF:tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf
#
# 2. TinyVicuna-1B-32k
#    ID: 0x0b75a2061e70e736924a30c0a327db7ab719402129f76f631adbd7b7a5a5bced
#    String: CohereForAI/TinyVicuna-1B-32k-GGUF:tiny-vicuna-1b.q4_k_m.gguf
```

## Hardware Requirements

### By Model Size

| Model | Size | RAM (Min) | RAM (Recommended) | GPU | Disk Space |
|-------|------|-----------|-------------------|-----|------------|
| TinyLlama 1.1B (Q4) | 700MB | 2GB | 4GB | Optional | 1GB |
| TinyVicuna 1.1B (Q4) | 600MB | 2GB | 4GB | Optional | 1GB |
| Llama 2 7B (Q4)* | 4GB | 6GB | 8GB | Recommended | 5GB |
| Mistral 7B (Q4)* | 4GB | 6GB | 8GB | Recommended | 5GB |
| Mixtral 8x7B (Q4)* | 26GB | 32GB | 64GB | Required | 30GB |

\* Future models, not yet approved

### CPU vs GPU

**CPU-only** (Good for small models):
- TinyLlama: ~5-10 tokens/second
- TinyVicuna: ~5-10 tokens/second
- Inference time: 10-30 seconds for short responses

**GPU (CUDA)** (Recommended for production):
- TinyLlama: ~50-100 tokens/second
- TinyVicuna: ~50-100 tokens/second
- Inference time: 1-3 seconds for short responses

### Disk I/O

Models are loaded into RAM on startup. SSD is recommended for:
- Faster model loading
- Reduced startup time
- Better performance with large context

## Directory Structure

### Recommended Layout

```
~/fabstir-models/
├── tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf    # 700MB
├── tiny-vicuna-1b.q4_k_m.gguf              # 600MB
└── model_registry.json                      # Model metadata (optional)
```

### Docker Volume Mount

The directory is mounted read-only into the Docker container:

```bash
-v ~/fabstir-models:/models
```

Inside container:
```
/models/
├── tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf
└── tiny-vicuna-1b.q4_k_m.gguf
```

### Environment Variable

Point to the specific model file:

```bash
-e MODEL_PATH=/models/tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf
```

## Troubleshooting

### Model Not Found

**Error**: `Model file not found: /models/tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf`

**Solutions**:
1. Check file exists on host:
   ```bash
   ls -lh ~/fabstir-models/tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf
   ```

2. Verify Docker volume mount:
   ```bash
   docker inspect fabstir-host | grep -A 5 Mounts
   # Should show: ~/fabstir-models -> /models
   ```

3. Check file permissions:
   ```bash
   chmod 644 ~/fabstir-models/*.gguf
   ```

### Download Interrupted

**Error**: Partial file downloaded

**Solutions**:
```bash
# Resume with wget
wget -c https://huggingface.co/.../tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf

# Or delete and restart
rm tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf
wget https://huggingface.co/.../tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf
```

### Incorrect Model String

**Error**: `Model not approved in ModelRegistry`

**Cause**: Model string doesn't match approved format

**Solution**:
```bash
# Use exact string from this guide
TheBloke/TinyLlama-1.1B-Chat-v1.0-GGUF:tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf

# Common mistakes:
# ❌ tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf (missing repository)
# ❌ TheBloke/TinyLlama-1.1B-Chat-v1.0-GGUF (missing filename)
# ❌ TheBloke/TinyLlama-1.1B-Chat-v1.0-GGUF/tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf (wrong separator)
```

### Model Loading Slow

**Issue**: Model takes >2 minutes to load

**Solutions**:
1. Use SSD instead of HDD
2. Increase available RAM
3. Close other applications
4. Check disk I/O:
   ```bash
   iostat -x 1
   # Look for high %util
   ```

### Out of Memory

**Error**: `Failed to load model: out of memory`

**Solutions**:
1. Use smaller model (TinyLlama instead of Llama 2)
2. Increase Docker memory limit:
   ```bash
   docker run -m 8g ...  # Allow 8GB RAM
   ```
3. Close other applications
4. Use swap space (slower but works)

## Additional Resources

- **Hugging Face Model Hub**: https://huggingface.co/models?other=GGUF
- **GGUF Format**: https://github.com/ggerganov/ggml/blob/master/docs/gguf.md
- **Quantization Guide**: https://github.com/ggerganov/llama.cpp/blob/master/examples/quantize/README.md
- **Model Registry Contract**: See `docs/compute-contracts-reference/ModelRegistry.md`

## Getting Help

If you encounter issues:
1. Check [TROUBLESHOOTING.md](./TROUBLESHOOTING.md)
2. Verify model string matches approved format
3. Check Hugging Face model card for download issues
4. Join Fabstir community for support
