/** Tipos espelhando os schemas da API (backend/app/schemas). */

export type PerfilAcesso = 'Administrador' | 'Gestor' | 'Analista' | 'Visualizador';
export type StatusProcesso = 'Ativo' | 'Inativo';
export type PosicaoRenault = 'Polo Ativo' | 'Polo Passivo';
export type FaixaRisco = 'Baixo' | 'Médio' | 'Alto' | 'Crítico';

export interface Usuario {
  id: number;
  nome: string;
  email: string;
  cargo: string | null;
  perfil: PerfilAcesso;
  status: 'Ativo' | 'Inativo';
  iniciais: string;
  ultimo_acesso: string | null;
  data_cadastro: string;
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
  usuario: Usuario;
}

export interface Movimentacao {
  id: number;
  data: string | null;
  tipo: 'audiencia' | 'despacho' | 'recurso' | 'sentenca' | 'citacao' | 'outros';
  descricao: string;
}

export interface HistoricoAlteracao {
  id: number;
  data: string;
  usuario_nome: string | null;
  campo: string;
  valor_anterior: string | null;
  valor_novo: string | null;
  origem: string;
}

export interface Processo {
  id: number;
  numero_autos: string;
  status: StatusProcesso;
  autor_reu: string;
  natureza: string;
  vara: string | null;
  comarca: string | null;
  data_inicio: string | null;
  posicao_renault: PosicaoRenault;
  defesa_realizada: boolean;
  fase_processual: string;
  valor_causa: number;
  valor_risco: number;
  risco: FaixaRisco;
  escritorio: string | null;
  ultima_movimentacao: string | null;
  total_movimentacoes: number;
}

export interface ProcessoDetalhe extends Processo {
  resumo: string | null;
  movimentacoes_texto: string | null;
  criado_em: string;
  atualizado_em: string;
  movimentacoes: Movimentacao[];
  historico: HistoricoAlteracao[];
}

export interface ProcessoLista {
  itens: Processo[];
  total: number;
  pagina: number;
  por_pagina: number;
  total_paginas: number;
}

export interface Kpi {
  valor: number;
  variacao_percentual: number | null;
  positivo: boolean;
}

export interface DashboardResponse {
  kpis: {
    total_processos: Kpi;
    processos_ativos: Kpi;
    processos_inativos: Kpi;
    valor_causa_total: Kpi;
    valor_risco_total: Kpi;
    defesa_pendente: Kpi;
  };
  evolucao: { mes: string; processos: number; valor_causa: number; valor_risco: number }[];
  por_natureza: ItemCategoria[];
  por_fase: ItemCategoria[];
  por_risco: ItemCategoria[];
  por_posicao: ItemCategoria[];
  risco_por_natureza: ItemCategoria[];
  pontos_atencao: PontoAtencao[];
  processos_recentes: Processo[];
}

export interface ItemCategoria {
  label: string;
  quantidade: number;
  valor_risco: number;
  valor_causa: number;
}

export interface PontoAtencao {
  tipo: string;
  texto: string;
  quantidade: number;
  severidade: 'info' | 'alerta' | 'critico';
}

export interface FiltroOpcoes {
  naturezas: string[];
  comarcas: string[];
  varas: string[];
  fases: string[];
  escritorios: string[];
  riscos: string[];
  status: string[];
  posicoes: string[];
}

export interface Inconsistencia {
  id: number;
  linha: number;
  campo: string;
  problema: string;
  valor_original: string | null;
  numero_autos: string | null;
  bloqueante: boolean;
  status: 'Pendente' | 'Corrigido' | 'Ignorado' | 'Revisar depois';
}

export interface Importacao {
  id: number;
  arquivo: string;
  escritorio: string | null;
  data: string;
  usuario_nome: string | null;
  total_processos: number;
  registros_validos: number;
  total_inconsistencias: number;
  criados: number;
  atualizados: number;
  status: 'Processando' | 'Concluído' | 'Concluído com alertas' | 'Erro';
  duracao_ms: number | null;
}

