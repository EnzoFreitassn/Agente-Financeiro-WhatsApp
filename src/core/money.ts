/**
 * Helpers de dinheiro. Regra de ouro: dinheiro SEMPRE em centavos (inteiro).
 * Nunca usar float para armazenar/transportar valores monetarios.
 */

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

/** Formata centavos como moeda BR. Ex.: 123456 -> "R$ 1.234,56". */
export function formatBRL(cents: number): string {
  return brl.format(cents / 100);
}

/** Converte um numero em reais para centavos (arredondando). Ex.: 50.9 -> 5090. */
export function reaisToCents(reais: number): number {
  return Math.round(reais * 100);
}

/**
 * Interpreta uma string de valor em centavos (magnitude, sempre >= 0).
 * Aceita formatos BR e internacionais:
 *   "50" -> 5000 | "50,90" -> 5090 | "50.90" -> 5090
 *   "1.234,56" -> 123456 | "1,234.56" -> 123456 | "R$ 1.200" -> 120000
 * Sinais +/- sao ignorados (a INTENCAO despesa/receita e decidida pelo parser).
 * @returns centavos (inteiro >= 0) ou null se nao for um valor valido.
 */
export function parseAmountToCents(raw: string): number | null {
  if (typeof raw !== 'string') return null;

  let s = raw.toLowerCase().replace(/r\$/g, '');
  s = s.replace(/[^0-9.,]/g, ''); // remove espacos, sinais, letras
  if (!s) return null;

  const hasDot = s.includes('.');
  const hasComma = s.includes(',');
  let normalized: string;

  if (hasDot && hasComma) {
    // O ultimo separador que aparece e o decimal.
    normalized =
      s.lastIndexOf(',') > s.lastIndexOf('.')
        ? s.replace(/\./g, '').replace(',', '.') // vírgula decimal, ponto milhar (BR)
        : s.replace(/,/g, ''); // ponto decimal, vírgula milhar (EN)
  } else if (hasComma) {
    const parts = s.split(',');
    const dec = parts[parts.length - 1]!;
    normalized = parts.length === 2 && dec.length <= 2 ? `${parts[0]}.${dec}` : s.replace(/,/g, '');
  } else if (hasDot) {
    const parts = s.split('.');
    const dec = parts[parts.length - 1]!;
    // "50.90" -> decimal | "1.234" / "1.234.567" -> milhar
    normalized = parts.length === 2 && dec.length <= 2 ? `${parts[0]}.${dec}` : s.replace(/\./g, '');
  } else {
    normalized = s;
  }

  const value = Number(normalized);
  if (!Number.isFinite(value) || value < 0) return null;

  const cents = Math.round(value * 100);
  if (!Number.isSafeInteger(cents)) return null;
  return cents;
}
