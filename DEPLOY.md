# Deploy — Agente Financeiro no WhatsApp

Guia para subir o bot na VPS e fechar o **round-trip real** contra a sua Evolution API
(que já está no ar — **nada aqui mexe nela**). Escolha **uma** das formas: **(A)** direto no
host ou **(B)** em Docker na mesma rede da Evolution.

> Pré-requisitos: a Evolution API v2 já rodando, com uma instância chamada `financas`
> **conectada** (QR escaneado). Você precisa da `apikey` da Evolution e do seu número
> de WhatsApp.

---

## 1. O `.env` de produção (comentado)

Crie um arquivo `.env` na raiz do projeto (a partir do `.env.example`). Vale para as duas
formas — só muda o `EVOLUTION_API_URL` (veja as notas em cada opção).

```dotenv
# ===== Servidor =====
PORT=3000
# Segredo que protege o webhook (>= 8 caracteres). Gere um forte, ex.: openssl rand -hex 24
WEBHOOK_SECRET=troque-por-um-segredo-bem-grande-e-aleatorio

# ===== Evolution API =====
# (A) host:   http://localhost:8080
# (B) docker: http://<NOME_DO_CONTAINER_DA_EVOLUTION>:8080  (ex.: http://evolution-api:8080)
EVOLUTION_API_URL=http://localhost:8080
EVOLUTION_API_KEY=coloque-a-apikey-da-evolution-aqui
EVOLUTION_INSTANCE=financas
# Formato do corpo do sendText. Comece em "flat"; se o envio falhar com erro de
# "textMessage", troque para "nested" (ver troubleshooting).
EVOLUTION_SENDTEXT_FORMAT=flat

# ===== Segurança =====
# Seu número: 55 (Brasil) + DDD + 9 + número. Ex.: Fortaleza (85) -> 5585912345678
# Lista separada por vírgula se precisar de mais de um.
ALLOWED_NUMBERS=5585912345678

# ===== Banco =====
DATABASE_PATH=./data/financas.db

# ===== Localização =====
TZ=America/Sao_Paulo

# ===== LLM (desligado — parser por regras só) =====
LLM_ENABLED=false
ANTHROPIC_API_KEY=
LLM_MODEL=claude-haiku-4-5

# ===== Logs =====
LOG_LEVEL=info
```

> **9º dígito (importante):** a whitelist já tolera a ausência/presença do `9` de celular,
> mas cadastre no formato completo `55 + DDD + 9 + número` para evitar dúvida.

---

## Opção A — Rodar direto no host

Use quando o bot vai rodar como processo Node no próprio host da VPS.

```bash
# 1. Clonar e entrar
git clone <URL_DO_SEU_REPO> agente-financeiro
cd agente-financeiro

# 2. Instalar dependências (exatamente o lockfile) e compilar
npm ci
npm run build

# 3. Criar o .env de produção (seção 1 acima) e conferir
cp .env.example .env
nano .env         # preencha os valores

# 4. Subir
npm start
# Deve logar: "agente financeiro no ar" e "Server listening ..."
```

Teste local rápido: `curl http://localhost:3000/health` → `{"status":"ok",...}`.

**Manter no ar** (recomendado — escolha um):
```bash
# pm2
npm i -g pm2
pm2 start dist/server.js --name financas-bot
pm2 save && pm2 startup
```

### Qual URL usar no webhook (opção A)

Depende de onde a **Evolution** está:

- **Evolution também no host (sem Docker):** `http://localhost:3000/webhook`
- **Evolution em Docker, bot no host:** o container da Evolution **não** enxerga o
  `localhost` do host. Use **uma** destas:
  - o IP da bridge do Docker no host: `http://172.17.0.1:3000/webhook`
    (confirme com `ip addr show docker0`), **ou**
  - o IP de rede da VPS: `http://<IP_DA_VPS>:3000/webhook`
    (se for IP público, **proteja a porta 3000 no firewall** — libere só para a Evolution).

> Se a Evolution está em Docker, a **Opção B é mais simples e segura** (não expõe porta).

---

## Opção B — Docker, na mesma rede da Evolution

