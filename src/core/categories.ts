import { db } from '../db';

/** Categorias canonicas (com acento). */
export const CATEGORY_NAMES = [
  'alimentação',
  'transporte',
  'moradia',
  'lazer',
  'saúde',
  'educação',
  'assinaturas',
  'mercado',
  'outros',
] as const;

export type CategoryName = (typeof CATEGORY_NAMES)[number];

/** minuscula + sem acento, para casar com o que o usuario digita. */
function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

/**
 * Palavras-chave -> categoria canonica. Padroes SEM acento (o texto e normalizado
 * antes de testar). Ordem importa: o primeiro match vence (streaming antes de lazer,
 * por isso 'assinaturas' vem cedo).
 */
const KEYWORDS: ReadonlyArray<readonly [RegExp, CategoryName]> = [
  [/\b(mercado|supermercado|feira|hortifruti|atacadao|sacolao|quitanda)\b/, 'mercado'],
  [/\b(assinatura|assinaturas|netflix|spotify|prime|disney|hbo|max|youtube|icloud|chatgpt|plano)\b/, 'assinaturas'],
  [/\b(uber|99|taxi|onibus|busao|metro|gasolina|combustivel|alcool|estacionamento|pedagio|passagem|brt|bike)\b/, 'transporte'],
  [/\b(aluguel|condominio|luz|energia|agua|gas|internet|wifi|iptu)\b/, 'moradia'],
  [/\b(farmacia|remedio|medico|consulta|exame|dentista|hospital|academia|psicologo|terapia|plano de saude)\b/, 'saúde'],
  [/\b(curso|faculdade|escola|livro|mensalidade|aula|udemy|alura|apostila|material escolar)\b/, 'educação'],
  [/\b(ifood|rappi|restaurante|lanche|lanchonete|almoco|janta|jantar|comida|padaria|cafe|pizza|hamburguer|acai|marmita|sushi|bar)\b/, 'alimentação'],
  [/\b(cinema|jogo|game|show|viagem|passeio|parque|balada|festa|role|boliche|netflix)\b/, 'lazer'],
];

/**
 * Infere a categoria a partir de um texto livre.
 * 1) nome de categoria citado explicitamente; 2) palavra-chave; 3) 'outros'.
 */
export function inferCategory(text: string): CategoryName {
  const t = norm(text);

  for (const name of CATEGORY_NAMES) {
    if (name === 'outros') continue;
    if (new RegExp(`\\b${norm(name)}\\b`).test(t)) return name;
  }
  for (const [re, cat] of KEYWORDS) {
    if (re.test(t)) return cat;
  }
  return 'outros';
}

const emojiStmt = db.prepare('SELECT emoji FROM categories WHERE name = ?');

/** Emoji cadastrado para a categoria (vazio se nao houver). */
export function categoryEmoji(name: string): string {
  const row = emojiStmt.get(name) as { emoji?: string } | undefined;
  return row?.emoji ?? '';
}