export interface ImportacaoDetalhe extends Importacao {
  mensagem_erro: string | null;
  inconsistencias: Inconsistencia[];
}

export interface EtapaProcessamento {
  nome: string;
  concluida: boolean;
  detalhe: string | null;
}

export interface ImportacaoResultado {
  importacao: Importacao;
  etapas: EtapaProcessamento[];
  inconsistencias: Inconsistencia[];
  processos_ativos: number;
  valor_risco_total: number;
  valor_causa_total: number;
}

export interface PreviewPlanilha {
  arquivo: string;
  total_linhas: number;
  colunas: { coluna_planilha: string; campo_sistema: string | null; reconhecida: boolean }[];
  colunas_obrigatorias_ausentes: string[];
  amostra: Record<string, string | null>[];
}

export interface Insight {
  texto: string;
  tipo: 'positivo' | 'alerta' | 'critico' | 'info';
}

export interface AnalisesResponse {
  evolucao: { mes: string; processos: number; valor_causa: number; valor_risco: number }[];
  naturezas_maior_exposicao: ItemCategoria[];
  comarcas_maior_concentracao: ItemCategoria[];
  fases_maior_volume: ItemCategoria[];
  processos_alto_risco: number;
  processos_sem_defesa: number;
  processos_sem_movimentacao: number;
  valor_risco_alto_critico: number;
  insights: Insight[];
}

export interface RelatorioPreview {
  total_processos: number;
  valor_causa_total: number;
  valor_risco_total: number;
  processos_ativos: number;
  processos_criticos: number;
  por_natureza: ItemCategoria[];
  amostra: Processo[];
}

/** Filtros globais aceitos por dashboard, processos, análises e relatórios. */
export interface FiltrosProcesso {
  data_inicio?: string;
  data_fim?: string;
  status?: string;
  natureza?: string;
  comarca?: string;
  vara?: string;
  posicao?: string;
  fase?: string;
  escritorio?: string;
  risco?: string;
  busca?: string;
}

// ==========================================================================
// Módulo financeiro — controle de pagamentos e orçamento
// ==========================================================================

export type StatusLancamento =
  | 'Lançar Pgto'
  | 'RC Criada'
  | 'Pedido Concluído'
  | 'Pedido Recepcionado'
  | 'Enviado para pagamento'
  | 'Pago';

export interface Lancamento {
  id: number;
  status: StatusLancamento;
  categoria: string | null;
  area: string | null;
  tipo_pagamento: string | null;
  referencia: string | null;
  motivo: string | null;
  valor: number;
  mes_referencia: string | null;
  mes_referencia_num: number | null;
  ano_referencia: number | null;
  data_pagamento: string | null;
  envio_para_pagamento: string | null;
  recorrencia: string | null;
  descricao: string | null;
  rc: string | null;
  numero_pedido: string | null;
  recepcao: string | null;
  item: string | null;
  chamado: string | null;
  documento_pago: string | null;
  edoa: string | null;
  centro_custo: string | null;
  conta_contabil: string | null;
  linha_planilha: number | null;
  manual?: boolean;
}

export interface LancamentoLista {
  itens: Lancamento[];
  total: number;
  total_valor: number;
  pagina: number;
  por_pagina: number;
  total_paginas: number;
}

export interface Adiantamento {
  id: number;
  status: string | null;
  conferido_planilha: boolean;
  area: string | null;
  doa: string | null;
  escritorio: string | null;
  valor: number;
  valor_excedente: number;
  valor_total: number;
  chamado_adiantamento: string | null;
  chamado_baixa: string | null;
  documento_baixa: string | null;
  observacao?: string | null;
  ano_referencia?: number | null;
  baixado: boolean;
  manual?: boolean;
}

