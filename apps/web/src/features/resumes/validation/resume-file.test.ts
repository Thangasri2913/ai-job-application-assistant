import { checkResumeFile, nameFromFilename } from './resume-file';

const file = (name: string, size: number) => new File([new Uint8Array(size)], name);

describe('checkResumeFile', () => {
  it('accepts PDF and DOCX within the size limit', () => {
    expect(checkResumeFile(file('cv.pdf', 100))).toBeNull();
    expect(checkResumeFile(file('CV.DOCX', 100))).toBeNull();
  });

  it.each([
    ['cv.doc', 100, 'Upload a PDF or DOCX file.'],
    ['cv.exe', 100, 'Upload a PDF or DOCX file.'],
    ['cv.pdf', 0, 'This file is empty.'],
    ['cv.pdf', 6 * 1024 * 1024, 'The file is larger than 5 MB.'],
  ])('rejects %s (%i bytes)', (name, size, message) => {
    expect(checkResumeFile(file(name, size))).toBe(message);
  });
});

describe('nameFromFilename', () => {
  it('derives a readable resume name', () => {
    expect(nameFromFilename('angular_developer-resume.pdf')).toBe('angular developer resume');
  });
});
