import { parseWithRules } from './rules';
import type { ParseResult } from './types';

/**
 * Orquestrador do parsing: regras primeiro (gratis). A camada LLM (Claude Haiku)
 * entra na Fase 5 — quando `config.LLM_ENABLED` e as regras devolverem 'unknown',
 * este ponto chamara o fallback. Mantido async desde ja para evitar refactor.
 */
export async function parseMessage(text: string): Promise<ParseResult> {
  const result = parseWithRules(text);

  // Fase 5 (placeholder):
  // if (result.intent === 'unknown' && config.LLM_ENABLED) {
  //   const llm = await parseWithLLM(text);
  //   if (llm) return llm;
  // }

  return result;
}

export type { ParseResult } from './types';
