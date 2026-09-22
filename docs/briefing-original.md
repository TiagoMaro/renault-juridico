Crie um protótipo funcional e visual de alta fidelidade para um sistema web corporativo de **Gestão e Análise Jurídica**, destinado à **Renault Geely do Brasil**.

O sistema tem como objetivo receber planilhas jurídicas enviadas pelos escritórios responsáveis pelos processos, interpretar automaticamente os dados, consolidar as informações e apresentar dashboards gerenciais claros, modernos e visualmente profissionais.

## 1. Identidade visual

O sistema deve ter uma identidade visual corporativa inspirada na marca Renault Geely.

Utilize principalmente:

* Azul Renault como cor primária
* Branco como cor predominante de fundo
* Cinza claro para áreas secundárias
* Cinza escuro/preto para textos
* Azul mais escuro para elementos de destaque
* Verde para indicadores positivos
* Amarelo/laranja para alertas
* Vermelho para riscos críticos

A interface deve transmitir:

* Tecnologia
* Segurança
* Confiabilidade
* Gestão corporativa
* Inteligência de dados
* Organização
* Modernidade

Evite excesso de cores, sombras ou elementos decorativos.

Utilize um design semelhante a plataformas modernas de BI e sistemas corporativos SaaS, com bastante espaço em branco, cards, gráficos e tabelas bem organizadas.

Interface totalmente responsiva para desktop, com adaptação para tablet.

---

# 2. Estrutura geral

Crie um layout com:

### Sidebar lateral

Itens de navegação:

* Dashboard
* Processos
* Importação de planilhas
* Análises
* Relatórios
* Histórico de importações
* Usuários
* Configurações

No topo da sidebar, apresentar:
**Renault Geely**
**Gestão Jurídica**

No rodapé:

* Nome do usuário logado
* Cargo/perfil
* Botão de sair

### Topbar

Na parte superior:

* Breadcrumb da página
* Campo de pesquisa
* Notificações
* Avatar do usuário
* Nome do usuário

---

# 3. Tela de Login

Criar uma tela de login corporativa moderna.

Elementos:

* Logo/nome Renault Geely
* Título: "Gestão Jurídica"
* Subtítulo: "Central de inteligência e acompanhamento de processos"
* Campo E-mail
* Campo Senha
* Checkbox "Lembrar acesso"
* Botão "Entrar"
* Link "Esqueci minha senha"
* Link "Criar uma conta"

Layout dividido em duas partes:

* lado esquerdo com formulário
* lado direito com uma composição visual relacionada a dados, processos e gestão jurídica

---

# 4. Tela de Registro

Criar tela de cadastro de usuário com:

* Nome completo
* E-mail corporativo
* Senha
* Confirmar senha
* Cargo
* Perfil de acesso

Perfis:

* Administrador
* Gestor
* Analista
* Visualizador

Botão:
"Criar conta"

---

# 5. Dashboard principal

Essa deve ser a principal tela do sistema.

Criar um dashboard executivo, bonito, claro e profissional.

No topo:

Título:
**Dashboard Jurídico**

Subtítulo:
"Visão consolidada dos processos e exposição jurídica"

Adicionar filtros globais:

* Período
* Status
* Natureza da ação
* Comarca
* Vara
* Posição Renault
* Fase processual
* Escritório
* Faixa de risco

Botão:
"Limpar filtros"

---

## Cards principais

Criar cards com indicadores:

### Total de processos

Exemplo:
**1.284**

Mostrar comparação com período anterior.

### Processos ativos

Exemplo:
**987**

### Processos inativos

Exemplo:
**297**

### Valor total das causas

Exemplo:
**R$ 184,6 mi**

### Valor total em risco

Exemplo:
**R$ 42,8 mi**

### Processos com defesa pendente

Exemplo:
**37**

Cada card deve possuir:

* Ícone
* Valor principal
* descrição
* variação percentual
* indicador visual de tendência

---

# 6. Gráficos do Dashboard

Criar uma seção com diversos gráficos.

### Processos ao longo do tempo

Gráfico de linha mostrando a evolução mensal da quantidade de processos.

Título:
**Evolução dos processos**

Permitir alternar entre:

* Quantidade de processos
* Valor da causa
* Valor em risco

---

### Processos por natureza

Gráfico de barras ou donut mostrando:

