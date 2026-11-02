import pino from 'pino';
import { config } from './config';

/**
 * Mascara o WEBHOOK_SECRET em qualquer string (ex.: URL de request que o traz no path).
 * Usa split/join para nao depender de regex (o segredo pode ter caracteres especiais).
 */
export function maskSecret(value: string | undefined): string {
  if (!value) return '';
  if (!config.WEBHOOK_SECRET) return value;
  return value.split(config.WEBHOOK_SECRET).join('***');
}

/**
 * Logger estruturado. Nunca loga segredos:
 *  - redaction cobre apikey (que vem no proprio payload do webhook da Evolution),
 *    tokens de API e o header X-Webhook-Token;
 *  - o serializer de `req` mascara o WEBHOOK_SECRET embutido na URL (quando o segredo
 *    vai no path) e NAO inclui os headers no log.
 */
export const logger = pino({
  level: config.LOG_LEVEL,
  redact: {
    paths: [
      'apikey',
      'ANTHROPIC_API_KEY',
      'EVOLUTION_API_KEY',
      'headers.apikey',
      'headers["x-webhook-token"]',
      'req.headers.apikey',
      'req.headers["x-webhook-token"]',
      'payload.apikey',
      'data.apikey',
      '*.apikey',
      '*.ANTHROPIC_API_KEY',
      '*.EVOLUTION_API_KEY',
    ],
    censor: '[redacted]',
  },
  serializers: {
    // Reimplementa o serializer de req do Fastify mascarando o segredo na URL
    // e omitindo os headers de propósito.
    req(req: {
      method?: string;
      url?: string;
      ip?: string;
      socket?: { remoteAddress?: string; remotePort?: number };
      headers?: Record<string, unknown>;
    }) {
      return {
        method: req.method,
        url: maskSecret(req.url),
        host: typeof req.headers?.host === 'string' ? req.headers.host : undefined,
        remoteAddress: req.ip ?? req.socket?.remoteAddress,
        remotePort: req.socket?.remotePort,
      };
    },
  },
  ...(process.env.NODE_ENV !== 'production'
    ? {
        transport: {
          target: 'pino-pretty',
          options: { colorize: true, translateTime: 'SYS:HH:MM:ss', ignore: 'pid,hostname' },
        },
      }
    : {}),
});
