import 'dotenv/config';
import { z } from 'zod';

/**
 * Parser de booleano a partir de string de ambiente.
 * z.coerce.boolean() trata qualquer string nao-vazia como true (inclusive "false"),
 * entao fazemos o parse explicitamente.
 */
const boolish = z.preprocess((v) => {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'string') return ['1', 'true', 'yes', 'on', 'sim'].includes(v.trim().toLowerCase());
  return false;
}, z.boolean());

const EnvSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3000),

  WEBHOOK_SECRET: z
    .string({ required_error: 'WEBHOOK_SECRET e obrigatorio' })
    .min(8, 'WEBHOOK_SECRET deve ter ao menos 8 caracteres'),

  EVOLUTION_API_URL: z.string().url('EVOLUTION_API_URL deve ser uma URL valida'),
  EVOLUTION_API_KEY: z.string().min(1, 'EVOLUTION_API_KEY e obrigatorio'),
  EVOLUTION_INSTANCE: z.string().min(1, 'EVOLUTION_INSTANCE e obrigatorio'),
  EVOLUTION_SENDTEXT_FORMAT: z.enum(['flat', 'nested']).default('flat'),

  ALLOWED_NUMBERS: z
    .string()
    .min(1, 'ALLOWED_NUMBERS e obrigatorio (ao menos 1 numero)')
    .transform((s) =>
      s
        .split(',')
        .map((n) => n.replace(/\D/g, ''))
        .filter((n) => n.length > 0),
    )
    .refine((arr) => arr.length > 0, 'ALLOWED_NUMBERS nao pode ficar vazio'),

  DATABASE_PATH: z.string().default('./data/financas.db'),
  TZ: z.string().default('America/Sao_Paulo'),

  LLM_ENABLED: boolish.default(false),
  ANTHROPIC_API_KEY: z.string().optional().default(''),
  LLM_MODEL: z.string().default('claude-haiku-4-5'),

  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
    .default('info'),
});

export type Config = z.infer<typeof EnvSchema>;

function loadConfig(): Config {
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.') || '(raiz)'}: ${i.message}`)
      .join('\n');
    // Nunca imprime valores das envs (evita vazar segredos), so os nomes/erros.
    console.error(`\n[config] Configuracao invalida no .env:\n${issues}\n`);
    process.exit(1);
  }
  return parsed.data;
}

export const config = loadConfig();
