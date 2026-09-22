# Renault Geely — Sistema de Gestão e Análise Jurídica

Sistema web corporativo que recebe as planilhas enviadas pelos escritórios de advocacia,
interpreta e padroniza os dados automaticamente, grava tudo em banco e apresenta os
indicadores em dashboards gerenciais.

| Camada | Tecnologia |
|---|---|
| Front-end | React 19 + TypeScript + Vite + Tailwind CSS v4 + Recharts |
| Back-end | Python 3.11 + FastAPI + SQLAlchemy 2 + pandas |
| Banco | PostgreSQL 16 |
| Exportação | XLSX (XlsxWriter) e PDF (ReportLab) |

---

## 1. Subindo o sistema

### Opção A — Docker (recomendado, sobe tudo de uma vez)

```bash
docker compose up --build
```

Depois, com os contêineres no ar, rode a carga inicial (usuários + planilha de exemplo):

```bash
docker compose exec api python -m app.seed
```

| Serviço | Endereço |
|---|---|
| Front-end | http://localhost:8080 |
| API | http://localhost:8000 |
| Documentação da API (Swagger) | http://localhost:8000/docs |
| PostgreSQL | localhost:5432 (usuário/senha: `juridico`) |

### Opção B — Rodando local, sem Docker

**1. Banco:** tenha um PostgreSQL rodando e crie o banco:

```sql
CREATE USER juridico WITH PASSWORD 'juridico';
CREATE DATABASE juridico OWNER juridico;
```

**2. Back-end:**

```bash
cd backend
python -m venv .venv && source .venv/bin/activate    # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env                                  # ajuste a DATABASE_URL se precisar
python -m app.seed                                    # cria tabelas, usuários e importa a planilha de exemplo
uvicorn app.main:app --reload
```

**3. Front-end** (em outro terminal):

```bash
cd frontend
npm install
cp .env.example .env
npm run dev
```

Front em http://localhost:5173 e API em http://localhost:8000.

### Usuários criados pelo seed

Todos com a senha **`renault@2026`** (troque antes de qualquer uso real):

| E-mail | Perfil | O que pode fazer |
|---|---|---|
| ana.costa@renaultgeely.com.br | Administrador | Tudo, incluindo gestão de usuários |
| pedro.alves@renaultgeely.com.br | Gestor | Tudo, menos criar/editar usuários |
| carlos.lima@renaultgeely.com.br | Analista | Importar planilhas e editar processos |
| fernanda.rocha@renaultgeely.com.br | Analista | Importar planilhas e editar processos |
| ricardo.mendes@renaultgeely.com.br | Visualizador | Somente leitura |

---

## 2. O fluxo principal

```
Login → Dashboard → Importar planilha → Pré-visualização → Processamento
      → Inconsistências → Dashboard atualizado → Processos → Detalhe
      → Relatórios → Exportar Excel/PDF
```

Duas planilhas de apoio ficam em `docs/`:

| Arquivo | Para que serve |
|---|---|
| `modelo-planilha-importacao.xlsx` | **Modelo para enviar aos escritórios.** Cabeçalho correto, listas suspensas, 7 linhas de exemplo (em amarelo, para apagar) e uma aba "Como preencher" |
| `planilha-modelo.xlsx` | Massa de teste gerada pelo seed, com linhas problemáticas de propósito para exercitar a tela de inconsistências |
| `modelo-pagamentos-juridico.xlsx` | Planilha de pagamentos do Jurídico com o layout real (10 abas, fórmulas) e dados fictícios — ver seção 5 |

Para gerar o modelo novamente: `python scripts/gerar_modelo_planilha.py` (dentro de `backend/`).

---

## 3. Estrutura do projeto

```
renault-juridico/
├── docker-compose.yml
├── backend/
│   ├── app/
│   │   ├── main.py              # aplicação FastAPI e registro das rotas
│   │   ├── core/                # configuração, conexão com o banco, JWT e hash de senha
│   │   ├── models/              # tabelas (SQLAlchemy): processo, usuário, importação...
│   │   ├── schemas/             # contratos de entrada/saída (Pydantic)
│   │   ├── api/                 # rotas: auth, processos, dashboard, importações, análises...
│   │   ├── services/
│   │   │   ├── normalizacao.py  # traduz a planilha para o padrão do sistema
│   │   │   ├── planilha.py      # motor de importação (as 7 etapas)
│   │   │   ├── financeiro.py    # importação da planilha de pagamentos (todas as abas)
│   │   │   ├── formulas.py      # leitura das fórmulas SUMIF/SUMIFS da planilha
│   │   │   ├── financeiro_relatorios.py  # RAP, Resultado, análise por EDOA, honorários
│   │   │   └── modelo_financeiro.py      # gera a planilha modelo (dados fictícios)
│   │   │   └── auditoria.py     # trilha de alterações
│   │   └── seed.py              # carga inicial + gerador da planilha de exemplo
│   └── tests/                   # 101 testes automatizados (pytest)
└── frontend/
    └── src/
        ├── api/                 # cliente HTTP tipado + tipos espelhando a API
        ├── context/             # sessão do usuário (JWT, perfis)
        ├── components/          # Layout, filtros, badges, estados, formulários
        ├── pages/               # as 11 telas do sistema
        └── utils/               # formatação (moeda, data) e preferências locais
```

