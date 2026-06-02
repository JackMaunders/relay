import { InferSelectModel, InferInsertModel } from 'drizzle-orm'
import { webhookEvents } from '../db/schema.js'

export type WebhookEvent = InferSelectModel<typeof webhookEvents>
export type NewWebhookEvent = InferInsertModel<typeof webhookEvents>