* Trabalhista
* Cível
* Consumidor
* Tributário
* Contratual
* Administrativo
* Outros

---

### Distribuição por fase processual

Gráfico mostrando:

* Conhecimento
* Recurso
* Execução
* Cumprimento de sentença
* Encerrado
* Outros

---

### Processos por posição da Renault

Gráfico comparativo:

* Polo ativo
* Polo passivo

---

### Distribuição de risco

Criar gráfico mostrando:

* Baixo
* Médio
* Alto
* Crítico

Utilizar cores intuitivas para representar os níveis de risco.

---

### Valor em risco por natureza

Gráfico de barras horizontais mostrando quais naturezas concentram maior exposição financeira.

---

# 7. Alertas e indicadores

Criar uma seção chamada:

**Pontos de atenção**

Exemplos:

* 37 processos estão sem defesa registrada
* 12 processos possuem risco crítico
* 24 processos tiveram movimentação recente
* R$ 8,4 milhões estão concentrados em processos de alto risco
* 15 processos estão sem movimentação há mais de 90 dias

Utilizar cards pequenos com ícones e cores de alerta.

---

# 8. Processos recentes

Criar tabela chamada:

**Processos com movimentação recente**

Colunas:

* Número dos Autos
* Autor/Réu
* Natureza
* Comarca
* Fase processual
* Status
* Valor da causa
* Valor do risco
* Última movimentação

Adicionar:

* pesquisa
* filtros
* ordenação
* paginação

Cada processo deve ser clicável.

---

# 9. Tela de Processos

Criar uma página dedicada para gerenciamento e consulta dos processos.

Tabela completa com as seguintes informações:

* Status
* Autor/Réu
* Número dos Autos
* Natureza da ação
* Vara
* Comarca
* Data de início
* Posição da Renault
* Resumo do caso
* Defesa realizada
* Fase processual
* Movimentações
* Valor da causa
* Valor do risco

Adicionar filtros avançados.

Permitir:

* visualizar
* editar
* pesquisar
* filtrar
* ordenar
* exportar

---

# 10. Página de detalhes do processo

Ao clicar em um processo, abrir uma página detalhada.

Mostrar no topo:

**Processo nº 0000000-00.0000.0.00.0000**

Mostrar badges:

* Ativo
* Polo Passivo
* Alto risco

Criar cards com:

* Valor da causa
* Valor do risco
* Data de início
* Fase processual
* Defesa

Depois criar abas:

### Resumo

Mostrar o resumo do caso.

### Dados processuais

Mostrar:

* Autor/Réu
* Vara
* Comarca
* Natureza
* Posição Renault
* Status
* Data de início

### Defesa

Mostrar se a defesa foi realizada.

### Movimentações

Criar uma timeline cronológica das movimentações processuais.

### Histórico

Mostrar alterações realizadas no cadastro.

---

# 11. Tela de importação de planilha

Criar uma página chamada:

**Importar planilha jurídica**

Criar uma área de upload drag-and-drop.

Texto:

"Arraste sua planilha aqui ou selecione um arquivo"

Formatos aceitos:

* XLSX
* XLS
* CSV

Botão:
"Selecionar arquivo"

Após selecionar a planilha, mostrar uma etapa de pré-visualização.

---

# 12. Interpretação automática da planilha

Após o upload, o sistema deve apresentar uma etapa chamada:

**Análise da planilha**

Mostrar visualmente o processamento:

1. Arquivo recebido
2. Validação das colunas
3. Leitura dos processos
4. Padronização dos dados
5. Identificação de inconsistências
6. Consolidação dos indicadores
7. Dashboard atualizado

Mostrar uma barra de progresso.

Após finalizar:

**Importação concluída**

Exemplo:

* 1.284 processos encontrados
* 1.251 registros válidos
* 33 registros com inconsistências
* 987 processos ativos
* R$ 42,8 milhões em risco

Botão:
**Visualizar dashboard**

---

# 13. Tratamento de inconsistências

Criar uma tela/seção para mostrar problemas encontrados na planilha.

Exemplos:

* Número de processo ausente
* Valor da causa inválido
* Valor de risco não informado
* Status desconhecido
* Data inválida
* Fase processual não reconhecida

Mostrar uma tabela:

| Linha | Campo | Problema | Status |
| ----- | ----- | -------- | ------ |

