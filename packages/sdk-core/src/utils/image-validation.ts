// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

import { SDKError, ImageAttachment } from '../types';

const VALID_FORMATS = new Set(['png', 'jpeg', 'webp', 'gif']);
const MAX_BASE64_SIZE = 13_333_334; // ~10MB in base64 (10 * 1024 * 1024 * 4/3)

export function validateImageAttachments(images: ImageAttachment[]): void {
  if (!Array.isArray(images) || images.length === 0) {
    throw new SDKError(
      'Images array must contain at least one image attachment',
      'INVALID_IMAGE_DATA',
    );
  }

  for (const image of images) {
    if (typeof image.data !== 'string' || image.data.length === 0) {
      throw new SDKError(
        'Image data must be a non-empty base64 string',
        'INVALID_IMAGE_DATA',
      );
    }

    if (image.data.startsWith('data:')) {
      throw new SDKError(
        'Image data must be raw base64 without data:uri prefix. Remove the "data:image/...;base64," prefix.',
        'INVALID_IMAGE_DATA',
      );
    }

    if (!VALID_FORMATS.has(image.format)) {
      throw new SDKError(
        `Unsupported image format "${image.format}". Supported: png, jpeg, webp, gif`,
        'INVALID_IMAGE_FORMAT',
      );
    }

    if (image.data.length > MAX_BASE64_SIZE) {
      throw new SDKError(
        `Image exceeds 10MB limit (${Math.round(image.data.length * 3 / 4 / 1024 / 1024)}MB)`,
        'IMAGE_TOO_LARGE',
      );
    }
  }
}
