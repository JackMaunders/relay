import { afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { MockAgent, setGlobalDispatcher } from 'undici';
import { eq } from 'drizzle-orm';

import { createApp } from '../../src/app.js';
import { webhookEvents } from '../../src/db/schema.js';
import type { WebhookEvent } from '../../src/types/webhook.js';

const app = createApp({ dbFilename: ':memory:', logger: false });

const deliveredEvent: WebhookEvent = {
  id: 'CVjDPnzkZsKSRm1UtvDSU',
  source: 'test-source',
  method: 'POST',
  headers: JSON.stringify({ 'content-type': 'application/json' }),
  body: JSON.stringify({ type: 'test.body' }),
  receivedAt: '2026-01-01T00:00:00.000Z',
  status: 'delivered',
  replayCount: 0,
  lastReplayedAt: null,
  lastReplayTarget: null,
};

const pendingEvent: WebhookEvent = {
  id: 'Uq8mVx3nKpLwYjT6bRcNe',
  source: 'other-source',
  method: 'POST',
  headers: JSON.stringify({ 'content-type': 'application/json' }),
  body: JSON.stringify({ type: 'other.body' }),
  receivedAt: '2026-01-01T00:00:01.000Z',
  status: 'pending',
  replayCount: 0,
  lastReplayedAt: null,
  lastReplayTarget: null,
};

describe('routes', () => {
  beforeAll(async () => {
    await app.ready();
    migrate(app.drizzle, { migrationsFolder: './drizzle/migrations' });
  });

  afterEach(async () => {
    await app.drizzle.delete(webhookEvents);
  });

  describe('inspect', () => {
    beforeEach(async () => {
      await app.drizzle.insert(webhookEvents).values([deliveredEvent, pendingEvent]);
    });

    // Get all
    test('GET /webhooks returns list of events', async () => {
      const response = await app.inject({ method: 'GET', url: '/webhooks' });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual(expect.arrayContaining([deliveredEvent, pendingEvent]));
    });

    // Test by source
    test('GET /webhooks?source filters by source', async () => {
      const response = await app.inject({ method: 'GET', url: '/webhooks?source=test-source' });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual([deliveredEvent]);
    });

    // Test by status
    test('GET /webhooks?status filters by status', async () => {
      const response = await app.inject({ method: 'GET', url: '/webhooks?status=pending' });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual([pendingEvent]);
    });

    // Test limit
    test('GET /webhooks?limit caps the number of results', async () => {
      const response = await app.inject({ method: 'GET', url: '/webhooks?limit=1' });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toHaveLength(1);
    });
  });

  describe('ingest', () => {
    const replayTarget = 'http://localhost:9999';
    let mockAgent: MockAgent;

    beforeEach(() => {
      mockAgent = new MockAgent();
      setGlobalDispatcher(mockAgent);
    });

    afterEach(async () => {
      vi.restoreAllMocks();
      delete process.env.REPLAY_TARGET_URL;
      await mockAgent.close();
    });

    test('POST /webhooks/:source inserts event and returns 201', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/webhooks/stripe',
        payload: { type: 'payment.succeeded' },
      });

      expect(response.statusCode).toBe(201);
      const { id } = response.json();
      expect(typeof id).toBe('string');

      const stored = app.drizzle.select().from(webhookEvents).where(eq(webhookEvents.id, id)).get();
      expect(stored?.source).toBe('stripe');
      expect(stored?.status).toBe('pending');
    });

    test('POST /webhooks/:source returns 400 for invalid source', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/webhooks/INVALID_SOURCE',
      });

      expect(response.statusCode).toBe(400);
    });

    test('POST /webhooks/:source marks event as delivered when replay succeeds', async () => {
      process.env.REPLAY_TARGET_URL = replayTarget;
      mockAgent.get(replayTarget).intercept({ path: '/', method: 'POST' }).reply(200, 'OK');

      const response = await app.inject({
        method: 'POST',
        url: '/webhooks/stripe',
        payload: { type: 'payment.succeeded' },
      });

      expect(response.statusCode).toBe(201);
      const { id } = response.json();
      const stored = app.drizzle.select().from(webhookEvents).where(eq(webhookEvents.id, id)).get();
      expect(stored?.status).toBe('delivered');
    });

    test('POST /webhooks/:source returns 500 when DB insert fails', async () => {
      vi.spyOn(app.drizzle, 'insert').mockImplementationOnce(() => {
        throw new Error('DB error');
      });

      const response = await app.inject({
        method: 'POST',
        url: '/webhooks/stripe',
        payload: { type: 'payment.succeeded' },
      });

      expect(response.statusCode).toBe(500);
      expect(response.json()).toMatchObject({ message: 'Failed to store webhook event' });
    });

    test('POST /webhooks/:source returns 201 even when replay block throws', async () => {
      process.env.REPLAY_TARGET_URL = replayTarget;
      vi.spyOn(app.drizzle, 'select').mockImplementationOnce(() => {
        throw new Error('DB error');
      });

      const response = await app.inject({
        method: 'POST',
        url: '/webhooks/stripe',
        payload: { type: 'payment.succeeded' },
      });

      expect(response.statusCode).toBe(201);
    });

    test('POST /webhooks/:source marks event as failed when replay returns non-2xx', async () => {
      process.env.REPLAY_TARGET_URL = replayTarget;
      mockAgent.get(replayTarget).intercept({ path: '/', method: 'POST' }).reply(500, 'Error');

      const response = await app.inject({
        method: 'POST',
        url: '/webhooks/stripe',
        payload: { type: 'payment.succeeded' },
      });

      expect(response.statusCode).toBe(201);
      const { id } = response.json();
      const stored = app.drizzle.select().from(webhookEvents).where(eq(webhookEvents.id, id)).get();
      expect(stored?.status).toBe('failed');
    });
  });

  describe('replay', () => {
    const replayTarget = 'http://localhost:9999';
    let mockAgent: MockAgent;

    beforeEach(async () => {
      await app.drizzle.insert(webhookEvents).values([deliveredEvent]);
      mockAgent = new MockAgent();
      setGlobalDispatcher(mockAgent);
    });

    afterEach(async () => {
      delete process.env.REPLAY_TARGET_URL;
      await mockAgent.close();
    });

    test('POST /:id/replay replays event and returns result', async () => {
      mockAgent.get(replayTarget).intercept({ path: '/', method: 'POST' }).reply(200, 'OK');

      const response = await app.inject({
        method: 'POST',
        url: `/webhooks/${deliveredEvent.id}/replay`,
        payload: { targetUrl: replayTarget },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ success: true, statusCode: 200, error: null });

      const stored = app.drizzle
        .select()
        .from(webhookEvents)
        .where(eq(webhookEvents.id, deliveredEvent.id))
        .get();
      expect(stored?.status).toBe('replayed');
      expect(stored?.replayCount).toBe(1);
      expect(stored?.lastReplayTarget).toBe(replayTarget);
      expect(stored?.lastReplayedAt).toEqual(expect.any(String));
    });

    test('POST /:id/replay uses REPLAY_TARGET_URL when no targetUrl in body', async () => {
      process.env.REPLAY_TARGET_URL = replayTarget;
      mockAgent.get(replayTarget).intercept({ path: '/', method: 'POST' }).reply(200, 'OK');

      const response = await app.inject({
        method: 'POST',
        url: `/webhooks/${deliveredEvent.id}/replay`,
        payload: {},
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({ success: true });
    });

    test('POST /:id/replay returns 400 when no target URL is available', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/webhooks/${deliveredEvent.id}/replay`,
        payload: {},
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({
        message: 'No target URL provided and REPLAY_TARGET_URL is not set',
      });
    });

    test('POST /:id/replay returns 404 for unknown event id', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/webhooks/aaaaaaaaaaaaaaaaaaaa1/replay',
        payload: { targetUrl: replayTarget },
      });

      expect(response.statusCode).toBe(404);
      expect(response.json()).toMatchObject({ message: 'Webhook event not found' });
    });

    test('POST /:id/replay marks event as failed when replay returns non-2xx', async () => {
      mockAgent.get(replayTarget).intercept({ path: '/', method: 'POST' }).reply(500, 'Error');

      const response = await app.inject({
        method: 'POST',
        url: `/webhooks/${deliveredEvent.id}/replay`,
        payload: { targetUrl: replayTarget },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ success: false, statusCode: 500, error: null });

      const stored = app.drizzle
        .select()
        .from(webhookEvents)
        .where(eq(webhookEvents.id, deliveredEvent.id))
        .get();
      expect(stored?.status).toBe('failed');
      expect(stored?.replayCount).toBe(1);
    });
  });
});
