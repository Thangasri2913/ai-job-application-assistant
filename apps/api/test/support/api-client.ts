import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { issueToken, newIdentity } from './test-identity.js';

/**
 * Signs in a fresh identity (a Keycloak-shaped token) and returns helpers that send
 * authenticated requests as that user. The first request creates the local user.
 */
export async function signUp(app: NestExpressApplication, name = 'Test User') {
  const identity = newIdentity(name);
  const token = await issueToken(identity);
  const auth = { Authorization: `Bearer ${token}` };
  const me = await request(app.getHttpServer()).get('/api/v1/auth/me').set(auth).expect(200);
  const server = app.getHttpServer();
  return {
    email: identity.email,
    identity,
    token,
    userId: (me.body as { id: string }).id,
    get: (url: string) => request(server).get(`/api/v1${url}`).set(auth),
    post: (url: string, body?: object) =>
      request(server).post(`/api/v1${url}`).set(auth).send(body),
    put: (url: string, body?: object) => request(server).put(`/api/v1${url}`).set(auth).send(body),
    patch: (url: string, body?: object) =>
      request(server).patch(`/api/v1${url}`).set(auth).send(body),
    delete: (url: string) => request(server).delete(`/api/v1${url}`).set(auth),
    upload: (url: string, file: Buffer, filename: string, fields: Record<string, string> = {}) => {
      let req = request(server).post(`/api/v1${url}`).set(auth).attach('file', file, filename);
      for (const [key, value] of Object.entries(fields)) req = req.field(key, value);
      return req;
    },
  };
}

export type TestUser = Awaited<ReturnType<typeof signUp>>;
