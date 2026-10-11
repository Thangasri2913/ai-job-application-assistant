import { Injectable } from '@nestjs/common';
import mammoth from 'mammoth';
import { extractText, getDocumentProxy } from 'unpdf';
import type { ResumeFileKind } from './resume-file-validator.js';

/** Raised with a message that is safe to show the user. */
export class TextExtractionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TextExtractionError';
  }
}

const MAX_TEXT_LENGTH = 100_000;

/** Normalises extracted text: unified newlines, no trailing spaces, at most one blank line. */
export function normalizeExtractedText(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, MAX_TEXT_LENGTH);
}

@Injectable()
export class TextExtractor {
  async extract(buffer: Buffer, kind: ResumeFileKind): Promise<string> {
    let raw: string;
    try {
      raw = kind === 'pdf' ? await this.fromPdf(buffer) : await this.fromDocx(buffer);
    } catch (error) {
      if (error instanceof TextExtractionError) throw error;
      const message = error instanceof Error ? error.message : '';
      if (/password|encrypt/i.test(message)) {
        throw new TextExtractionError(
          'This file is password-protected. Upload an unprotected copy.',
        );
      }
      throw new TextExtractionError(
        'We couldn’t read this file. It may be damaged — try exporting it again.',
      );
    }

    const text = normalizeExtractedText(raw);
    if (text.replace(/\s/g, '').length < 20) {
      throw new TextExtractionError(
        'No readable text was found. Scanned/image-only PDFs aren’t supported yet — upload a text-based PDF or DOCX.',
      );
    }
    return text;
  }

  private async fromPdf(buffer: Buffer): Promise<string> {
    const pdf = await getDocumentProxy(new Uint8Array(buffer));
    const { text } = await extractText(pdf, { mergePages: false });
    return (Array.isArray(text) ? text : [text]).join('\n\n');
  }

  private async fromDocx(buffer: Buffer): Promise<string> {
    const { value } = await mammoth.extractRawText({ buffer });
    return value;
  }
}
