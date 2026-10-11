/** Builds a minimal valid text PDF (one line per entry) for upload tests. */
export function buildResumePdf(lines: string[]): Buffer {
  const escape = (s: string) =>
    s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
  const content = [
    'BT',
    '/F1 10 Tf',
    '13 TL',
    '50 800 Td',
    ...lines.map((l) => `(${escape(l)}) Tj T*`),
    'ET',
  ].join('\n');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((body, i) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf, 'latin1');
}

export const RESUME_LINES = [
  'Thanga Sri',
  'thanga.sri@example.com | +91 98765 43210 | Chennai, India',
  'github.com/thangasri',
  '',
  'SUMMARY',
  'Frontend developer with 3.3 years of experience building Angular applications.',
  '',
  'SKILLS',
  'Frontend: Angular, TypeScript, RxJS',
  '',
  'EXPERIENCE',
  'Frontend Developer | Acme Technologies | Chennai, India',
  'Jul 2023 - Present',
  '- Built reusable Angular components',
  '',
  'EDUCATION',
  'B.Tech in Computer Science',
  'Anna University',
  '2018 - 2022',
];
