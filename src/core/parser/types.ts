export type Intent = 'expense' | 'income' | 'query' | 'command' | 'unknown';

/** Fonte da decisao: regras (gratis) ou LLM (Fase 5). */
export type ParseSource = 'rules' | 'llm';

export interface ParsedTransaction {
  intent: 'expense' | 'income';
  amountCents: number;
  category: string;
  description: string;
  /** ISO com offset (America/Sao_Paulo). */
  occurredAt: string;
  source?: ParseSource;
}

export type QueryType = 'saldo' | 'mes' | 'categoria' | 'extrato' | 'relatorio';

export interface ParsedQuery {
  intent: 'query';
  queryType: QueryType;
  category?: string;
  source?: ParseSource;
}

export type CommandType = 'ajuda' | 'apagar_ultimo' | 'corrigir_ultimo' | 'recategorizar_ultimo';

export interface ParsedCommand {
  intent: 'command';
  command: CommandType;
  /** Novo valor em centavos, para "corrigir ultimo para X". */
  amountCents?: number;
  /** Nova categoria, para "categoria X" / "corrigir categoria X" (Fase 6). */
  category?: string;
  source?: ParseSource;
}

export interface ParsedUnknown {
  intent: 'unknown';
  source?: ParseSource;
}

export type ParseResult = ParsedTransaction | ParsedQuery | ParsedCommand | ParsedUnknown;
