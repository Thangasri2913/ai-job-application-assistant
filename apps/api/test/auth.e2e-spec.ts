import type { NestExpressApplication } from '@nestjs/platform-express';
import { generateKeyPair } from 'jose';
import request from 'supertest';
import type { PrismaService } from '../src/database/prisma.service.js';
import { createTestApp, resetDatabase } from './create-test-app.js';
import { issueToken, newIdentity } from './support/test-identity.js';

describe('Keycloak authentication (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  const me = (token?: string) => {
    const req = request(app.getHttpServer()).get('/api/v1/auth/me');
    return token ? req.set('Authorization', `Bearer ${token}`) : req;
  };

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('token validation', () => {
    it('rejects requests without a token', async () => {
      const res = await me().expect(401);
      expect(res.body.code).toBe('UNAUTHORIZED');
    });

    it('rejects a malformed token', async () => {
      await me('not-a-jwt').expect(401);
      await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('Authorization', 'Basic abc')
        .expect(401);
    });

    it('rejects an expired token with TOKEN_EXPIRED', async () => {
      const now = Math.floor(Date.now() / 1000);
      const token = await issueToken(newIdentity(), { iat: now - 600, exp: now - 60 });
      const res = await me(token).expect(401);
      expect(res.body.code).toBe('TOKEN_EXPIRED');
    });

    it('rejects a token signed with a key Keycloak did not use', async () => {
      const { privateKey } = await generateKeyPair('RS256');
      const token = await issueToken(newIdentity(), {}, { signWith: privateKey });
      await me(token).expect(401);
    });

    it('rejects a tampered token', async () => {
      const token = await issueToken(newIdentity());
      const [header, payload, signature] = token.split('.');
      const claims = JSON.parse(Buffer.from(payload!, 'base64url').toString()) as Record<
        string,
        unknown
      >;
      const forged = Buffer.from(JSON.stringify({ ...claims, sub: 'someone-else' })).toString(
        'base64url',
      );
      await me(`${header}.${forged}.${signature}`).expect(401);
    });

    it.each([
      ['another issuer', { iss: 'http://evil.example/realms/ai-job-assistant' }],
      ['another audience', { aud: 'some-other-api' }],
      ['another client (azp)', { azp: 'some-other-client' }],
      ['an ID token instead of an access token', { typ: 'ID' }],
      ['a token not yet valid', { nbf: Math.floor(Date.now() / 1000) + 600 }],
    ])('rejects %s', async (_label, overrides) => {
      const res = await me(await issueToken(newIdentity(), overrides)).expect(401);
      expect(res.body.code).toBe('UNAUTHORIZED');
      expect(await prisma.user.count()).toBe(0);
    });

    it('never returns token details in errors', async () => {
      const res = await me('not-a-jwt').expect(401);
      expect(JSON.stringify(res.body)).not.toContain('not-a-jwt');
    });
  });

  describe('user synchronisation', () => {
    it('creates the local user on the first authenticated request', async () => {
      const identity = newIdentity('Priya Sharma');
      const res = await me(await issueToken(identity)).expect(200);

      expect(res.body).toMatchObject({
        email: identity.email,
        fullName: 'Priya Sharma',
        roles: expect.arrayContaining(['user']),
      });
      const user = await prisma.user.findUniqueOrThrow({
        where: { keycloakSubject: identity.sub },
      });
      expect(user.id).toBe(res.body.id);
      expect(user.lastLoginAt).not.toBeNull();
      expect(user).not.toHaveProperty('passwordHash');
      expect(
        await prisma.auditLog.count({ where: { action: 'auth.user_created', userId: user.id } }),
      ).toBe(1);
    });

    it('maps the same Keycloak subject to the same user (no duplicates)', async () => {
      const identity = newIdentity();
      const first = await me(await issueToken(identity)).expect(200);
      const second = await me(await issueToken(identity)).expect(200);
      expect(second.body.id).toBe(first.body.id);
      expect(await prisma.user.count()).toBe(1);
    });

    it('creates distinct users for distinct subjects, even with the same email', async () => {
      const a = newIdentity();
      const b = { ...newIdentity(), email: a.email };
      const resA = await me(await issueToken(a)).expect(200);
      const resB = await me(await issueToken(b)).expect(200);
      expect(resA.body.id).not.toBe(resB.body.id);
    });

    it('syncs a changed email but keeps the app-owned display name', async () => {
      const identity = newIdentity('Original Name');
      const first = await me(await issueToken(identity)).expect(200);
      await prisma.user.update({
        where: { id: first.body.id },
        data: { fullName: 'Name edited in app' },
      });

      const changed = { ...identity, email: 'new-address@example.com', name: 'Name From Keycloak' };
      const res = await me(await issueToken(changed)).expect(200);
      expect(res.body).toMatchObject({
        id: first.body.id,
        email: 'new-address@example.com',
        fullName: 'Name edited in app',
      });
    });

    it('records a new login only when Keycloak reports a newer authentication', async () => {
      const identity = newIdentity();
      const now = Math.floor(Date.now() / 1000);
      await me(await issueToken(identity, { auth_time: now - 100 })).expect(200);
      await me(await issueToken(identity, { auth_time: now - 100 })).expect(200);
      await me(await issueToken(identity, { auth_time: now })).expect(200);
      expect(await prisma.auditLog.count({ where: { action: 'auth.login' } })).toBe(2);
    });

    it('links a pre-Keycloak account only when the email is verified', async () => {
      const legacy = await prisma.user.create({
        data: { email: 'legacy@example.com', fullName: 'Legacy User' },
      });

      const unverified = { ...newIdentity(), email: 'legacy@example.com' };
      const resUnverified = await me(await issueToken(unverified)).expect(200);
      expect(resUnverified.body.id).not.toBe(legacy.id);

      const verified = { ...newIdentity(), email: 'legacy@example.com', emailVerified: true };
      const resVerified = await me(await issueToken(verified)).expect(200);
      expect(resVerified.body.id).toBe(legacy.id);
      expect(
        (await prisma.user.findUniqueOrThrow({ where: { id: legacy.id } })).keycloakSubject,
      ).toBe(verified.sub);
    });

    it('rejects disabled accounts', async () => {
      const identity = newIdentity();
      const res = await me(await issueToken(identity)).expect(200);
      await prisma.user.update({ where: { id: res.body.id }, data: { status: 'DISABLED' } });
      const denied = await me(await issueToken(identity)).expect(403);
      expect(denied.body.code).toBe('ACCOUNT_DISABLED');
    });
  });

  it('protects application endpoints and leaves health public', async () => {
    await request(app.getHttpServer()).get('/api/v1/profile').expect(401);
    await request(app.getHttpServer()).get('/api/v1/resumes').expect(401);
    await request(app.getHttpServer()).get('/api/v1/health').expect(200);
    // Old local-password endpoints no longer exist.
    await request(app.getHttpServer()).post('/api/v1/auth/login').send({}).expect(404);
    await request(app.getHttpServer()).post('/api/v1/auth/register').send({}).expect(404);
  });
});
