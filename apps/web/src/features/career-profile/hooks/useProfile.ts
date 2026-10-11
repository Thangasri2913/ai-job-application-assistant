import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CareerProfile,
  OrderableProfileSection,
  UpdateProfileRequest,
} from '@job-assist/shared';
import { type ProfileSection, profileApi, type SectionTypes } from '../services/profile-api';

export const profileKeys = {
  all: ['profile'] as const,
  detail: ['profile', 'detail'] as const,
  completion: ['profile', 'completion'] as const,
};

export const dashboardKeys = { summary: ['dashboard', 'summary'] as const };

export function useProfile() {
  return useQuery({ queryKey: profileKeys.detail, queryFn: profileApi.get });
}

export function useProfileCompletion() {
  return useQuery({ queryKey: profileKeys.completion, queryFn: profileApi.completion });
}

/** Any profile change can affect completion and the dashboard; refresh all three. */
function useInvalidateProfile() {
  const client = useQueryClient();
  return () =>
    Promise.all([
      client.invalidateQueries({ queryKey: profileKeys.all }),
      client.invalidateQueries({ queryKey: dashboardKeys.summary }),
    ]);
}

export function useUpdateProfile() {
  const invalidate = useInvalidateProfile();
  return useMutation({
    mutationFn: (body: UpdateProfileRequest) => profileApi.update(body),
    onSuccess: invalidate,
  });
}

export function useSaveSectionItem<S extends ProfileSection>(section: S) {
  const invalidate = useInvalidateProfile();
  return useMutation({
    mutationFn: ({ id, input }: { id?: string; input: SectionTypes[S]['input'] }) =>
      id ? profileApi.updateItem(section, id, input) : profileApi.createItem(section, input),
    onSuccess: invalidate,
  });
}

export function useDeleteSectionItem(section: ProfileSection) {
  const invalidate = useInvalidateProfile();
  return useMutation({
    mutationFn: (id: string) => profileApi.deleteItem(section, id),
    onSuccess: invalidate,
  });
}

export function useImportToProfile() {
  const invalidate = useInvalidateProfile();
  return useMutation({ mutationFn: profileApi.import, onSuccess: invalidate });
}

const PROFILE_FIELD: Record<
  OrderableProfileSection,
  keyof Omit<CareerProfile, 'details' | 'skills'>
> = {
  experiences: 'experiences',
  education: 'educations',
  projects: 'projects',
  certifications: 'certifications',
  languages: 'languages',
  achievements: 'achievements',
};

/** Persists a new order. The cached profile is reordered immediately and rolled back on error. */
export function useReorderSection(section: OrderableProfileSection) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (ids: string[]) => profileApi.reorder(section, ids),
    onMutate: async (ids) => {
      await client.cancelQueries({ queryKey: profileKeys.detail });
      const previous = client.getQueryData<CareerProfile>(profileKeys.detail);
      if (previous) {
        const field = PROFILE_FIELD[section];
        const byId = new Map<string, { id: string }>(
          previous[field].map((item) => [item.id, item]),
        );
        const reordered = ids.map((id) => byId.get(id)).filter((item) => item !== undefined);
        client.setQueryData<CareerProfile>(profileKeys.detail, { ...previous, [field]: reordered });
      }
      return { previous };
    },
    onError: (_error, _ids, context) => {
      if (context?.previous) client.setQueryData(profileKeys.detail, context.previous);
    },
    onSettled: () => client.invalidateQueries({ queryKey: profileKeys.detail }),
  });
}
