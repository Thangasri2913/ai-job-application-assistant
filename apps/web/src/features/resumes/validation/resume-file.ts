import { RESUME_ACCEPTED_EXTENSIONS, RESUME_DEFAULT_MAX_UPLOAD_BYTES } from '@job-assist/shared';

/**
 * Quick client-side checks for immediate feedback. The server re-validates the file by
 * its actual content — this is a convenience, not a security control.
 */
export function checkResumeFile(
  file: File,
  maxBytes = RESUME_DEFAULT_MAX_UPLOAD_BYTES,
): string | null {
  const name = file.name.toLowerCase();
  if (!RESUME_ACCEPTED_EXTENSIONS.some((ext) => name.endsWith(ext)))
    return 'Upload a PDF or DOCX file.';
  if (file.size === 0) return 'This file is empty.';
  if (file.size > maxBytes)
    return `The file is larger than ${Math.round(maxBytes / 1024 / 1024)} MB.`;
  return null;
}

export const nameFromFilename = (filename: string) =>
  filename
    .replace(/\.[^.]+$/, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
