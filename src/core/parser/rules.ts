import { parseAmountToCents } from '../money';
import { resolveOccurredAt, now } from '../dates';
import { inferCategory } from '../categories';
import type { ParseResult } from './types';

/** minuscula + sem acento. */
function norm(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

// Padroes de data (no texto ORIGINAL; case-insensitive, com variantes de acento).
const DATE_PATTERNS: RegExp[] = [
  /\b(anteontem|ontem|hoje|amanh[ãa])\b/i,
  /\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b/,
  /\bdia\s+\d{1,2}\b/i,
  /\b(segunda|seg|ter[çc]a|ter|quarta|qua|quinta|qui|sexta|sex|s[áa]bado|sab|domingo|dom)\b/i,
];

// Palavras removidas da descricao (verbos e conectivos).
const STOPWORDS = new Set<string>([
  'gastei', 'gasto', 'gastar', 'paguei', 'pagar', 'pago', 'comprei', 'comprar', 'compra',
  'recebi', 'receber', 'recebido', 'ganhei', 'ganhar', 'recebimento', 'entrou', 'caiu',
  'de', 'do', 'da', 'dos', 'das', 'no', 'na', 'nos', 'nas', 'em', 'com', 'para', 'pra',
  'pro', 'por', 'o', 'a', 'os', 'as', 'um', 'uma', 'uns', 'umas', 'meu', 'minha', 'r$',
]);

const INCOME_VERB = /\b(recebi|ganhei|recebimento|recebido|caiu|entrou)\b/;

// Verbos de DESPESA: sempre vencem (evita falso positivo de receita).
const EXPENSE_VERB = /\b(gastei|gasto|gastar|paguei|pagar|pago|comprei|comprar|compra)\b/;

// Palavras-chave FORTES de receita (substantivos que raramente aparecem em despesa).
const INCOME_KEYWORDS = /\b(salario|freela|freelance|rendimento|rendimentos|dividendos?|bonus|restituicao|reembolso|comissao|comissoes)\b/;

// Frases QUALIFICADAS de receita (termos ambiguos exigem "recebido" explicito,
// senao "pix"/"pagamento" gerariam falso positivo em despesa, ex.: "pagamento do aluguel").
const INCOME_PHRASES = /\bpix recebido\b|\bpagamento recebido\b|\brecebi(?:do)? (?:um |o )?pix\b/;

function cleanDescription(work: string): string {
  const tokens = work.replace(/[+\-]/g, ' ').split(/\s+/).filter(Boolean);
  return tokens.filter((tk) => !STOPWORDS.has(norm(tk))).join(' ').trim();
}

/** Remove a primeira expressao de data encontrada; retorna o texto e o trecho casado. */
function extractDate(text: string): { rest: string; dateText?: string } {
  for (const re of DATE_PATTERNS) {
    const m = text.match(re);
    if (m && m.index !== undefined) {
      const dateText = m[0];
      const rest = `${text.slice(0, m.index)} ${text.slice(m.index + dateText.length)}`;
      return { rest, dateText };
    }
  }
  return { rest: text };
}

/** Acha o primeiro token numerico que vira um valor valido (> 0). */
function extractAmount(text: string): { rest: string; amountCents: number } | null {
  const re = /\d[\d.,]*\d|\d/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const cents = parseAmountToCents(m[0]);
    if (cents && cents > 0) {
      let before = text.slice(0, m.index).replace(/r\$\s*$/i, '');
      const after = text.slice(m.index + m[0].length);
      return { rest: `${before} ${after}`, amountCents: cents };
    }
  }
  return null;
}

/**
 * Parser por regras. Resolve a maioria das mensagens sem custo.
 * Retorna 'unknown' quando nao ha confianca (a Fase 5 pluga o LLM aqui).
 */
export function parseWithRules(input: string): ParseResult {
  const text = input.trim();
  if (!text) return { intent: 'unknown', source: 'rules' };
  const n = norm(text);

  // ---- Comandos ----
  if (/\b(ajuda|menu|help|comandos)\b/.test(n)) {
    return { intent: 'command', command: 'ajuda', source: 'rules' };
  }
  if (/\bapagar\b/.test(n)) {
    return { intent: 'command', command: 'apagar_ultimo', source: 'rules' };
  }
  // Recategorizar (Fase 6): "categoria X" ou "corrigir categoria X".
  // Checado ANTES de "corrigir" (valor) para nao ser confundido.
  if (/^categoria\b/.test(n) || /\bcorrigir\s+categoria\b/.test(n)) {
    const cat = inferCategory(text);
    return {
      intent: 'command',
      command: 'recategorizar_ultimo',
      ...(cat !== 'outros' ? { category: cat } : {}),
      source: 'rules',
    };
  }
  if (/\bcorrigir\b/.test(n)) {
    const amt = extractAmount(text);
    return {
      intent: 'command',
      command: 'corrigir_ultimo',
      ...(amt ? { amountCents: amt.amountCents } : {}),
      source: 'rules',
    };
  }

  // ---- Consultas ----
  if (/\bsaldo\b/.test(n)) return { intent: 'query', queryType: 'saldo', source: 'rules' };
  if (/\b(extrato|ultimos|ultimas|historico)\b/.test(n)) {
    return { intent: 'query', queryType: 'extrato', source: 'rules' };
  }
  if (/\brelatorio\b/.test(n)) return { intent: 'query', queryType: 'relatorio', source: 'rules' };
  if (/\bquanto\b/.test(n) && /\bgast/.test(n)) {
    const cat = inferCategory(text);
    return cat !== 'outros'
      ? { intent: 'query', queryType: 'categoria', category: cat, source: 'rules' }
      : { intent: 'query', queryType: 'mes', source: 'rules' };
  }
  if (/\b(este|esse)\s+mes\b/.test(n) || n === 'mes') {
    return { intent: 'query', queryType: 'mes', source: 'rules' };
  }

  // ---- Transacao (despesa/receita) ----
  // Prioridade (conservadora): sinal explicito > verbo de despesa > sinal de receita > padrao despesa.
  const incomeSignal = INCOME_VERB.test(n) || INCOME_KEYWORDS.test(n) || INCOME_PHRASES.test(n);
  const intent: 'expense' | 'income' =
    text.startsWith('+') ? 'income'
    : text.startsWith('-') ? 'expense'
    : EXPENSE_VERB.test(n) ? 'expense'
    : incomeSignal ? 'income'
    : 'expense';

  const afterDate = extractDate(text);
  const amount = extractAmount(afterDate.rest);
  if (!amount) return { intent: 'unknown', source: 'rules' };

  const category = inferCategory(amount.rest);
  const description = cleanDescription(amount.rest);
  const occurredAt = resolveOccurredAt(afterDate.dateText, now());

  return { intent, amountCents: amount.amountCents, category, description, occurredAt, source: 'rules' };
}