export interface Devolucao {
  id: number;
  area: string | null;
  fornecedor: string | null;
  codigo_banco: string | null;
  data_transferencia: string | null;
  pasta_benner: string | null;
  valor_devolvido: number;
  chamado: string | null;
  documento: string | null;
  observacao: string | null;
  ano_referencia?: number | null;
  manual?: boolean;
}

export interface ValorPorCategoria {
  label: string;
  valor: number;
  quantidade: number;
  percentual: number;
}

export interface ValorPorMes {
  mes: number;
  nome: string;
  valor: number;
  quantidade: number;
  pago: number;
  em_processamento: number;
}

export interface KpiFinanceiro {
  valor: number;
  quantidade: number;
  variacao_percentual: number | null;
}

export interface DashboardFinanceiro {
  total_geral: KpiFinanceiro;
  total_pago: KpiFinanceiro;
  em_processamento: KpiFinanceiro;
  ticket_medio: KpiFinanceiro;
  adiantamentos_em_aberto: KpiFinanceiro;
  devolucoes: KpiFinanceiro;
  por_mes: ValorPorMes[];
  por_area: ValorPorCategoria[];
  por_edoa: ValorPorCategoria[];
  por_motivo: ValorPorCategoria[];
  por_status: ValorPorCategoria[];
  por_recorrencia: ValorPorCategoria[];
  por_centro_custo: ValorPorCategoria[];
  alertas: string[];
}

/** Valores de uma linha do RAP (colunas BUDGET → BUDGET RESTANTE da planilha). */
export interface ValoresRap {
  budget: number;
  previsto: number;
  /** Até o mês de fechamento. */
  realizado: number;
  realizado_ano: number;
  gap: number;
  restante: number;
  consumido_percentual: number;
}

export interface RegraRap {
  edoa: string | null;
  area: string | null;
  recorrencia: string | null;
  /** formula = lida da fórmula; inferida = deduzida do rótulo; manual = ajustada no sistema. */
  origem: 'formula' | 'inferida' | 'manual' | 'sem_regra' | string;
  realizado_manual: number | null;
}

export interface LinhaRap extends ValoresRap {
  id: number;
  rotulo: string | null;
  nivel: 'edoa' | 'area' | string;
  linha_planilha: number | null;
  regra: RegraRap;
  alertas: string[];
}

export interface GrupoRap {
  grupo: string;
  linhas: LinhaRap[];
  total: ValoresRap & { origem: string };
}

export interface LinhaRapBloco2 {
  id: number;
  area: string;
  edoa: string | null;
  total: ValoresRap;
  fixo: ValoresRap;
  variavel: ValoresRap;
  sem_classificacao_ano: number;
}

export interface RapResponse {
  ano: number;
  mes_fechamento: number;
  mes_fechamento_nome: string;
  totais: ValoresRap;
  bloco1: GrupoRap[];
  bloco2: LinhaRapBloco2[];
  sem_orcamento: { edoa: string; realizado_ano: number }[];
  observacoes: string[];
}

export interface LinhaResultado {
  ordem?: number;
  categoria: string;
  doa: string | null;
  impacto: string | null;
  valor_mes: number;
  valor_ano: number;
  quantidade: number;
  regra_origem?: string | null;
  filtro_edoa?: string | null;
}

export interface ResultadoResponse {
  ano: number;
  mes: number | null;
  mes_nome: string | null;
  tem_layout: boolean;
  linhas: LinhaResultado[];
  nao_mapeados: LinhaResultado[];
  por_impacto: { impacto: string; valor_mes: number; valor_ano: number }[];
  total_mes: number;
  total_ano: number;
  total_nao_mapeado_ano: number;
  total_sem_categoria_ano: number;
}

export interface LinhaAnalise {
  rotulo: string;
  valores: Record<string, number>;
  total: number;
  filhos?: LinhaAnalise[];
}

export interface AnaliseResponse {
  ano: number;
  edoa: string | null;
  dimensoes: { linha1: string; linha2: string | null; coluna: string };
  rotulos_dimensoes: Record<string, string>;
  colunas: string[];
  linhas: LinhaAnalise[];
  total: LinhaAnalise;
  quantidade: number;
}