O bot sobe num container e entra na **rede Docker que a Evolution já usa**, para os dois
se falarem pelo **nome do container** — sem publicar porta na internet.

### B.1 Descobrir o nome da rede e do container da Evolution

```bash
# Ache o container da Evolution (coluna NAMES):
docker ps

# Descubra a(s) rede(s) desse container (troque <evolution> pelo NAME de cima):
docker inspect <evolution> --format '{{range $k,$v := .NetworkSettings.Networks}}{{println $k}}{{end}}'

# (alternativa) listar todas as redes:
docker network ls
```

Anote dois valores:
- **nome da rede** (ex.: `evolution_default` ou `evolution-api_default`) → vai no `docker-compose.yml`;
- **nome do container da Evolution** (ex.: `evolution-api`) → vira o host do `EVOLUTION_API_URL`.

### B.2 Ajustar os arquivos

1. No **`.env`**, aponte o bot para a Evolution pelo nome do container dela:
   ```dotenv
   EVOLUTION_API_URL=http://evolution-api:8080   # troque pelo nome real + porta interna
   ```
2. No **`docker-compose.yml`**, troque `<NOME_DA_REDE_DA_EVOLUTION>` pela rede descoberta em B.1.

### B.3 Subir o bot (sem tocar na Evolution)

```bash
docker compose build
docker compose up -d
docker compose logs -f bot      # acompanhe o startup e, depois, as mensagens
```

Para atualizar depois de um `git pull`:
```bash
docker compose up -d --build
```

### B.4 Qual URL usar no webhook (opção B)

Como Evolution e bot estão na mesma rede, a Evolution alcança o bot pelo **nome do
container do bot** (`financas-bot`, definido no compose) e pela porta **interna** 3000:

```
http://financas-bot:3000/webhook
```

(Não precisa publicar porta nem usar IP.)

---

## 2. Registrar o webhook na Evolution

Rode a partir de um lugar que alcance a Evolution (o host da VPS costuma alcançar a porta
publicada `8080`). Preencha as variáveis e **use a URL correta** da sua opção (A ou B).

```bash
EVOLUTION_API_URL="http://localhost:8080"          # como VOCÊ alcança a Evolution p/ configurar
EVOLUTION_API_KEY="SUA_APIKEY_DA_EVOLUTION"
WEBHOOK_SECRET="O_MESMO_WEBHOOK_SECRET_DO_ENV"
# URL que a EVOLUTION usará para chamar o bot:
#   A) host:   http://172.17.0.1:3000/webhook  (ou http://IP_DA_VPS:3000/webhook)
#   B) docker: http://financas-bot:3000/webhook
BOT_WEBHOOK_URL="http://financas-bot:3000/webhook"

curl -X POST "$EVOLUTION_API_URL/webhook/set/financas" \
  -H "apikey: $EVOLUTION_API_KEY" \
  -H "Content-Type: application/json" \
  -d "{
    \"enabled\": true,
    \"url\": \"$BOT_WEBHOOK_URL\",
    \"events\": [\"MESSAGES_UPSERT\"],
    \"headers\": { \"X-Webhook-Token\": \"$WEBHOOK_SECRET\" }
  }"
```

Confirme que ficou gravado:
```bash
curl "$EVOLUTION_API_URL/webhook/find/financas" -H "apikey: $EVOLUTION_API_KEY"
```
Deve retornar `enabled: true`, a sua `url` e `MESSAGES_UPSERT` nos eventos.

> **Se o `webhook/set` acima der erro de validação** (as versões da v2 divergem), tente,
> nesta ordem, as variações de corpo/rota — só o "envelope" muda, os campos são os mesmos:
>
> 1. Corpo aninhado em `webhook`:
>    ```json
>    { "webhook": { "enabled": true, "url": "...", "events": ["MESSAGES_UPSERT"], "headers": { "X-Webhook-Token": "..." } } }
>    ```
> 2. Rota alternativa `POST /webhook/instance/financas` (mesmo corpo).
>
> **Se a sua build não repassar o header** `X-Webhook-Token` (o teste abaixo volta como
> "não autorizado" nos logs), use o segredo no **path** em vez do header — o bot aceita os dois:
> `url: "http://financas-bot:3000/webhook/O_SEU_WEBHOOK_SECRET"` e remova o bloco `headers`.

