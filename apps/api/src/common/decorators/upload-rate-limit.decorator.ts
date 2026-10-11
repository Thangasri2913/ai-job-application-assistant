import { SetMetadata } from '@nestjs/common';

export const UPLOAD_RATE_LIMIT_KEY = 'rateLimit:upload';

/**
 * Applies the stricter `upload` throttler (UPLOAD_RATE_LIMIT_MAX per window) in addition
 * to the default one. Use on endpoints that accept files.
 */
export const UploadRateLimit = () => SetMetadata(UPLOAD_RATE_LIMIT_KEY, true);