export interface ItemPlanoHonorarios {
  id: number;
  edoa: string | null;
  area: string | null;
  detalhamento: string | null;
  recorrencia: string | null;
  meses: number[];
  soma_meses: number;
  budget: number;
}

export interface GrupoPlanoHonorarios {
  edoa: string;
  area: string;
  recorrencia: string;
  budget: number;
  plano_meses: number[];
  real: number;
  real_meses: number[];
  quantidade_lancamentos: number;
  saldo: number;
  consumido_percentual: number;
}

export interface PlanoHonorariosResponse {
  ano: number;
  itens: ItemPlanoHonorarios[];
  grupos: GrupoPlanoHonorarios[];
  budget_total: number;
  real_total: number;
  observacao: string;
}

export interface ContratoMensal {
  id: number;
  tipo: 'Escritório' | 'Sistema' | string;
  area: string | null;
  descricao: string | null;
  recorrencia: string | null;
  valor_mensal: number;
  valor_anual: number;
  realizado_fixo_ano: number | null;
}

export interface ContratosResponse {
  ano: number;
  contratos: ContratoMensal[];
  total_mensal: number;
  total_anual: number;
  observacao: string;
}

export interface AnosFinanceiros {
  padrao: number;
  anos: { ano: number; mes_fechamento: number; arquivo_origem: string | null }[];
  meses: string[];
}

export interface ItemDominio {
  id: number;
  valor: string;
  uso: number | null;
}

export interface DominiosResponse {
  tipos: { tipo: string; rotulo: string; itens: ItemDominio[] }[];
}

export interface ContaContabil {
  id: number;
  diretoria: string | null;
  grupo: string | null;
  centro_custo: string;
  conta: string;
  descricao: string | null;
}

export interface OpcoesFiltroFinanceiro {
  status: string[];
  areas: string[];
  edoas: string[];
  categorias: string[];
  motivos: string[];
  recorrencias: string[];
  tipos_pagamento: string[];
  centros_custo: string[];
  contas_contabeis: string[];
  anos: number[];
}

export interface AbaAnalisada {
  aba: string;
  destino: string | null;
  descricao: string | null;
  linhas: number;
  linha_cabecalho: number;
  colunas: string[];
  observacao: string | null;
}

export interface PreviewFinanceiro {
  arquivo: string;
  ano_detectado: number;
  origem_ano: string;
  abas: AbaAnalisada[];
}

export interface ResultadoAbaImportacao {
  aba: string;
  destino: string;
  linhas_lidas: number;
  criados: number;
  atualizados: number;
  ignorados: number;
  removidos: number;
  linha_cabecalho: number;
  mensagem: string | null;
  problemas: number;
}

export interface Padronizacao {
  campo: string;
  para: string;
  de: string[];
  quantidade: number;
}

export interface ImportacaoFinanceira {
  importacao_id: number;
  arquivo: string;
  status: string;
  data: string;
  duracao_ms: number | null;
  criados: number;
  atualizados: number;
  removidos: number;
  total_inconsistencias: number;
  abas: ResultadoAbaImportacao[];
  total_lancamentos: number;
  valor_total_lancamentos: number;
  ano: number;
  origem_ano: string;
  mes_fechamento: number | null;
  padronizacoes: Padronizacao[];
  adiantamentos_em_aberto?: { valor: number; quantidade: number };
  alertas?: string[];
}

/** Filtros aceitos pelas telas financeiras. */
export interface FiltrosFinanceiro {
  status?: string;
  area?: string;
  edoa?: string;
  categoria?: string;
  motivo?: string;
  recorrencia?: string;
  tipo_pagamento?: string;
  centro_custo?: string;
  conta_contabil?: string;
  mes?: number;
  ano?: number;
  data_de?: string;
  data_ate?: string;
  valor_min?: number;
  valor_max?: number;
  busca?: string;
}
