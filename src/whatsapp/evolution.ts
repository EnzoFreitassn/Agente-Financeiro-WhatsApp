import { config } from '../config';
import { logger } from '../logger';
import { jidToNumber } from '../core/security';

/**
 * Client REST da Evolution API v2.
 *
 * Endpoint de envio confirmado: POST {EVOLUTION_API_URL}/message/sendText/{instance}
 * Header de auth: `apikey`. Numero em digitos com DDI (sem @s.whatsapp.net).
 *
 * O FORMATO do corpo varia entre versoes/forks da v2, entao e configuravel:
 *   flat   -> { number, text }
 *   nested -> { number, textMessage: { text } }
 */

const baseUrl = config.EVOLUTION_API_URL.replace(/\/+$/, '');

function buildSendTextBody(number: string, text: string): Record<string, unknown> {
  if (config.EVOLUTION_SENDTEXT_FORMAT === 'nested') {
    return { number, textMessage: { text } };
  }
  return { number, text };
}

export interface SendTextResult {
  ok: boolean;
  status: number;
}

/**
 * Envia uma mensagem de texto para um numero (digitos com DDI) ou JID.
 * Nunca lanca: erros de rede/HTTP sao logados e retornam ok:false.
 */
export async function sendText(numberOrJid: string, text: string): Promise<SendTextResult> {
  const number = numberOrJid.includes('@') ? jidToNumber(numberOrJid) : numberOrJid.replace(/\D/g, '');
  const url = `${baseUrl}/message/sendText/${encodeURIComponent(config.EVOLUTION_INSTANCE)}`;
  const body = buildSendTextBody(number, text);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: config.EVOLUTION_API_KEY,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      logger.error(
        { status: res.status, number, detail: detail.slice(0, 500) },
        'falha ao enviar texto pela Evolution API',
      );
      return { ok: false, status: res.status };
    }

    logger.debug({ number, status: res.status }, 'texto enviado');
    return { ok: true, status: res.status };
  } catch (err) {
    logger.error({ err, number }, 'erro de rede ao enviar texto pela Evolution API');
    return { ok: false, status: 0 };
  }
}
