import {
  type EmploymentType,
  JOB_ALERT_MAX_KEYWORDS,
  JOB_ALERT_MAX_LOCATIONS,
  type JobSearchStrategy,
  type ProfileDetails,
  type RemotePreference,
  type SeniorityLevel,
  type WorkMode,
} from '@job-assist/shared';

/** The alert fields a strategy starts from. */
export interface AlertTerms {
  keywords: string[];
  locations: string[];
  remotePreference: RemotePreference;
  employmentTypes: EmploymentType[];
  experienceLevel: SeniorityLevel | null;
}

/** The Career Profile fields a strategy may use (stored by the user; nothing is guessed). */
export type ProfileTerms = Pick<
  ProfileDetails,
  | 'preferredRoles'
  | 'currentJobTitle'
  | 'preferredLocations'
  | 'location'
  | 'workModes'
  | 'employmentTypes'
>;

const MAX_TERM = 60;
const key = (s: string) => s.replace(/\s+/g, ' ').trim().toLowerCase();

function unique(values: (string | null | undefined)[], max: number): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const v of values) {
    const clean = v?.replace(/\s+/g, ' ').trim().slice(0, MAX_TERM);
    if (!clean || seen.has(key(clean))) continue;
    seen.add(key(clean));
    out.push(clean);
    if (out.length >= max) break;
  }
  return out;
}

/** The arrangement the profile's preferred work modes allow; ANY when unstated or mixed. */
export function remoteFromWorkModes(modes: WorkMode[]): RemotePreference {
  const set = new Set(modes);
  if (set.size === 0 || set.size === 3) return 'ANY';
  if (set.size === 1 && set.has('REMOTE')) return 'REMOTE';
  if (!set.has('ONSITE')) return 'HYBRID';
  if (!set.has('REMOTE')) return 'ONSITE';
  return 'ANY';
}

/**
 * The search terms a run uses: the alert's own criteria always win; the stored Career
 * Profile only adds alternate titles (preferred roles, current title) and fills criteria the
 * alert leaves open. No profile data other than these terms is sent to job sources, and an
 * experience level is never derived from years of experience (a guess would exclude jobs).
 */
export function buildSearchStrategy(
  alert: AlertTerms,
  profile: ProfileTerms | null,
): JobSearchStrategy {
  const alertKeywords = unique(alert.keywords, JOB_ALERT_MAX_KEYWORDS);
  const keywords = unique(
    [...alertKeywords, ...(profile?.preferredRoles ?? []), profile?.currentJobTitle],
    JOB_ALERT_MAX_KEYWORDS,
  );
  const alternateTitles = keywords.slice(alertKeywords.length);

  let locations = unique(alert.locations, JOB_ALERT_MAX_LOCATIONS);
  let locationsFrom: JobSearchStrategy['basis']['locations'] = locations.length ? 'ALERT' : 'NONE';
  if (locations.length === 0 && profile) {
    locations = unique(
      profile.preferredLocations.length ? profile.preferredLocations : [profile.location],
      JOB_ALERT_MAX_LOCATIONS,
    );
    if (locations.length) locationsFrom = 'PROFILE';
  }

  let remotePreference = alert.remotePreference;
  let remoteFrom: JobSearchStrategy['basis']['remotePreference'] = 'ALERT';
  if (remotePreference === 'ANY' && profile) {
    const fromProfile = remoteFromWorkModes(profile.workModes);
    if (fromProfile !== 'ANY') {
      remotePreference = fromProfile;
      remoteFrom = 'PROFILE';
    }
  }

  let employmentTypes = alert.employmentTypes;
  let employmentFrom: JobSearchStrategy['basis']['employmentTypes'] = 'ALERT';
  if (employmentTypes.length === 0 && profile && profile.employmentTypes.length > 0) {
    employmentTypes = profile.employmentTypes;
    employmentFrom = 'PROFILE';
  }

  return {
    keywords,
    alternateTitles,
    locations,
    remotePreference,
    employmentTypes,
    experienceLevel: alert.experienceLevel,
    basis: {
      locations: locationsFrom,
      remotePreference: remoteFrom,
      employmentTypes: employmentFrom,
    },
  };
}
