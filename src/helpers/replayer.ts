// src/lib/replayer.ts
import type { WebhookEvent } from '../types/webhook.js'

type ReplayResult = {
  success: boolean
  statusCode: number | null
  error: string | null
}

export async function replayEvent(
  event: WebhookEvent,
  targetUrl: string
): Promise<ReplayResult> {
  try {
    const response = await fetch(targetUrl, {
      method: event.method,
      headers: JSON.parse(event.headers),
      body: event.body ?? undefined
    })

    return {
      success: response.ok,
      statusCode: response.status,
      error: null
    }
  } catch (err) {
    return {
      success: false,
      statusCode: null,
      error: err instanceof Error ? err.message : 'Unknown error'
    }
  }
}
