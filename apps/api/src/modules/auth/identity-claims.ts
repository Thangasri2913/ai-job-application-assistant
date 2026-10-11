/** The subset of Keycloak access-token claims the application relies on (after validation). */
export interface IdentityClaims {
  subject: string;
  email: string | null;
  emailVerified: boolean;
  name: string | null;
  roles: string[];
  /** When the user last actually authenticated (seconds since epoch), if present. */
  authTime: number | null;
}
