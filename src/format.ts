import { formatBRL } from './core/money';
import { formatShortDate } from './core/dates';
import type { ParsedTransaction } from './core/parser/types';

/**
 * Confirmacao de uma transacao registrada. Ecoa TUDO que foi inferido para o
 * usuario conferir na hora: valor em BRL, categoria resolvida e data resolvida.
 *   Despesa:  "✅ R$ 50,00 · mercado · 30/09"
 *   Receita:  "✅ Recebido R$ 2.000,00 · salário · 30/09"
 */
export function formatConfirmation(t: ParsedTransaction): string {
  const valor = formatBRL(t.amountCents);
  const data = formatShortDate(t.occurredAt);
  const head = t.intent === 'income' ? `✅ Recebido ${valor}` : `✅ ${valor}`;
  return `${head} · ${t.category} · ${data}`;
}

/** Resposta quando nao entendemos a mensagem. */
export function formatUnknown(): string {
  return [
    'Não entendi 🤔',
    'Tente algo como:',
    '• `gastei 50 no mercado`',
    '• `recebi 2000 de salário`',
    '• `paguei 120 de uber ontem`',
    'Ou mande `ajuda` para ver o que eu entendo.',
  ].join('\n');
}

/** Menu de ajuda. */
export const HELP_TEXT = [
  '🤖 *Agente Financeiro* — o que eu entendo:',
  '',
  '*Registrar despesa*',
  '• `gastei 50 no mercado`',
  '• `-120 uber ontem`',
  '• `paguei 89,90 de farmácia dia 5`',
  '',
  '*Registrar receita*',
  '• `recebi 2000 de salário`',
  '• `+500 freela`',
  '',
  'Confirmo cada lançamento assim: `✅ R$ 50,00 · mercado · 30/09`',
  '— confira o valor, a categoria e a data.',
  '',
  '*Consultas*',
  '• `saldo`',
  '• `quanto gastei esse mês`',
  '• `quanto gastei com transporte`',
  '• `extrato` (últimas transações)',
  '• `relatório` (resumo do mês)',
  '',
  '_Editar, remover e recategorizar chegam numa próxima atualização._',
].join('\n');
