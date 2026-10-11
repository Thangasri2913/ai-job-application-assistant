import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { applicationKeys } from '../../applications/hooks/useApplications';
import { preparationApi } from '../services/preparation-api';

export const preparationKeys = {
  all: (id: string) => ['preparation', id] as const,
  detail: (id: string) => ['preparation', id, 'detail'] as const,
  suggestions: (id: string) => ['preparation', id, 'suggestions'] as const,
  tailored: (id: string) => ['preparation', id, 'tailored'] as const,
  coverLetter: (id: string) => ['preparation', id, 'cover-letter'] as const,
  questions: (id: string) => ['preparation', id, 'questions'] as const,
};

export function usePreparation(id: string) {
  return useQuery({
    queryKey: preparationKeys.detail(id),
    queryFn: () => preparationApi.start(id),
  });
}
export function useSuggestions(id: string) {
  return useQuery({
    queryKey: preparationKeys.suggestions(id),
    queryFn: () => preparationApi.suggestions(id),
  });
}
export function useTailoredDraft(id: string, enabled: boolean) {
  return useQuery({
    queryKey: preparationKeys.tailored(id),
    queryFn: () => preparationApi.tailored(id),
    enabled,
  });
}
export function useCoverLetter(id: string) {
  return useQuery({
    queryKey: preparationKeys.coverLetter(id),
    queryFn: () => preparationApi.coverLetter(id),
  });
}
export function useQuestions(id: string) {
  return useQuery({
    queryKey: preparationKeys.questions(id),
    queryFn: () => preparationApi.questions(id),
  });
}

/** Any preparation change can change its status, its documents (approved letters) and the application. */
export function usePreparationAction<TArgs, TResult>(
  id: string,
  fn: (args: TArgs) => Promise<TResult>,
) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSettled: () =>
      Promise.all([
        client.invalidateQueries({ queryKey: preparationKeys.all(id) }),
        client.invalidateQueries({ queryKey: applicationKeys.detail(id) }),
      ]),
  });
}