---

## 3. Teste de round-trip

Do **seu WhatsApp** (o número em `ALLOWED_NUMBERS`), mande para o número do bot:

| Você manda | Resposta esperada |
| --- | --- |
| `gastei 50 no mercado` | `✅ R$ 50,00 · mercado · DD/MM` (a data de hoje) |
| `recebi 2000 de salário` | `✅ Recebido R$ 2.000,00 · outros · DD/MM` |
| `saldo` | `💰 Saldo de <mês>: R$ 1.950,00` + receitas/despesas |
| `relatório` | resumo do mês com categorias, % e comparação |
| `ajuda` | menu com exemplos |

Se a primeira confirmação voltar, o ciclo **webhook → parser → banco → resposta** está fechado. 🎉

### Checklist de debug (se não voltar)

Siga nesta ordem:

1. **Instância conectada?**
   ```bash
   curl "$EVOLUTION_API_URL/instance/connectionState/financas" -H "apikey: $EVOLUTION_API_KEY"
   ```
   Tem que estar `open`. Se não, reconecte o QR na Evolution.

2. **Webhook apontado certo?**
   ```bash
   curl "$EVOLUTION_API_URL/webhook/find/financas" -H "apikey: $EVOLUTION_API_KEY"
   ```
   Confira a `url` (nome do container na opção B; IP acessível na opção A) e o evento
   `MESSAGES_UPSERT`.

3. **Logs do bot** (`docker compose logs -f bot`, ou a saída do `npm start`/`pm2 logs`):
   - **nada aparece** ao mandar mensagem → a Evolution não está entregando: a `url` do
     webhook não é alcançável a partir do container da Evolution (erro mais comum na opção A
     com `localhost`; na opção B confira se o bot está na **mesma rede**).
   - `webhook nao autorizado — 404` → segredo não bateu. Confira `X-Webhook-Token` ==
     `WEBHOOK_SECRET`; ou use o segredo no path (ver nota da seção 2).
   - `remetente fora da whitelist` → seu número não está em `ALLOWED_NUMBERS` (confira DDI/9º dígito).
   - `mensagem recebida` mas **sem resposta** → o bot recebeu mas falhou ao enviar; veja o próximo item.

4. **Falha no envio** (log `falha ao enviar texto` com `status`/`detail`):
   - `status: 401` → `EVOLUTION_API_KEY` errada.
   - `status: 404` → `EVOLUTION_INSTANCE` errada (tem que ser `financas`).
   - `ECONNREFUSED` / erro de rede → `EVOLUTION_API_URL` errada (na opção B use o **nome do
     container** da Evolution, não `localhost`).
   - `status: 400/500` mencionando **`textMessage`** → sua versão espera o corpo aninhado:
     troque no `.env` para `EVOLUTION_SENDTEXT_FORMAT=nested` e reinicie o bot
     (`docker compose up -d` ou reinicie o processo).

5. **Teste o envio isolado** (confirma o formato do corpo da sua versão):
   ```bash
   curl -X POST "$EVOLUTION_API_URL/message/sendText/financas" \
     -H "apikey: $EVOLUTION_API_KEY" -H "Content-Type: application/json" \
     -d '{"number":"5585912345678","text":"teste"}'
   ```
   Se der erro de `textMessage`, use o corpo aninhado e ponha `EVOLUTION_SENDTEXT_FORMAT=nested`:
   ```json
   { "number": "5585912345678", "textMessage": { "text": "teste" } }
   ```

---

## Notas de segurança

- Mantenha a porta 3000 **fora da internet**. Na opção B isso é automático (rede interna);
  na opção A, se usar IP público, libere a porta só para a Evolution no firewall.
- `WEBHOOK_SECRET` forte e o mesmo nos dois lados (webhook e `.env`).
- `.env` **não** vai para o git nem para a imagem Docker (já está no `.gitignore`/`.dockerignore`).
- Segredos (`apikey`, `WEBHOOK_SECRET`) nunca são logados (redaction ativa).
