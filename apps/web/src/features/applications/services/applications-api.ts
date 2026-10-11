import type {
  ApplicationDetail,
  ApplicationDocument,
  ApplicationDocumentType,
  ApplicationNote,
  ApplicationSort,
  ApplicationStatus,
  ApplicationSummary,
  ApplicationTimelineEvent,
  ChangeApplicationStatusRequest,
  CreateApplicationRequest,
  UpdateApplicationRequest,
} from '@job-assist/shared';
import { downloadFile } from '../../../lib/api/download';
import { apiRequest } from '../../../lib/api/http';
import { uploadWithProgress } from '../../../lib/api/upload';

export type ApplicationArchiveFilter = 'ACTIVE' | 'ARCHIVED' | 'ALL';

export interface ApplicationListQuery {
  archived: ApplicationArchiveFilter;
  status?: ApplicationStatus | '';
  q?: string;
  appliedFrom?: string;
  appliedTo?: string;
  sort?: ApplicationSort;
}

function listParams(query: ApplicationListQuery): string {
  const params = new URLSearchParams({ archived: query.archived });
  if (query.status) params.set('status', query.status);
  if (query.q?.trim()) params.set('q', query.q.trim());
  if (query.appliedFrom) params.set('appliedFrom', query.appliedFrom);
  if (query.appliedTo) params.set('appliedTo', query.appliedTo);
  if (query.sort && query.sort !== 'updated') params.set('sort', query.sort);
  return params.toString();
}

const base = (id: string) => `/applications/${id}`;

export const applicationsApi = {
  list: (query: ApplicationListQuery = { archived: 'ACTIVE' }) =>
    apiRequest<ApplicationSummary[]>(`/applications?${listParams(query)}`),
  get: (id: string) => apiRequest<ApplicationDetail>(base(id)),
  create: (body: CreateApplicationRequest) =>
    apiRequest<ApplicationDetail>('/applications', { method: 'POST', body }),
  update: (id: string, body: UpdateApplicationRequest) =>
    apiRequest<ApplicationDetail>(base(id), { method: 'PATCH', body }),
  changeStatus: (id: string, body: ChangeApplicationStatusRequest) =>
    apiRequest<ApplicationDetail>(`${base(id)}/status`, { method: 'POST', body }),
  archive: (id: string) => apiRequest<ApplicationDetail>(`${base(id)}/archive`, { method: 'POST' }),
  restore: (id: string) => apiRequest<ApplicationDetail>(`${base(id)}/restore`, { method: 'POST' }),
  remove: (id: string) => apiRequest<void>(base(id), { method: 'DELETE' }),
  timeline: (id: string) => apiRequest<ApplicationTimelineEvent[]>(`${base(id)}/timeline`),
  notes: (id: string) => apiRequest<ApplicationNote[]>(`${base(id)}/notes`),
  addNote: (id: string, body: string) =>
    apiRequest<ApplicationNote>(`${base(id)}/notes`, { method: 'POST', body: { body } }),
  editNote: (id: string, noteId: string, body: string) =>
    apiRequest<ApplicationNote>(`${base(id)}/notes/${noteId}`, { method: 'PATCH', body: { body } }),
  deleteNote: (id: string, noteId: string) =>
    apiRequest<void>(`${base(id)}/notes/${noteId}`, { method: 'DELETE' }),
  documents: (id: string) => apiRequest<ApplicationDocument[]>(`${base(id)}/documents`),
  uploadDocument: (
    id: string,
    file: File,
    fields: { type: ApplicationDocumentType; name?: string },
    onProgress?: (percent: number) => void,
  ) => {
    const form = new FormData();
    form.append('type', fields.type);
    if (fields.name?.trim()) form.append('name', fields.name.trim());
    form.append('file', file);
    return uploadWithProgress<ApplicationDocument>(`${base(id)}/documents`, form, onProgress);
  },
  downloadDocument: (id: string, documentId: string, fallbackName: string) =>
    downloadFile(`${base(id)}/documents/${documentId}/file`, fallbackName),
  deleteDocument: (id: string, documentId: string) =>
    apiRequest<void>(`${base(id)}/documents/${documentId}`, { method: 'DELETE' }),
};
