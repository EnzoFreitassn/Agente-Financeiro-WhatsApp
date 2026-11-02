import { totalByTypeInRange, totalsByCategoryInRange, listRecent } from '../db/transactions';
import { formatBRL } from './money';
import { now, monthRange, prevMonthRange, monthLabel, formatShortDate } from './dates';
import { categoryEmoji } from './categories';

/** % inteiro de `part` sobre `total` (0 se total == 0). */
function pct(part: number, total: number): number {
  return total > 0 ? Math.round((part / total) * 100) : 0;
}

function cat(name: string): string {
  const e = categoryEmoji(name);
  return e ? `${e} ${name}` : name;
}

function monthIso(ref = now()): { s: string; e: string } {
  const { start, end } = monthRange(ref);
  return { s: start.toISO()!, e: end.toISO()! };
}

/** "saldo" — receitas - despesas do mes atual. */
export function saldoDoMes(): string {
  const { s, e } = monthIso();
  const receitas = totalByTypeInRange('income', s, e);
  const despesas = totalByTypeInRange('expense', s, e);
  return [
    `💰 Saldo de ${monthLabel()}: ${formatBRL(receitas - despesas)}`,
    `📥 Receitas: ${formatBRL(receitas)}   📤 Despesas: ${formatBRL(despesas)}`,
  ].join('\n');
}

/** "quanto gastei esse mês" — total + top categorias. */
export function gastosDoMes(): string {
  const { s, e } = monthIso();
  const cats = totalsByCategoryInRange('expense', s, e);
  const total = cats.reduce((a, c) => a + c.total, 0);
  if (total === 0) return `Você ainda não registrou gastos em ${monthLabel()}. 🙂`;

  const top = cats.slice(0, 5).map((c) => `${cat(c.category)}: ${formatBRL(c.total)} (${pct(c.total, total)}%)`);
  return [`📤 Gasto em ${monthLabel()}: ${formatBRL(total)}`, '', 'Top categorias:', ...top].join('\n');
}

/** "quanto gastei com X" — total de uma categoria no mes atual. */
export function gastosPorCategoria(category: string): string {
  const { s, e } = monthIso();
  const row = totalsByCategoryInRange('expense', s, e).find((r) => r.category === category);
  if (!row || row.total === 0) return `Nenhum gasto em ${cat(category)} em ${monthLabel()}.`;
  return `${cat(category)} em ${monthLabel()}: ${formatBRL(row.total)}\n(${row.count} lançamento${row.count > 1 ? 's' : ''})`;
}

/** "extrato" / "últimos" — últimas 10 transações. */
export function extrato(): string {
  const rows = listRecent(10);
  if (rows.length === 0) return 'Nenhuma transação registrada ainda. 🙂';
  const lines = rows.map((r) => {
    const arrow = r.type === 'expense' ? '📤' : '📥';
    return `${formatShortDate(r.occurred_at)} ${arrow} ${formatBRL(r.amount_cents)} · ${r.category}`;
  });
  return ['🧾 Últimas transações:', ...lines].join('\n');
}

/** "relatório" — resumo do mês com categorias (%) e comparação com o mês anterior. */
export function relatorioMensal(): string {
  const curRef = now();
  const prevRef = curRef.minus({ months: 1 });
  const cur = monthIso(curRef);
  const prev = (() => {
    const { start, end } = prevMonthRange(curRef);
    return { s: start.toISO()!, e: end.toISO()! };
  })();

  const receitas = totalByTypeInRange('income', cur.s, cur.e);
  const despesas = totalByTypeInRange('expense', cur.s, cur.e);
  const prevDespesas = totalByTypeInRange('expense', prev.s, prev.e);

  const out: string[] = [
    `📊 Relatório de ${monthLabel(curRef)}`,
    '',
    `📥 Recebido: ${formatBRL(receitas)}`,
    `📤 Gasto: ${formatBRL(despesas)}`,
    `💰 Saldo: ${formatBRL(receitas - despesas)}`,
  ];

  const cats = totalsByCategoryInRange('expense', cur.s, cur.e);
  if (cats.length > 0) {
    out.push('', 'Gastos por categoria:');
    for (const c of cats) out.push(`${cat(c.category)}: ${formatBRL(c.total)} (${pct(c.total, despesas)}%)`);
  }

  // Comparação de gastos com o mês anterior (variação absoluta e %).
  const diff = despesas - prevDespesas;
  const arrow = diff > 0 ? '📈' : diff < 0 ? '📉' : '➡️';
  const sign = diff >= 0 ? '+' : '-';
  let tail: string;
  if (prevDespesas > 0) {
    tail = `${sign}${formatBRL(Math.abs(diff))} (${sign}${Math.round((Math.abs(diff) / prevDespesas) * 100)}%)`;
  } else if (despesas > 0) {
    tail = `${sign}${formatBRL(Math.abs(diff))} (sem base no mês anterior)`;
  } else {
    tail = 'sem movimento';
  }
  out.push('', `vs. ${monthLabel(prevRef)} — gasto: ${arrow} ${tail}`);

  return out.join('\n');
}