Adicionar possibilidade de:

* corrigir
* ignorar
* revisar posteriormente

---

# 14. Histórico de importações

Criar página:

**Histórico de importações**

Tabela:

* Arquivo
* Data
* Usuário
* Quantidade de processos
* Registros válidos
* Inconsistências
* Status
* Ações

Status:

* Processando
* Concluído
* Concluído com alertas
* Erro

Permitir visualizar detalhes de cada importação.

---

# 15. Relatórios

Criar página:

**Relatórios**

Permitir selecionar:

* Período
* Natureza
* Status
* Fase processual
* Posição Renault
* Risco
* Comarca

Mostrar uma prévia do relatório.

Adicionar botões:

**Exportar Excel**

**Exportar PDF**

O relatório deve conter:

* Logo Renault Geely
* período analisado
* filtros utilizados
* principais indicadores
* gráficos
* tabela de processos
* data de geração
* usuário responsável

---

# 16. Análises

Criar uma página chamada:

**Análises Jurídicas**

Mostrar análises mais aprofundadas dos dados.

Criar cards e gráficos para:

* Evolução do valor em risco
* Evolução da quantidade de processos
* Naturezas com maior exposição
* Comarcas com maior concentração
* Fases processuais com maior volume
* Processos de alto risco
* Processos sem defesa
* Processos sem movimentação recente

Criar também uma seção:

**Insights**

Exemplo:

"Processos trabalhistas representam 42% do volume total e concentram 51% do valor em risco."

"Os processos classificados como alto e crítico representam 18% dos processos, mas concentram 64% da exposição financeira."

Esses insights devem parecer gerados automaticamente a partir dos dados.

---

# 17. Usuários

Criar página de administração de usuários.

Tabela:

* Nome
* E-mail
* Perfil
* Status
* Último acesso
* Data de cadastro
* Ações

Botão:
**Adicionar usuário**

Permitir ativar/desativar usuários.

---

# 18. Configurações

Criar página de configurações com:

* Perfil
* Preferências
* Segurança
* Notificações
* Configurações de importação

---

# 19. Dados utilizados pelo sistema

A planilha normalmente recebida dos escritórios jurídicos possui as seguintes colunas:

* Status — ativo/inativo
* Autor/Réu
* Número Autos
* Natureza da ação
* Vara
* Comarca
* Data de início
* Posição da Renault — ativo/passivo
* Resumo do caso
* Defesa — realizada? Sim/Não
* Fase processual
* Movimentações
* Valor da causa
* Valor do risco

O protótipo deve utilizar **dados fictícios realistas** para demonstrar o funcionamento do sistema.

Não utilizar dados reais ou informações pessoais reais.

Criar pelo menos 20 processos fictícios para preencher as tabelas e gráficos.

---

# 20. Experiência do usuário

O fluxo principal deve ser:

Login
→ Dashboard
→ Importar planilha
→ Validar dados
→ Interpretar dados
→ Consolidar informações
→ Atualizar dashboard
→ Analisar processos
→ Visualizar detalhes
→ Gerar relatório
→ Exportar Excel/PDF

O sistema deve parecer um produto real pronto para ser desenvolvido, e não apenas uma apresentação visual.

Utilize componentes consistentes, estados de hover, botões, filtros, dropdowns, tabelas, badges, cards, modais e feedback visual.

Criar estados para:

* carregando
* sucesso
* erro
* vazio
* alerta
* importação em andamento

---

# 21. Estilo visual

Priorizar:

* Interface corporativa premium
* Minimalismo
* Alta legibilidade
* Dashboards modernos
* Gráficos limpos
* Cards com informações objetivas
* Tipografia profissional
* Bordas discretas
* Cantos levemente arredondados
* Ícones simples
* Excelente hierarquia visual

Evitar:

* visual excessivamente colorido
* excesso de gradientes
* excesso de animações
* aparência de aplicativo genérico
* excesso de elementos na tela
* textos muito pequenos

O resultado deve transmitir que é uma **plataforma corporativa de inteligência jurídica da Renault Geely**, combinando gestão de processos, análise financeira, gestão de risco e Business Intelligence.

Priorize a criação do protótipo com **Dashboard, Importação de Planilha, Processos, Detalhes do Processo, Análises e Relatórios** como as telas mais completas e detalhadas.
