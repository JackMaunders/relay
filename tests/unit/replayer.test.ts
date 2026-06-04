import { beforeEach, describe, expect, test } from 'vitest';
import { MockAgent, setGlobalDispatcher } from 'undici';

import { replayEvent } from '../../src/helpers/replayer.js';
import { WebhookEvent } from '../../src/types/webhook.js';

describe('replayEvent', () => {
  const replayTarget = 'http://localhost:3001';

  const testEvent: WebhookEvent = {
    id: 'test-id',
    source: 'test-source',
    method: 'POST',
    headers: '{"test-header": "test-value"}',
    body: 'test-body',
    receivedAt: 'test-received-at',
    status: 'pending',
    replayCount: 0,
    lastReplayedAt: null,
    lastReplayTarget: null,
  };

  let mockAgent: MockAgent;
  beforeEach(async () => {
    mockAgent = new MockAgent();

    setGlobalDispatcher(mockAgent);
  });

  // Success
  describe('success', () => {
    test('returns success true and status code on 200 response', async () => {
      mockAgent
        .get(replayTarget)
        .intercept({ path: '/', method: testEvent.method })
        .reply(200, 'OK');

      expect(await replayEvent(testEvent, replayTarget)).toEqual({
        success: true,
        statusCode: 200,
        error: null,
      });
    });

    test('handles non-200 2xx status codes as success', async () => {
      mockAgent
        .get(replayTarget)
        .intercept({ path: '/', method: testEvent.method })
        .reply(204, 'OK');

      expect(await replayEvent(testEvent, replayTarget)).toEqual({
        success: true,
        statusCode: 204,
        error: null,
      });
    });
  });

  describe('failure', () => {
    test('returns success false on a 500 response', async () => {
      mockAgent
        .get(replayTarget)
        .intercept({ path: '/', method: 'POST' })
        .reply(500, 'Internal Server Error');

      const result = await replayEvent(testEvent, replayTarget);

      expect(result).toEqual({
        success: false,
        statusCode: 500,
        error: null,
      });
    });

    test('returns success false on a 404 response', async () => {
      mockAgent.get(replayTarget).intercept({ path: '/', method: 'POST' }).reply(404, 'Not Found');

      const result = await replayEvent(testEvent, replayTarget);

      expect(result).toEqual({
        success: false,
        statusCode: 404,
        error: null,
      });
    });

    test('returns success false and error message when fetch fails', async () => {
      mockAgent
        .get(replayTarget)
        .intercept({ path: '/', method: 'POST' })
        .replyWithError(new Error('Connection refused'));

      const result = await replayEvent(testEvent, replayTarget);

      expect(result).toEqual({
        success: false,
        statusCode: null,
        // Undici wraps thrown errors with 'fetch failed' leaving this open to avoid broken test if undici makes a change
        error: expect.any(String),
      });
    });
  });

  describe('null body handling', () => {
    test('passes undefined as body when event body is null', async () => {
      mockAgent
        .get(replayTarget)
        .intercept({ path: '/', method: 'POST', body: undefined })
        .reply(200, 'OK');

      const eventWithNoBody: WebhookEvent = { ...testEvent, body: null };
      const result = await replayEvent(eventWithNoBody, replayTarget);

      expect(result.success).toBe(true);
    });
  });
});
