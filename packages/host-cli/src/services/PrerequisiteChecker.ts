// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * PrerequisiteChecker
 * Checks system prerequisites for running a Fabstir host node
 */

import { execSync } from 'child_process';

export interface PrerequisiteResult {
  name: string;
  passed: boolean;
  message: string;
  details?: string;
}

export interface GPUInfo {
  name: string;
  memoryMB: number;
  memoryGB: number;
}

export interface PrerequisiteCheckResults {
  allPassed: boolean;
  results: PrerequisiteResult[];
  gpuInfo?: GPUInfo;
}

/**
 * Executes a command and returns the output or null on error
 */
function execCommand(command: string): string | null {
  try {
    return execSync(command, { encoding: 'utf-8', timeout: 10000 }).trim();
  } catch {
    return null;
  }
}

/**
 * Check if Docker is installed and get version
 */
export function checkDocker(): PrerequisiteResult {
  const output = execCommand('docker --version');

  if (!output) {
    return {
      name: 'Docker',
      passed: false,
      message: 'Docker not installed',
      details: 'Install Docker from https://docs.docker.com/get-docker/',
    };
  }

  // Parse version (e.g., "Docker version 24.0.7, build afdd53b")
  const versionMatch = output.match(/Docker version ([\d.]+)/);
  const version = versionMatch ? versionMatch[1] : 'unknown';

  return {
    name: 'Docker',
    passed: true,
    message: `Docker installed (v${version})`,
  };
}

/**
 * Check if Docker daemon is running
 */
export function checkDockerRunning(): PrerequisiteResult {
  const output = execCommand('docker info 2>/dev/null | head -1');

  if (!output) {
    return {
      name: 'Docker Daemon',
      passed: false,
      message: 'Docker daemon not running',
      details: 'Start Docker with: sudo systemctl start docker',
    };
  }

  return {
    name: 'Docker Daemon',
    passed: true,
    message: 'Docker daemon running',
  };
}

/**
 * Check if NVIDIA GPU is present and get info
 */
export function checkNvidiaGPU(): PrerequisiteResult & { gpuInfo?: GPUInfo } {
  const output = execCommand('nvidia-smi --query-gpu=name,memory.total --format=csv,noheader,nounits 2>/dev/null');

  if (!output) {
    return {
      name: 'NVIDIA GPU',
      passed: false,
      message: 'No NVIDIA GPU detected',
      details: 'nvidia-smi command failed. Ensure NVIDIA drivers are installed.',
    };
  }

  // Parse output (e.g., "NVIDIA GeForce RTX 3080, 10240")
  const parts = output.split(',').map(s => s.trim());
  const gpuName = parts[0] || 'Unknown GPU';
  const memoryMB = parseInt(parts[1] || '0', 10);
  const memoryGB = Math.round(memoryMB / 1024 * 10) / 10;

  return {
    name: 'NVIDIA GPU',
    passed: true,
    message: `${gpuName} (${memoryGB} GB VRAM)`,
    gpuInfo: {
      name: gpuName,
      memoryMB,
      memoryGB,
    },
  };
}

/**
 * Check if NVIDIA Container Toolkit is installed
 */
export function checkNvidiaContainerToolkit(): PrerequisiteResult {
  // Check for nvidia-container-toolkit or nvidia-docker2
  const toolkitOutput = execCommand('dpkg -l | grep -E "nvidia-container-toolkit|nvidia-docker2" 2>/dev/null');
  const runtimeOutput = execCommand('docker info 2>/dev/null | grep -i nvidia');

  if (!toolkitOutput && !runtimeOutput) {
    return {
      name: 'NVIDIA Container Toolkit',
      passed: false,
      message: 'NVIDIA Container Toolkit not installed',
      details: 'Install from https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/install-guide.html',
    };
  }

  return {
    name: 'NVIDIA Container Toolkit',
    passed: true,
    message: 'NVIDIA Container Toolkit installed',
  };
}

/**
 * Check if Docker can access GPU
 */
export function checkDockerGPUAccess(): PrerequisiteResult {
  // Quick test to see if --gpus flag works
  const output = execCommand('docker run --rm --gpus all nvidia/cuda:12.0.0-base-ubuntu22.04 nvidia-smi -L 2>/dev/null | head -1');

  if (!output) {
    // Try alternative check without running a container
    const runtimeCheck = execCommand('docker info 2>/dev/null | grep -i "runtimes.*nvidia"');

    if (runtimeCheck) {
      return {
        name: 'Docker GPU Access',
        passed: true,
        message: 'NVIDIA runtime configured in Docker',
        details: 'GPU access available via --gpus flag',
      };
    }

    return {
      name: 'Docker GPU Access',
      passed: false,
      message: 'Docker cannot access GPU',
      details: 'Ensure NVIDIA Container Toolkit is properly configured',
    };
  }

  return {
    name: 'Docker GPU Access',
    passed: true,
    message: 'Docker can access GPU',
  };
}

/**
 * Check available disk space
 */
export function checkDiskSpace(requiredGB: number = 20): PrerequisiteResult {
  const output = execCommand("df -BG ~ 2>/dev/null | tail -1 | awk '{print $4}'");

  if (!output) {
    return {
      name: 'Disk Space',
      passed: true, // Don't fail on check error
      message: 'Unable to check disk space',
    };
  }

  // Parse output (e.g., "150G")
  const availableGB = parseInt(output.replace('G', ''), 10);

  if (availableGB < requiredGB) {
    return {
      name: 'Disk Space',
      passed: false,
      message: `Only ${availableGB} GB available (need ${requiredGB} GB)`,
      details: 'Free up disk space for model downloads',
    };
  }

  return {
    name: 'Disk Space',
    passed: true,
    message: `${availableGB} GB available`,
  };
}

/**
 * Run all prerequisite checks
 */
export async function checkAllPrerequisites(): Promise<PrerequisiteCheckResults> {
  const results: PrerequisiteResult[] = [];
  let gpuInfo: GPUInfo | undefined;

  // Check Docker
  results.push(checkDocker());
  results.push(checkDockerRunning());

  // Check GPU
  const gpuResult = checkNvidiaGPU();
  results.push({
    name: gpuResult.name,
    passed: gpuResult.passed,
    message: gpuResult.message,
    details: gpuResult.details,
  });
  gpuInfo = gpuResult.gpuInfo;

  // Only check container toolkit and GPU access if GPU is present
  if (gpuResult.passed) {
    results.push(checkNvidiaContainerToolkit());
    results.push(checkDockerGPUAccess());
  }

  // Check disk space
  results.push(checkDiskSpace(20));

  const allPassed = results.every(r => r.passed);

  return {
    allPassed,
    results,
    gpuInfo,
  };
}

/**
 * Get recommended models based on available VRAM
 */
export function getRecommendedModels(vramGB: number): string[] {
  // Basic recommendations based on VRAM
  // These are approximate - actual requirements vary by quantization
  if (vramGB >= 24) {
    return ['openai_gpt-oss-20b', 'TinyVicuna-1B-32k', 'TinyLlama-1.1B-Chat'];
  } else if (vramGB >= 12) {
    return ['TinyVicuna-1B-32k', 'TinyLlama-1.1B-Chat', 'TinyVicuna-1B'];
  } else if (vramGB >= 6) {
    return ['TinyVicuna-1B-32k', 'TinyLlama-1.1B-Chat', 'TinyVicuna-1B'];
  } else {
    return ['TinyVicuna-1B', 'TinyLlama-1.1B-Chat'];
  }
}
