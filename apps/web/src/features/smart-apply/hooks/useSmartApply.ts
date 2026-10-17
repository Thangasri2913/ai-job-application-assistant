import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { SmartApplicationDetail } from '@job-assist/shared';
import { applicationKeys } from '../../applications/hooks/useApplications';
import { type SmartApplicationQuery, smartApplyApi } from '../services/smart-apply-api';

export const smartApplyKeys = {
  all: ['smart-apply'] as const,
  list: (q: SmartApplicationQuery) => ['smart-apply', 'list', q] as const,
  detail: (id: string) => ['smart-apply', 'detail', id] as const,
  materials: (id: string) => ['smart-apply', 'detail', id, 'materials'] as const,
  inbox: ['smart-apply', 'inbox'] as const,
  settings: ['smart-apply', 'settings'] as const,
  savedAnswers: ['smart-apply', 'saved-answers'] as const,
};

const POLL_MS = 1500;
/** Background work in progress: poll until it settles. */
const busy = (d: Pick<SmartApplicationDetail, 'state' | 'uncertain'> | undefined) =>
  d !== undefined &&
  (d.state === 'PREPARING' ||
    d.state === 'DISCOVERED' ||
    (d.state === 'SUBMITTING' && !d.uncertain));

export function useSmartApplications(q: SmartApplicationQuery) {
  return useQuery({
    queryKey: smartApplyKeys.list(q),
    queryFn: () => smartApplyApi.list(q),
    placeholderData: keepPreviousData,
    refetchInterval: (query) => (query.state.data?.items.some(busy) ? POLL_MS : false),
  });
}

export function useSmartApplication(id: string) {
  return useQuery({
    queryKey: smartApplyKeys.detail(id),
    queryFn: () => smartApplyApi.get(id),
    refetchInterval: (query) => (busy(query.state.data) ? POLL_MS : false),
  });
}

export function useSmartApplicationMaterials(id: string, enabled: boolean) {
  return useQuery({
    queryKey: smartApplyKeys.materials(id),
    queryFn: () => smartApplyApi.materials(id),
    enabled,
  });
}

export function useQuestionInbox() {
  return useQuery({ queryKey: smartApplyKeys.inbox, queryFn: smartApplyApi.inbox });
}

export function useSmartApplySettings() {
  return useQuery({ queryKey: smartApplyKeys.settings, queryFn: smartApplyApi.settings });
}

export function useSavedAnswers() {
  return useQuery({ queryKey: smartApplyKeys.savedAnswers, queryFn: smartApplyApi.savedAnswers });
}

/** A Smart Apply mutation that refreshes everything Smart Apply (and the tracker) shows. */
export function useSmartApplyAction<TVars, TResult>(fn: (vars: TVars) => Promise<TResult>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: smartApplyKeys.all }),
        qc.invalidateQueries({ queryKey: applicationKeys.all }),
      ]);
    },
  });
}
