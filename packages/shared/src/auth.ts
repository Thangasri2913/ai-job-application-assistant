/** Max length of a display name (profile full name). */
export const NAME_MAX_LENGTH = 100;

/**
 * The signed-in user as the application knows them. Identity (credentials, sessions)
 * is owned by Keycloak; this is the application's own user record.
 */
export interface AuthUser {
  /** Application user id (stable; used for all user-owned data). */
  id: string;
  email: string;
  fullName: string;
  /** Realm roles from the identity provider, e.g. ["user"]. */
  roles: string[];
  createdAt: string;
}
