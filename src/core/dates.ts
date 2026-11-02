import { DateTime } from 'luxon';

/**
 * Tudo ancorado em America/Sao_Paulo, SEM depender de process.env.TZ.
 * Assim "ontem"/"dia 5" e a data do gasto nao mudam conforme o host.
 */
export const ZONE = 'America/Sao_Paulo';

/** Agora, no fuso de SP. */
export function now(): DateTime {
  return DateTime.now().setZone(ZONE);
}

/** ISO completo com offset de SP (para created_at / occurred_at de hoje). */
export function nowISO(): string {
  return now().toISO()!;
}

/** Data de hoje em SP, "YYYY-MM-DD". */
export function todayISODate(): string {
  return now().toISODate()!;
}

/** Limites [inicio, fim] do mes de `ref` (em SP). */
export function monthRange(ref: DateTime = now()): { start: DateTime; end: DateTime } {
  return { start: ref.startOf('month'), end: ref.endOf('month') };
}

/** Limites do mes anterior ao de `ref`. */
export function prevMonthRange(ref: DateTime = now()): { start: DateTime; end: DateTime } {
  return monthRange(ref.minus({ months: 1 }));
}

/** Nome do mes em pt-BR, ex.: "outubro de 2026". */
export function monthLabel(ref: DateTime = now()): string {
  return ref.setLocale('pt-BR').toFormat("LLLL 'de' yyyy");
}

/**
 * Formata um ISO como data curta pt-BR: "dd/MM" (ou "dd/MM/yyyy" se for de outro ano),
 * usada na confirmacao para o usuario conferir a data inferida.
 */
export function formatShortDate(iso: string, ref: DateTime = now()): string {
  const dt = DateTime.fromISO(iso, { zone: ZONE });
  if (!dt.isValid) return iso;
  return dt.year === ref.year ? dt.toFormat('dd/MM') : dt.toFormat('dd/MM/yyyy');
}

const WEEKDAYS: Record<string, number> = {
  segunda: 1, seg: 1,
  terca: 2, 'terça': 2, ter: 2,
  quarta: 3, qua: 3,
  quinta: 4, qui: 4,
  sexta: 5, sex: 5,
  sabado: 6, 'sábado': 6, sab: 6,
  domingo: 7, dom: 7,
};

/**
 * Resolve uma expressao de data relativa/curta para um DateTime (em SP), ou null.
 * Entende: "hoje", "ontem", "anteontem", "amanha", "dia N", "dd/mm[/aaaa]",
 * e nomes de dias da semana (ultima ocorrencia, incluindo hoje).
 */
export function resolveDateExpression(text: string, ref: DateTime = now()): DateTime | null {
  const t = text.trim().toLowerCase();
  if (!t || t === 'hoje') return ref;
  if (t === 'ontem') return ref.minus({ days: 1 });
  if (t === 'anteontem') return ref.minus({ days: 2 });
  if (t === 'amanha' || t === 'amanhã') return ref.plus({ days: 1 });

  // dd/mm ou dd/mm/aaaa
  const dm = t.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/);
  if (dm) {
    const day = Number(dm[1]);
    const month = Number(dm[2]);
    let year = dm[3] ? Number(dm[3]) : ref.year;
    if (dm[3] && dm[3].length === 2) year += 2000;
    const dt = DateTime.fromObject({ year, month, day }, { zone: ZONE });
    if (!dt.isValid) return null;
    // Sem ano informado e data no futuro -> provavelmente foi no ano passado.
    if (!dm[3] && dt > ref) return dt.minus({ years: 1 });
    return dt;
  }

  // "dia N"
  const dia = t.match(/^dia\s+(\d{1,2})$/);
  if (dia) {
    const day = Number(dia[1]);
    let dt = ref.set({ day });
    if (!dt.isValid) return null;
    // Se o dia ainda nao chegou neste mes, assume mes anterior.
    if (day > ref.day) dt = ref.minus({ months: 1 }).set({ day });
    return dt.isValid ? dt : null;
  }

  // Dia da semana -> ultima ocorrencia (incluindo hoje).
  const wd = WEEKDAYS[t];
  if (wd) {
    const diff = (ref.weekday - wd + 7) % 7;
    return ref.minus({ days: diff });
  }

  return null;
}

/**
 * Resolve a data/hora do gasto (occurred_at) em ISO com offset de SP.
 * - Sem expressao ou expressao invalida -> agora.
 * - "hoje" -> agora (com hora atual).
 * - Data passada -> aquele dia ao meio-dia local (evita bordas de meia-noite).
 */
export function resolveOccurredAt(dateText: string | undefined, ref: DateTime = now()): string {
  if (!dateText) return ref.toISO()!;
  const dt = resolveDateExpression(dateText, ref);
  if (!dt) return ref.toISO()!;
  if (dt.hasSame(ref, 'day')) return ref.toISO()!;
  return dt.set({ hour: 12, minute: 0, second: 0, millisecond: 0 }).toISO()!;
}
