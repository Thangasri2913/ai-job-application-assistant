import type {
  CreateResumeFromProfileRequest,
  CreateVersionRequest,
  ParseStatusResponse,
  ResumeContent,
  ResumeDetail,
  ResumeExtractedData,
  ResumeSort,
  ResumeSummary,
  ResumeVersionDetail,
  UpdateResumeRequest,
} from '@job-assist/shared';
import { downloadFile } from '../../../lib/api/download';
import { apiRequest } from '../../../lib/api/http';
import { uploadWithProgress } from '../../../lib/api/upload';

export type ResumeListFilter = 'ACTIVE' | 'ARCHIVED' | 'ALL';

export interface ResumeListQuery {
  status: ResumeListFilter;
  /** Case-insensitive search in name, description, category and tags. */
  q?: string;
  category?: string;
  sort?: ResumeSort;
}

function listParams({ status, q, category, sort }: ResumeListQuery): string {
  const params = new URLSearchParams({ status });
  if (q?.trim()) params.set('q', q.trim());
  if (category) params.set('category', category);
  if (sort && sort !== 'updated') params.set('sort', sort);
  return params.toString();
}

const base = (resumeId: string) => `/resumes/${resumeId}`;
const version = (resumeId: string, versionId: string) => `${base(resumeId)}/versions/${versionId}`;

export const resumesApi = {
  list: (query: ResumeListQuery = { status: 'ACTIVE' }) =>
    apiRequest<ResumeSummary[]>(`/resumes?${listParams(query)}`),
  get: (resumeId: string) => apiRequest<ResumeDetail>(base(resumeId)),

  upload: (
    file: File,
    fields: { name?: string; category?: string; tags?: string[] },
    onProgress?: (percent: number) => void,
  ) => {
    const form = new FormData();
    form.append('file', file);
    if (fields.name) form.append('name', fields.name);
    if (fields.category) form.append('category', fields.category);
    if (fields.tags?.length) form.append('tags', JSON.stringify(fields.tags));
    return uploadWithProgress<ResumeDetail>('/resumes', form, onProgress);
  },
  createFromProfile: (body: CreateResumeFromProfileRequest) =>
    apiRequest<ResumeDetail>('/resumes/from-profile', { method: 'POST', body }),

  update: (resumeId: string, body: UpdateResumeRequest) =>
    apiRequest<ResumeDetail>(base(resumeId), { method: 'PATCH', body }),
  remove: (resumeId: string) => apiRequest<void>(base(resumeId), { method: 'DELETE' }),
  archive: (resumeId: string) =>
    apiRequest<ResumeDetail>(`${base(resumeId)}/archive`, { method: 'POST' }),
  restore: (resumeId: string) =>
    apiRequest<ResumeDetail>(`${base(resumeId)}/restore`, { method: 'POST' }),
  duplicate: (resumeId: string, name?: string) =>
    apiRequest<ResumeDetail>(`${base(resumeId)}/duplicate`, {
      method: 'POST',
      body: name ? { name } : {},
    }),
  setDefault: (resumeId: string) =>
    apiRequest<ResumeDetail>(`${base(resumeId)}/default`, { method: 'POST' }),
  clearDefault: (resumeId: string) =>
    apiRequest<ResumeDetail>(`${base(resumeId)}/default`, { method: 'DELETE' }),

  createVersion: (resumeId: string, body: CreateVersionRequest) =>
    apiRequest<ResumeVersionDetail>(`${base(resumeId)}/versions`, { method: 'POST', body }),
  uploadVersion: (resumeId: string, file: File, onProgress?: (percent: number) => void) => {
    const form = new FormData();
    form.append('file', file);
    return uploadWithProgress<ResumeVersionDetail>(
      `${base(resumeId)}/versions/upload`,
      form,
      onProgress,
    );
  },
  getVersion: (resumeId: string, versionId: string) =>
    apiRequest<ResumeVersionDetail>(version(resumeId, versionId)),
  parseStatus: (resumeId: string, versionId: string) =>
    apiRequest<ParseStatusResponse>(`${version(resumeId, versionId)}/parse-status`),
  reparse: (resumeId: string, versionId: string) =>
    apiRequest<ParseStatusResponse>(`${version(resumeId, versionId)}/parse`, { method: 'POST' }),
  structuredData: (resumeId: string) =>
    apiRequest<ResumeExtractedData>(`${base(resumeId)}/structured-data`),
  extractedData: (resumeId: string, versionId: string) =>
    apiRequest<ResumeExtractedData>(`${version(resumeId, versionId)}/extracted-data`),
  saveContent: (resumeId: string, versionId: string, content: ResumeContent) =>
    apiRequest<ResumeExtractedData>(`${version(resumeId, versionId)}/extracted-data`, {
      method: 'PATCH',
      body: content,
    }),
  activate: (resumeId: string, versionId: string) =>
    apiRequest<ResumeVersionDetail>(`${version(resumeId, versionId)}/activate`, { method: 'POST' }),
  download: (resumeId: string, versionId: string, fallbackName: string) =>
    downloadFile(`${version(resumeId, versionId)}/file`, fallbackName),
};
