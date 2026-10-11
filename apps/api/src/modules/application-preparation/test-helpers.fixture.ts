import mammoth from 'mammoth';

export async function mammothText(buffer: Buffer): Promise<string> {
  return (await mammoth.extractRawText({ buffer })).value;
}
