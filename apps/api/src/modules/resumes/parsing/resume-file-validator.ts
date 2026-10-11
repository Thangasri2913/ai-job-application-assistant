import { HttpStatus } from '@nestjs/common';
import { fileTypeFromBuffer } from 'file-type';
import { AppException } from '../../../common/errors/app.exception.js';
import { ErrorCode } from '../../../common/errors/error-codes.js';

export type ResumeFileKind = 'pdf' | 'docx';

export interface ValidatedResumeFile {
  kind: ResumeFileKind;
  mimeType: string;
  safeFilename: string;
}

const MIME_BY_KIND: Record<ResumeFileKind, string> = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};

const unsupported = (message = 'Upload a PDF or DOCX file.') =>
  new AppException(HttpStatus.UNSUPPORTED_MEDIA_TYPE, ErrorCode.UNSUPPORTED_FILE_TYPE, message);

/**
 * Makes a client-supplied filename safe to store and to echo back in a
 * Content-Disposition header: no path components, control characters or quotes.
 */
export function sanitizeFilename(original: string, extension: string): string {
  const base = original.split(/[\\/]/).pop() ?? '';
  const withoutExt = base.replace(/\.[^.]*$/, '');
  const cleaned = withoutExt
    .normalize('NFKC')
    .replace(/[^\p{L}\p{N} ._()-]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 100);
  return `${cleaned || 'resume'}.${extension}`;
}

/**
 * Validates an uploaded resume by its actual bytes (magic number), not by the
 * client-supplied filename or MIME type. The extension must agree with the content.
 */
export async function validateResumeFile(
  buffer: Buffer,
  originalName: string,
  maxBytes: number,
): Promise<ValidatedResumeFile> {
  if (buffer.length === 0) {
    throw new AppException(
      HttpStatus.BAD_REQUEST,
      ErrorCode.FILE_REQUIRED,
      'The uploaded file is empty.',
    );
  }
  if (buffer.length > maxBytes) {
    throw new AppException(
      HttpStatus.PAYLOAD_TOO_LARGE,
      ErrorCode.FILE_TOO_LARGE,
      `The file is larger than ${Math.round(maxBytes / 1024 / 1024)} MB.`,
    );
  }

  const extension = originalName.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1];
  if (extension !== 'pdf' && extension !== 'docx') throw unsupported();

  const detected = await fileTypeFromBuffer(buffer);
  if (!detected || detected.ext !== extension || detected.mime !== MIME_BY_KIND[extension]) {
    throw unsupported('The file content does not match a PDF or DOCX document.');
  }

  return {
    kind: extension,
    mimeType: MIME_BY_KIND[extension],
    safeFilename: sanitizeFilename(originalName, extension),
  };
}
