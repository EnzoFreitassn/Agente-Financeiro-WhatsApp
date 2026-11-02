# Agente Financeiro no WhatsApp

Agente financeiro pessoal via WhatsApp. Você manda mensagens em linguagem natural
("gastei 50 no mercado", "quanto gastei esse mês?") e o bot registra receitas/despesas,
categoriza e responde. Gateway: **Evolution API v2** (self-hosted). Uso **pessoal**,
moeda **BRL**, timezone **America/Sao_Paulo**, idioma **pt-BR**.

> **Status:** Fase 1 (esqueleto ponta-a-ponta). O bot recebe mensagens via webhook,
> valida segredo + whitelist + idempotência e responde com *echo* da mensagem.
> As próximas fases (banco, parser, consultas, LLM, extras, testes) vêm a seguir.

## Stack

Node 20+ / TypeScript · Fastify · SQLite (better-sqlite3) · Zod · pino · vitest ·
Evolution API v2 (WhatsApp) · Claude Haiku (opcional, Fase 5).

## Pré-requisitos

- Node.js 20+ (testado no 22).
- Docker (para subir a Evolution API).
- Um número de WhatsApp dedicado ao bot.

## 1. Subir a Evolution API (Docker)

A Evolution API é o gateway que conversa com o WhatsApp. Exemplo mínimo:

```bash
docker run -d \
  --name evolution-api \
  -p 8080:8080 \
  -e AUTHENTICATION_API_KEY="UMA_CHAVE_GLOBAL_FORTE" \
  -v evolution_instances:/evolution/instances \
  atendai/evolution-api:v2.1.1
```

> Confira a versão/imagem atual no projeto oficial da Evolution API. Guarde a
> `AUTHENTICATION_API_KEY` — é a `EVOLUTION_API_KEY` do `.env`.

### Criar a instância e conectar o número (QR)

1. Crie a instância (nome deve bater com `EVOLUTION_INSTANCE`):
   ```bash
   curl -X POST http://localhost:8080/instance/create \
     -H "apikey: UMA_CHAVE_GLOBAL_FORTE" \
     -H "Content-Type: application/json" \
     -d '{"instanceName":"financas","integration":"WHATSAPP-BAILEYS"}'
   ```
2. Pegue o QR code e escaneie no WhatsApp (Aparelhos conectados):
   ```bash
   curl http://localhost:8080/instance/connect/financas \
     -H "apikey: UMA_CHAVE_GLOBAL_FORTE"
   ```
   (Retorna um QR em base64 — abra num visualizador ou use o Manager web da Evolution.)

## 2. Configurar o bot

```bash
npm install
cp .env.example .env   # no PowerShell: Copy-Item .env.example .env
```

Edite o `.env`:

- `WEBHOOK_SECRET` — segredo forte; vai no caminho da URL do webhook.
- `EVOLUTION_API_URL` — ex.: `http://localhost:8080`.
- `EVOLUTION_API_KEY` — a chave da Evolution.
- `EVOLUTION_INSTANCE` — ex.: `financas`.
- `ALLOWED_NUMBERS` — seu número com DDI, ex.: `5585999999999`.

## 3. Apontar o webhook da Evolution para o bot

Configure o webhook da instância para o endpoint do bot (inclua o segredo no caminho):

```bash
curl -X POST http://localhost:8080/webhook/instance \
  -H "apikey: UMA_CHAVE_GLOBAL_FORTE" \
  -H "Content-Type: application/json" \
  -d '{
    "enabled": true,
    "url": "http://SEU_HOST:3000/webhook/O_SEU_WEBHOOK_SECRET",
    "webhook_by_events": false,
    "events": ["MESSAGES_UPSERT"]
  }'
```

> Se a Evolution e o bot estão em máquinas/containers diferentes, use o host/IP
> acessível a partir do container da Evolution (não `localhost`).
>
> Com `webhook_by_events: true`, a Evolution anexa o nome do evento à URL
> (`.../messages-upsert`). O bot aceita os dois formatos.

## 4. Rodar

```bash
npm run dev     # desenvolvimento (reload automático)
# ou
npm run build && npm start   # produção
```

Teste rápido sem WhatsApp:

```bash
curl http://localhost:3000/health
```

Mande uma mensagem de texto do seu número (o que está em `ALLOWED_NUMBERS`) para o
número do bot. Você deve receber de volta `echo: <sua mensagem>`.

## Segurança (Fase 1)

- **Whitelist**: só números em `ALLOWED_NUMBERS` são atendidos (com tolerância ao 9º
  dígito de celular BR). Outros remetentes são ignorados em silêncio.
- **Segredo no webhook**: endpoint só responde no caminho com `WEBHOOK_SECRET` correto.
- **Idempotência**: `messageId` já processado nunca é tratado de novo (tabela
  `processed_messages`).
- Segredos (`apikey`, `ANTHROPIC_API_KEY`) nunca são logados (redaction no pino).

## Solução de problemas

- **Envio falha com erro tipo `reading 'textMessage'`**: troque
  `EVOLUTION_SENDTEXT_FORMAT=flat` para `nested` no `.env`.
- **Não recebe nada**: confira se a instância está `open` (conectada) e se a URL do
  webhook é acessível a partir do container da Evolution.

## Scripts

| Comando | O que faz |
| --- | --- |
| `npm run dev` | Sobe o servidor com reload (tsx). |
| `npm run build` | Compila TypeScript para `dist/`. |
| `npm start` | Roda o build de produção. |
| `npm run typecheck` | Checagem de tipos sem emitir. |
| `npm test` | Testes (vitest) — a partir da Fase 7. |
