import { createTransactionIdempotent } from '../db/transactions';
import { logger } from '../logger';
import { formatConfirmation, formatUnknown, HELP_TEXT } from '../format';
import { saldoDoMes, gastosDoMes, gastosPorCategoria, extrato, relatorioMensal } from './reports';
import type { ParseResult } from './parser/types';

export interface HandlerContext {
  messageId: string;
  remoteJid: string;
}

export interface HandlerResult {
  /** Texto a enviar de volta, ou null para nao responder nada. */
  reply: string | null;
  /**
   * true  -> o servidor deve marcar o message_id como processado APOS enviar.
   * false -> a marcacao ja aconteceu atomicamente junto do insert (transacao),
   *          ou nao deve ser marcada (ex.: falha, para permitir retry).
   */
  markAfterSend: boolean;
}

/**
 * Executa a intencao e devolve a resposta em pt-BR.
 *
 * Para despesa/receita, a persistencia e a marcacao de idempotencia acontecem
 * ATOMICAMENTE em createTransactionIdempotent (ver db/transactions.ts), entao
 * markAfterSend=false. Para o resto (ajuda/consulta/unknown), o servidor marca
 * apos o envio bem-sucedido.
 */
export function handle(parsed: ParseResult, ctx: HandlerContext): HandlerResult {
  switch (parsed.intent) {
    case 'expense':
    case 'income': {
      try {
        const res = createTransactionIdempotent(
          {
            type: parsed.intent,
            amountCents: parsed.amountCents,
            category: parsed.category,
            description: parsed.description,
            occurredAt: parsed.occurredAt,
          },
          ctx.messageId,
        );
        if (res.status === 'duplicate') {
          logger.debug({ messageId: ctx.messageId }, 'transacao duplicada — ignorada');
          return { reply: null, markAfterSend: false };
        }
        logger.info({ id: res.id, type: parsed.intent, category: parsed.category }, 'transacao registrada');
        return { reply: formatConfirmation(parsed), markAfterSend: false };
      } catch (err) {
        logger.error({ err, messageId: ctx.messageId }, 'falha ao registrar transacao');
        // Nao marca -> permite retry numa proxima mensagem.
        return { reply: '❌ Tive um problema ao registrar. Pode mandar de novo?', markAfterSend: false };
      }
    }

    case 'command': {
      if (parsed.command === 'ajuda') return { reply: HELP_TEXT, markAfterSend: true };
      // apagar/corrigir/recategorizar -> Fase 6 (ja detectados aqui)
      return { reply: 'Editar, remover e recategorizar lançamentos chega numa próxima atualização. 🙂', markAfterSend: true };
    }

    case 'query': {
      try {
        let reply: string;
        switch (parsed.queryType) {
          case 'saldo': reply = saldoDoMes(); break;
          case 'mes': reply = gastosDoMes(); break;
          case 'categoria': reply = gastosPorCategoria(parsed.category ?? 'outros'); break;
          case 'extrato': reply = extrato(); break;
          case 'relatorio': reply = relatorioMensal(); break;
          default: reply = formatUnknown();
        }
        return { reply, markAfterSend: true };
      } catch (err) {
        logger.error({ err, queryType: parsed.queryType }, 'falha ao montar consulta');
        return { reply: '❌ Não consegui montar essa consulta agora. Tente de novo?', markAfterSend: false };
      }
    }

    case 'unknown':
    default:
      return { reply: formatUnknown(), markAfterSend: true };
  }
}
