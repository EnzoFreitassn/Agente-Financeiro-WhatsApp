import { z } from 'zod';

/**
 * Normalizacao DEFENSIVA do payload de webhook da Evolution API v2.
 *
 * A forma exata do payload de `messages.upsert` nao esta nos docs publicos acessiveis,
 * entao validamos de forma tolerante (Baileys por baixo). Campos extras sao ignorados;
 * variacoes de aninhamento comuns (ephemeral / viewOnce) sao tratadas.
 */

const KeySchema = z
  .object({
    id: z.string().optional(),
    remoteJid: z.string().optional(),
    fromMe: z.boolean().optional(),
  })
  .passthrough();

// Schema frouxo: a mensagem pode ter varias formas; validamos o que importa.
const MessagePayloadSchema = z
  .object({
    key: KeySchema.optional(),
    pushName: z.string().optional(),
    message: z.record(z.unknown()).optional().nullable(),
    messageType: z.string().optional(),
    messageTimestamp: z.union([z.number(), z.string()]).optional(),
  })
  .passthrough();

const WebhookBodySchema = z
  .object({
    event: z.string().optional(),
    instance: z.string().optional(),
    // `data` pode vir como objeto unico ou array de mensagens.
    data: z.union([MessagePayloadSchema, z.array(MessagePayloadSchema)]).optional(),
  })
  .passthrough();

export interface NormalizedMessage {
  event: string; // normalizado para minusculas com ponto, ex.: "messages.upsert"
  instance: string;
  messageId: string;
  remoteJid: string;
  fromMe: boolean;
  pushName: string;
  text: string | null; // null quando nao e mensagem de texto
}

/** Normaliza o nome do evento: aceita MESSAGES_UPSERT e messages.upsert. */
function normalizeEvent(raw: string | undefined): string {
  if (!raw) return '';
  return raw.trim().toLowerCase().replace(/_/g, '.');
}

/** Extrai texto de uma mensagem Baileys, lidando com os invólucros mais comuns. */
function extractText(message: Record<string, unknown> | null | undefined): string | null {
  if (!message || typeof message !== 'object') return null;

  // Desembrulha ephemeral / viewOnce / documentWithCaption recursivamente.
  const wrappers = [
    'ephemeralMessage',
    'viewOnceMessage',
    'viewOnceMessageV2',
    'viewOnceMessageV2Extension',
    'documentWithCaptionMessage',
    'editedMessage',
  ];
  for (const w of wrappers) {
    const inner = message[w] as Record<string, unknown> | undefined;
    if (inner && typeof inner === 'object' && 'message' in inner) {
      const t = extractText(inner['message'] as Record<string, unknown>);
      if (t !== null) return t;
    }
  }

  const conversation = message['conversation'];
  if (typeof conversation === 'string' && conversation.length > 0) return conversation;

  const extended = message['extendedTextMessage'] as { text?: unknown } | undefined;
  if (extended && typeof extended.text === 'string' && extended.text.length > 0) {
    return extended.text;
  }

  return null;
}

/**
 * Normaliza o corpo cru do webhook em uma estrutura previsivel.
 * Retorna null se o payload nao for reconhecivel como mensagem.
 */
export function normalizeWebhook(rawBody: unknown): NormalizedMessage | null {
  const parsed = WebhookBodySchema.safeParse(rawBody);
  if (!parsed.success) return null;

  const body = parsed.data;
  const payload = Array.isArray(body.data) ? body.data[0] : body.data;
  if (!payload) return null;

  const key = payload.key ?? {};
  const messageId = key.id ?? '';
  const remoteJid = key.remoteJid ?? '';

  if (!messageId || !remoteJid) return null;

  return {
    event: normalizeEvent(body.event),
    instance: body.instance ?? '',
    messageId,
    remoteJid,
    fromMe: key.fromMe === true,
    pushName: payload.pushName ?? '',
    text: extractText(payload.message),
  };
}

/** True se o evento normalizado e de mensagem recebida/enviada (messages.upsert). */
export function isMessagesUpsert(event: string): boolean {
  return event === 'messages.upsert';
}
