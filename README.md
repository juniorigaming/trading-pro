# Trading Journal Pro 📈

Diário de Trading profissional com análise **Smart Money Concepts (SMC)**, gestão de risco e dashboard completo. Baseado em **Next.js + TypeScript + Tailwind CSS + PostgreSQL (Drizzle ORM)**.

![Trading Journal](https://img.shields.io/badge/Next.js-16-black?logo=next.js)
![TypeScript](https://img.shields.io/badge/TypeScript-blue?logo=typescript)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Drizzle-336791?logo=postgresql)

---

## ✨ Funcionalidades

- **Dashboard completo** com saldo, resultado acumulado, Win Rate, Drawdown, Profit Factor, sequências e alertas automáticos
- **Registro de operações** com fluxo em etapas: dados → gestão de risco → contexto SMC → macro & disciplina → resultado & diário
- **Cálculos automáticos**: risco em $, R:R planejado, resultado em R, resultado em %, Win Rate (sem contar BE), Expectancy
- **Gráficos**: evolução do capital, distribuição de R, desempenho por ativo / setup / sessão / dia / horário
- **Calendário de trading** com resultados por dia
- **Análise SMC**: BOS, CHoCH, FVG, Order Block, Breaker, AMD, liquidez, sweep
- **Macroeconomia**: CPI, NFP, FOMC, PCE, GDP, viés macro, impacto
- **Gestão de risco** com limites configuráveis e alertas
- **Screenshot** de cada operação (upload)
- **Exportação CSV** das operações
- **Dados de demonstração** identificados, com opção de remoção em 1 clique
- **Responsivo** (desktop, tablet e celular) — menu lateral encolhível

---

## 🚀 Rodando localmente

### Pré-requisitos
- Node.js 18+
- PostgreSQL (local ou na nuvem — recomendo [Neon](https://neon.tech))

### Passos

```bash
# 1. Clone o repositório
git clone https://github.com/SEU_USUARIO/trading-journal-pro.git
cd trading-journal-pro

# 2. Instale as dependências
npm install

# 3. Configure o ambiente
cp .env.example .env
# edite o .env e coloque sua DATABASE_URL

# 4. Crie as tabelas no banco
npx drizzle-kit push

# 5. Inicie o servidor de desenvolvimento
npm run dev
```

Acesse `http://localhost:3000`.

> 💡 Se quiser dados de exemplo para testar, abra **Configurações → Dados de Demonstração → Carregar**.
> Eles são marcados como `DADOS DE DEMONSTRAÇÃO` e podem ser removidos com 1 clique.

---

## ☁️ Deploy na Vercel + Neon

### 1. Banco de dados (Neon)
1. Crie uma conta em [neon.tech](https://neon.tech)
2. Crie um projeto e anote a **connection string** (ex.: `postgresql://...`)
3. Copie essa URL para as variáveis de ambiente no passo 3

### 2. Aplicação (Vercel)
1. Faça push do projeto para o GitHub (ver abaixo)
2. Em [vercel.com](https://vercel.com), clique em **New Project** e importe o repositório
3. Nas variáveis de ambiente, adicione:
   - `DATABASE_URL` = a connection string do Neon
4. No painel da Vercel, antes do deploy, execute o script de migração (ver passo 3) **ou** crie as tabelas manualmente
5. Clique em **Deploy** 🎉

### 3. Criar as tabelas no banco de produção
Como o banco remoto não pode usar `drizzle-kit push` interativo da máquina local, você tem 3 opções:

**Opção A — Rodar a migração via script:**
```bash
npx drizzle-kit push
```
Isso cria as tabelas usando a `DATABASE_URL` do seu `.env`.

**Opção B — SQL direto (conecte-se ao Neon pelo seu cliente SQL):**
```sql
CREATE TABLE IF NOT EXISTS trades (
  id SERIAL PRIMARY KEY,
  created_at TIMESTAMP DEFAULT now() NOT NULL,
  date TIMESTAMP NOT NULL,
  time TEXT NOT NULL,
  asset TEXT NOT NULL,
  direction TEXT NOT NULL,
  session TEXT NOT NULL,
  session_time_start TEXT,
  session_time_end TEXT,
  timeframe_entry TEXT,
  timeframe_context TEXT,
  setup TEXT,
  entry_price NUMERIC(18,8),
  stop_loss NUMERIC(18,8),
  take_profit NUMERIC(18,8),
  position_size NUMERIC(18,8),
  account_balance_at_trade NUMERIC(18,8),
  risk_percent REAL,
  risk_amount NUMERIC(18,8),
  planned_rr REAL,
  realized_rr REAL,
  result_amount NUMERIC(18,8),
  result_r REAL,
  result_percent REAL,
  result_type TEXT,
  htf_bias TEXT,
  ltf_bias TEXT,
  liquidity_type TEXT,
  liquidity_swept TEXT,
  bos BOOLEAN DEFAULT false,
  choch BOOLEAN DEFAULT false,
  fvg BOOLEAN DEFAULT false,
  order_block BOOLEAN DEFAULT false,
  breaker BOOLEAN DEFAULT false,
  sweep_liquidity BOOLEAN DEFAULT false,
  displacement BOOLEAN DEFAULT false,
  trend_confirmation BOOLEAN DEFAULT false,
  amd BOOLEAN DEFAULT false,
  premium_discount TEXT,
  macro_event TEXT,
  macro_currency TEXT,
  macro_impact TEXT,
  macro_bias TEXT,
  followed_plan BOOLEAN,
  early_entry BOOLEAN DEFAULT false,
  early_exit BOOLEAN DEFAULT false,
  revenge_trade BOOLEAN DEFAULT false,
  fomo BOOLEAN DEFAULT false,
  overtrading BOOLEAN DEFAULT false,
  emotional_before TEXT,
  emotional_after TEXT,
  mistakes TEXT,
  what_went_right TEXT,
  what_went_wrong TEXT,
  lesson TEXT,
  notes TEXT,
  screenshot_url TEXT,
  is_demo BOOLEAN DEFAULT false
);

CREATE TABLE IF NOT EXISTS config (
  id SERIAL PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,
  value TEXT NOT NULL,
  updated_at TIMESTAMP DEFAULT now()
);
```

**Opção C — Criar um script de setup** (ideal para Vercel): adicione no `package.json`

```json
"scripts": {
  "db:push": "drizzle-kit push",
  "postinstall": "drizzle-kit push"
}
```

> ⚠️ **Importante:** Nunca commite o arquivo `.env`. As credenciais ficam apenas nas variáveis de ambiente da Vercel.

---

## 📤 Publicando no GitHub

### Opção 1 — Via terminal (a partir daqui do ambiente)

```bash
# dentro do diretório do projeto
git init
git add .
git commit -m "feat: Trading Journal Pro"
git branch -M main
git remote add origin https://github.com/SEU_USUARIO/trading-journal-pro.git
git push -u origin main
```

### Opção 2 — Baixar o código e subir manualmente

1. Baixe os arquivos do projeto
2. Crie um novo repositório no GitHub (sem arquivos iniciais)
3. No GitHub: **Add file → Upload files** e envie os arquivos (exceto `node_modules`, `.next`, `.env`)
4. Ou use o Git da sua máquina

---

## 🛠 Scripts disponíveis

| Script | Descrição |
|--------|-----------|
| `npm run dev` | Servidor de desenvolvimento |
| `npm run build` | Build de produção |
| `npm start` | Servidor de produção |
| `npx drizzle-kit push` | Aplica o schema no banco (Drizzle) |
| `npm run lint` | Lint |
| `npm run typecheck` | Checagem de tipos |

---

## 🗂 Estrutura do projeto

```
src/
├── app/                 # Páginas e rotas da API (App Router)
│   ├── api/
│   │   ├── trades/      # CRUD de operações
│   │   ├── trades/[id]/
│   │   ├── trades/demo/ # Dados de demonstração
│   │   ├── config/      # Configurações
│   │   └── health/      # Health check
│   ├── operacoes/       # Lista, nova operação, edição, detalhes
│   ├── calendario/      # Calendário de trading
│   ├── analises/        # Análises de performance
│   ├── risco/           # Gestão de risco
│   ├── setup/           # Setup / Estratégia SMC
│   ├── macro/           # Macroeconomia
│   └── configuracoes/   # Configurações
├── components/          # Componentes reutilizáveis
├── db/                  # Drizzle: schema + conexão
├── hooks/               # Hooks de dados (API)
├── lib/                 # Cálculos, tipos, utilitários
└── ...
```

---

## 📄 Licença

Este projeto é para uso pessoal de estudo e acompanhamento de trading. **Não** é recomendação de investimento.