---

## 4. A planilha que o sistema lê

Colunas esperadas (a ordem não importa):

| Coluna | Obrigatória | Observação |
|---|---|---|
| Status | Não | ativo/inativo — sinônimos como "em andamento" e "arquivado" são reconhecidos |
| Autor/Réu | **Sim** | Sem este campo a linha é descartada |
| Número Autos | **Sim** | Chave do processo; aceita com ou sem máscara CNJ |
| Natureza da ação | Não | Padronizada em Trabalhista, Cível, Consumidor, Tributário, Contratual, Administrativo, Outros |
| Vara | Não | Texto livre |
| Comarca | Não | Texto livre |
| Data de início | Não | dd/mm/aaaa, aaaa-mm-dd ou número serial do Excel |
| Posição da Renault | Não | ativo/passivo → Polo Ativo / Polo Passivo |
| Resumo do caso | Não | Texto livre |
| Defesa | Não | Sim/Não, S/N, realizada/pendente |
| Fase processual | Não | Padronizada em Conhecimento, Recurso, Execução, Cumprimento de sentença, Encerrado, Outros |
| Movimentações | Não | Uma por linha; datas no início viram a data do andamento |
| Valor da causa | Não | Aceita `R$ 1.234,56`, `1234.56`, `1,234.56` |
| Valor do risco | Não | Idem |

Variações de cabeçalho são reconhecidas automaticamente (maiúsculas, acentos,
`Nº Autos`, `Valor da causa (R$)`, e até a grafia "Posição da Renaut" do modelo original).

> **Limitação conhecida:** o cabeçalho precisa estar na **primeira linha da primeira aba**.
> Planilhas com linha de título, logo ou células mescladas acima do cabeçalho são recusadas
> com "colunas obrigatórias não encontradas". É a causa mais comum de falha na importação.

**Regras aplicadas na importação**

- O processo é identificado pelo **número dos autos**: reimportar a mesma planilha
  atualiza os registros, nunca duplica.
- Toda mudança de valor relevante (status, fase, valores, defesa, risco) vira uma linha
  no **histórico do processo**, com autor e data.
- Linhas sem número de autos ou sem parte são **descartadas** e listadas como
  inconsistência bloqueante; as demais entram no sistema com um aviso.

**Faixas de risco** (configuráveis em `backend/app/core/config.py`):

| Faixa | Critério |
|---|---|
| Crítico | Valor do risco ≥ R$ 1.000.000 |
| Alto | ≥ R$ 300.000 |
| Médio | ≥ R$ 50.000 |
| Baixo | abaixo disso |

Processo **ativo sem defesa registrada sobe uma faixa** — o prazo em aberto é, por si só,
um agravante.

---

## 5. Módulo financeiro — a planilha de pagamentos do Jurídico

O arquivo `Pagamentos_Juridico_AAAA.xlsm` é importado **inteiro, de uma vez**, em
*Financeiro → Importar pagamentos*. Cada aba vai para um lugar do sistema:

| Aba da planilha | No sistema | O que é importado |
|---|---|---|
| Controle Lançamentos | Financeiro → Lançamentos | Cada pagamento. O STATUS é recalculado com a mesma regra da coluna A (RC → Pedido → Recepção → Envio → Pago) |
| RAP PAGAMENTOS | Orçamento (RAP) → abas *EDOA × Área* e *Fixo × variável* | Budget, **mês de fechamento** (C2) e o **critério de cada linha**, lido da fórmula SUMIF/SUMIFS |
| Honorarios Variaveis | Orçamento → *Plano de honorários* | Plano mês a mês e budget; a coluna REAL (quebrada na planilha) é calculada |
| Mensais | Orçamento → *Contratos mensais* | Contratos recorrentes dos escritórios e dos sistemas |
| Resultado | Financeiro → Resultado | Só o **layout** (linhas, ordem, IMPACTO); os valores são recalculados |
| LGPD | Financeiro → Análise por EDOA | Nada — é uma tabela dinâmica; o sistema refaz para qualquer EDOA |
| Adiantamentos | Financeiro → Adiantamentos | Adiantamentos e baixas (status pela regra da coluna A) |
| Devoluções | Financeiro → Devoluções | Estornos dos escritórios |
| Base | Financeiro → Cadastros → Listas | Áreas, fornecedores, motivos, EDOA… — alimentam filtros e a padronização |
| RF MENSAL | Financeiro → Cadastros → Plano de contas | Centro de custo × conta contábil (a aba não tem cabeçalho) |

Regras que valem para o módulo todo:

- **Nenhum total é copiado da planilha.** REALIZADO, GAP, Resultado e a tabela da LGPD
  são sempre calculados a partir dos lançamentos. Editar ou lançar um pagamento no
  sistema já muda os relatórios.
- **O critério vem da fórmula.** Cada linha do RAP e do Resultado soma exatamente o que a
  fórmula dela soma (inclusive quando a fórmula aponta para o EDOA "errado"). Linha sem
  fórmula válida recebe um critério *inferido* pelo rótulo e fica marcada; um gestor pode
  ajustar o critério ou o budget clicando na linha.
- **Ano do exercício** vem do nome do arquivo (ou das datas, se o nome não tiver ano) e
  pode ser trocado antes de importar.
- **Reimportar o mesmo ano reconcilia:** cria o que é novo, atualiza o que mudou e
  **remove o que saiu da planilha**. Lançamentos, adiantamentos e devoluções criados à mão
  no sistema nunca são apagados por uma importação.
- **Grafias são padronizadas** ("acordo", "Acordo ", "ACORDO" → "Acordo") e a tela de
  resultado mostra cada unificação feita.
- O arquivo real **não vai no projeto** (tem dados de pessoas e fornecedores).
  `docs/modelo-pagamentos-juridico.xlsx` tem o mesmo layout, as mesmas fórmulas e dados
  fictícios — é o que os testes usam, e pode ser baixado na própria tela de importação.

### O que a importação da planilha de 2024 revelou

Ao reproduzir a planilha, o sistema encontrou defeitos que ele passa a sinalizar:

| Onde | Problema | Como o sistema trata |
|---|---|---|
| RAP, bloco de honorários | REAL VARIÁVEL sempre zero: a fórmula procura "Variável", os lançamentos dizem "Variável pontual" | Calcula o variável com as duas grafias |
| RAP | PREVISTO usa o mês de fechamento (2), mas o REALIZADO soma o ano inteiro — o GAP fica artificialmente negativo | Mostra *Realizado até o mês* e *Realizado no ano* separados |
| RAP | DEPÓSITO JUDICIAL / Consumidor repete o critério de CORPORATE / Consumidor - Condenação (o mesmo gasto contado duas vezes) | Alerta de dupla contagem na linha |
| RAP | Linhas cujo critério é uma célula vazia (sempre dão zero no Excel) | Critério inferido + alerta; gestor pode corrigir |
| RAP | Gasto em EDOA sem nenhuma linha de orçamento | Lista "Gasto em EDOA sem linha no RAP" |
| Honorarios Variaveis | Coluna REAL com `#REF!` | Realizado calculado por EDOA + área + recorrência |
| Adiantamentos | Resumo por escritório com `#REF!` | Totais calculados na tela |
| Resultado | Linha "Juros e correção" sem fórmula e categorias sem linha no layout | Critério inferido + quadro "Gasto fora do relatório" |

---

## 6. Perfis de acesso

| Ação | Visualizador | Analista | Gestor | Administrador |
|---|:--:|:--:|:--:|:--:|
| Ver dashboard, processos, análises e relatórios | ✅ | ✅ | ✅ | ✅ |
| Exportar Excel/PDF | ✅ | ✅ | ✅ | ✅ |
| Importar planilha | — | ✅ | ✅ | ✅ |
| Criar/editar processos | — | ✅ | ✅ | ✅ |
| Ver lista de usuários | — | — | ✅ | ✅ |
| Criar/editar/desativar usuários | — | — | — | ✅ |

O auto-cadastro pela tela de registro nunca concede perfil de Administrador.

---

## 7. Testes

```bash
cd backend
pip install -r requirements-dev.txt
pytest -q
```

