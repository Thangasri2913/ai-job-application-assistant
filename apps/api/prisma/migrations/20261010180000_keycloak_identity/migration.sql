-- Keycloak becomes the only identity provider: the application no longer stores
-- passwords or refresh sessions. Existing users are kept (keycloak_subject NULL) and
-- are linked on first Keycloak sign-in when Keycloak reports the same, verified email.
-- Production note: export users (id, email, full_name, password_hash) and import them
-- into Keycloak BEFORE applying this migration if their passwords must keep working;
-- see docs/adr/0013-keycloak-identity-provider.md › Migrating existing users.
BEGIN;

ALTER TABLE "users" ADD COLUMN "keycloak_subject" TEXT;
CREATE UNIQUE INDEX "users_keycloak_subject_key" ON "users"("keycloak_subject");

-- Email is now a copy of the IdP's value; Keycloak enforces uniqueness.
DROP INDEX "users_email_key";
CREATE INDEX "users_email_idx" ON "users"("email");

-- Local password authentication is removed.
ALTER TABLE "sessions" DROP CONSTRAINT "sessions_user_id_fkey";
DROP TABLE "sessions";
ALTER TABLE "users" DROP COLUMN "password_hash";

COMMIT;
