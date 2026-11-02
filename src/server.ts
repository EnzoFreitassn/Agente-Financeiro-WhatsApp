import Fastify from 'fastify';
import type { FastifyRequest } from 'fastify';
import { config } from './config';
import { logger } from './logger';
import { wasProcessed, markProcessed } from './db';
import { sendText } from './whatsapp/evolution';
import { normalizeWebhook, isMessagesUpsert } from './whatsapp/webhook';
import { isAllowed, isGroupJid, jidToNumber } from './core/security';
import { parseMessage } from './core/parser';
import { handle } from './core/handlers';

const app = Fastify({ loggerInstance: logger, bodyLimit: 2 * 1024 * 1024 });

app.get('/health', async () => ({ status: 'ok', ts: new Date().toISOString() }));

/**
 * Autenticacao do webhook. Aceita o segredo de duas formas (a Evolution v2 suporta
 * `headers` customizados no webhook, mas o comportamento no envio nao e documentado,
 * entao mantemos o path como fallback compativel):
 *   - header `X-Webhook-Token: <WEBHOOK_SECRET>`  (preferido; nao vaza na URL)
 *   - qualquer segmento do path = <WEBHOOK_SECRET> (ex.: /webhook/<secret>[/evento])
 */
function isAuthorized(req: FastifyRequest): boolean {
  const secret = config.WEBHOOK_SECRET;

  const header = req.headers['x-webhook-token'];
  if (typeof header === 'string' && header === secret) return true;

  const star = (req.params as Record<string, string | undefined>)['*'];
  const segments = (star ?? '').split('/').filter(Boolean);
  return segments.includes(secret);
}

/**
 * Processa uma mensagem recebida. Nunca lanca; sempre deixa o caller responder 200
 * (evita re-tentativas da Evolution).
 *
 * Idempotencia: faz uma LEITURA (wasProcessed) para curto-circuitar duplicatas obvias,
 * e so MARCA (markProcessed) DEPOIS de processar com sucesso. Para operacoes que
 * escrevem transacao (Fase 3+), a marcacao acontece atomicamente junto do insert
 * (ver db/transactions.ts) — aqui, no echo, marcamos apos o envio.
 */
async function processMessage(rawBody: unknown): Promise<void> {
  const msg = normalizeWebhook(rawBody);
  if (!msg) {
    logger.debug('payload de webhook nao reconhecido — ignorado');
    return;
  }

  if (!isMessagesUpsert(msg.event)) {
    logger.debug({ event: msg.event }, 'evento ignorado (nao e messages.upsert)');
    return;
  }

  if (msg.fromMe) {
    logger.debug('mensagem fromMe ignorada');
    return;
  }

  if (isGroupJid(msg.remoteJid)) {
    logger.debug('mensagem de grupo ignorada');
    return;
  }

  const number = jidToNumber(msg.remoteJid);
  if (!isAllowed(number, config.ALLOWED_NUMBERS)) {
    logger.warn({ number }, 'remetente fora da whitelist — ignorado em silencio');
    return;
  }

  // Curto-circuito de duplicata (leitura, nao marca).
  if (wasProcessed(msg.messageId)) {
    logger.debug({ messageId: msg.messageId }, 'mensagem ja processada — ignorada');
    return;
  }

  // Sem texto (midia, etc.).
  if (!msg.text) {
    logger.info({ messageId: msg.messageId }, 'mensagem sem texto');
    const r = await sendText(msg.remoteJid, 'Por enquanto eu so entendo mensagens de texto. 🙂');
    if (r.ok) markProcessed(msg.messageId); // marca so apos processar (enviar)
    return;
  }

  // Parse (regras -> LLM na Fase 5) e execucao.
  const parsed = await parseMessage(msg.text);
  const result = handle(parsed, { messageId: msg.messageId, remoteJid: msg.remoteJid });

  let sentOk = true;
  if (result.reply) {
    const r = await sendText(msg.remoteJid, result.reply);
    sentOk = r.ok;
  }
  // Transacoes ja foram marcadas atomicamente no insert; o resto marca apos enviar.
  if (result.markAfterSend && sentOk) markProcessed(msg.messageId);

  logger.info({ from: number, intent: parsed.intent }, 'mensagem processada');
}

async function webhookRoute(req: FastifyRequest): Promise<{ received: boolean } | undefined> {
  if (!isAuthorized(req)) {
    logger.warn('webhook nao autorizado — 404');
    return undefined; // caller responde 404
  }
  try {
    await processMessage(req.body);
  } catch (err) {
    logger.error({ err }, 'erro ao processar mensagem');
  }
  return { received: true };
}

app.post('/webhook', async (req, reply) => {
  const res = await webhookRoute(req);
  return res ? reply.code(200).send(res) : reply.code(404).send({ error: 'not found' });
});

app.post('/webhook/*', async (req, reply) => {
  const res = await webhookRoute(req);
  return res ? reply.code(200).send(res) : reply.code(404).send({ error: 'not found' });
});

async function start(): Promise<void> {
  try {
    await app.listen({ port: config.PORT, host: '0.0.0.0' });
    logger.info(
      { port: config.PORT, instance: config.EVOLUTION_INSTANCE, llm: config.LLM_ENABLED },
      'agente financeiro no ar',
    );
  } catch (err) {
    logger.error({ err }, 'falha ao subir o servidor');
    process.exit(1);
  }
}

process.on('unhandledRejection', (err) => logger.error({ err }, 'unhandledRejection'));
process.on('uncaughtException', (err) => logger.error({ err }, 'uncaughtException'));

void start();