São 101 testes: leitura de valores e datas em vários formatos, mapeamento de colunas,
classificação de risco, um fluxo ponta a ponta (login → importação → dashboard →
relatórios → permissões) e, no financeiro, a leitura das fórmulas, o status derivado,
cada relatório conferido contra a soma esperada, a reconciliação na reimportação e os
cadastros. Rodam em SQLite temporário, sem tocar no PostgreSQL.

---

## 8. Principais endpoints

Documentação interativa completa em `/docs`.

| Método | Rota | O que faz |
|---|---|---|
| POST | `/api/auth/login` | Autentica e devolve o token JWT |
| POST | `/api/auth/registrar` | Auto-cadastro |
| GET | `/api/dashboard` | KPIs, gráficos e pontos de atenção (aceita todos os filtros) |
| GET | `/api/processos` | Lista com busca, filtros, ordenação e paginação |
| GET | `/api/processos/{id}` | Detalhe com movimentações e histórico |
| POST/PUT/DELETE | `/api/processos` | CRUD (Analista ou superior) |
| GET | `/api/processos/opcoes-filtro` | Valores distintos para os selects |
| GET | `/api/processos/exportar` | Baixa a lista filtrada em XLSX |
| POST | `/api/importacoes/preview` | Lê a planilha sem gravar nada |
| POST | `/api/importacoes` | Importa de fato |
| GET | `/api/importacoes` | Histórico de importações |
| PATCH | `/api/importacoes/inconsistencias/{id}` | Corrigir / ignorar / revisar depois |
| GET | `/api/analises` | Análises e insights calculados |
| GET | `/api/relatorios/preview` | Prévia do relatório |
| GET | `/api/relatorios/exportar/excel` \| `/pdf` | Relatório com identidade Renault Geely |
| GET/POST/PUT/PATCH | `/api/usuarios` | Administração de usuários |
| POST | `/api/financeiro/importacoes/preview` \| `/api/financeiro/importacoes` | Confere as abas / importa a planilha de pagamentos |
| GET | `/api/financeiro/importacoes/modelo` | Baixa a planilha modelo (dados fictícios) |
| GET/POST/PUT/DELETE | `/api/financeiro/lancamentos` | Lançamentos (filtros, paginação, CRUD, `/exportar`) |
| GET/POST/PUT/DELETE | `/api/financeiro/adiantamentos` \| `/devolucoes` | Adiantamentos e devoluções |
| GET | `/api/financeiro/dashboard` | KPIs financeiros |
| GET | `/api/financeiro/rap?ano=&mes_fechamento=` | Orçamento × realizado (blocos 1 e 2 do RAP) |
| PUT | `/api/financeiro/exercicios/{ano}` | Grava o mês de fechamento |
| PUT | `/api/financeiro/orcamento/itens/{id}` | Ajusta budget ou critério de uma linha |
| GET | `/api/financeiro/resultado?ano=&mes=` | Relatório Resultado |
| GET | `/api/financeiro/analise?edoa=&linha1=&linha2=&coluna=` | Tabela dinâmica (aba LGPD) para qualquer EDOA |
| GET | `/api/financeiro/plano-honorarios` \| `/contratos` \| `/anos` | Plano de honorários, contratos mensais, exercícios |
| GET/POST/PUT/DELETE | `/api/financeiro/cadastros/dominios` \| `/contas` | Listas da aba Base e plano de contas |

Filtros globais aceitos por dashboard, processos, análises e relatórios:
`data_inicio`, `data_fim`, `status`, `natureza`, `comarca`, `vara`, `posicao`, `fase`,
`escritorio`, `risco`, `riscos`, `defesa`, `sem_movimentacao_dias`, `busca`.

---

## 9. Antes de colocar em produção

- [ ] Gerar um `SECRET_KEY` novo (`openssl rand -hex 32`) e trocar as senhas do seed.
- [ ] Trocar `create_all` por **Alembic** (migrations versionadas) — ver `core/database.py`.
- [ ] Servir tudo sob HTTPS e restringir `CORS_ORIGINS` ao domínio real.
- [ ] Definir política de backup do PostgreSQL.
- [ ] Guardar o token em cookie `httpOnly` em vez de `localStorage`, se a política de
      segurança da Renault exigir.
- [ ] Avaliar processamento assíncrono (fila) para planilhas muito grandes — hoje a
      importação é síncrona e responde em poucos segundos para milhares de linhas.

---

*Projeto acadêmico desenvolvido para o Transformation Day Renault. Os dados da planilha de
exemplo são fictícios.*
