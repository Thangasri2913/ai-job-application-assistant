import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ParseStatus, ResumeContent } from '@job-assist/shared';
import { dashboardKeys, profileKeys } from '../../career-profile/hooks/useProfile';
import { type ResumeListQuery, resumesApi } from '../services/resumes-api';

export const resumeKeys = {
  all: ['resumes'] as const,
  list: (query: ResumeListQuery) =>
    [
      'resumes',
      'list',
      query.status,
      { q: query.q?.trim() ?? '', category: query.category ?? '', sort: query.sort ?? 'updated' },
    ] as const,
  detail: (id: string) => ['resumes', 'detail', id] as const,
  version: (id: string, versionId: string) =>
    ['resumes', 'detail', id, 'version', versionId] as const,
  extracted: (id: string, versionId: string) =>
    ['resumes', 'detail', id, 'version', versionId, 'extracted'] as const,
  parseStatus: (id: string, versionId: string) =>
    ['resumes', 'detail', id, 'version', versionId, 'parse-status'] as const,
};

export const isParsing = (status: ParseStatus | undefined) =>
  status === 'PENDING' || status === 'PROCESSING';

export function useResumeList(query: ResumeListQuery) {
  return useQuery({
    queryKey: resumeKeys.list(query),
    queryFn: () => resumesApi.list(query),
    // Keep showing the current results while a new search or sort loads.
    placeholderData: keepPreviousData,
  });
}

export function useResume(resumeId: string) {
  return useQuery({
    queryKey: resumeKeys.detail(resumeId),
    queryFn: () => resumesApi.get(resumeId),
    // Keep the detail fresh while a version is still being processed.
    refetchInterval: (query) =>
      query.state.data?.versions.some((v) => isParsing(v.parseStatus)) ? 1500 : false,
  });
}

export function useResumeVersion(resumeId: string, versionId: string) {
  return useQuery({
    enabled: Boolean(versionId),
    queryKey: resumeKeys.version(resumeId, versionId),
    queryFn: () => resumesApi.getVersion(resumeId, versionId),
  });
}

export function useExtractedData(resumeId: string, versionId: string) {
  return useQuery({
    enabled: Boolean(versionId),
    queryKey: resumeKeys.extracted(resumeId, versionId),
    queryFn: () => resumesApi.extractedData(resumeId, versionId),
    refetchInterval: (query) => (isParsing(query.state.data?.parseStatus) ? 1500 : false),
  });
}

/** Polls parse status until processing finishes. */
export function useParseStatus(resumeId: string | null, versionId: string | null) {
  return useQuery({
    queryKey: resumeKeys.parseStatus(resumeId ?? '', versionId ?? ''),
    queryFn: () => resumesApi.parseStatus(resumeId!, versionId!),
    enabled: Boolean(resumeId && versionId),
    refetchInterval: (query) =>
      !query.state.data || isParsing(query.state.data.parseStatus) ? 1000 : false,
  });
}

/** Resume changes affect lists, details, profile completion and the dashboard. */
export function useInvalidateResumes() {
  const client = useQueryClient();
  return () =>
    Promise.all([
      client.invalidateQueries({ queryKey: resumeKeys.all }),
      client.invalidateQueries({ queryKey: profileKeys.completion }),
      client.invalidateQueries({ queryKey: dashboardKeys.summary }),
    ]);
}

export function useResumeAction<TArgs, TResult>(fn: (args: TArgs) => Promise<TResult>) {
  const invalidate = useInvalidateResumes();
  return useMutation({ mutationFn: fn, onSuccess: () => invalidate() });
}

export function useSaveContent(resumeId: string, versionId: string) {
  return useResumeAction((content: ResumeContent) =>
    resumesApi.saveContent(resumeId, versionId, content),
  );
}
