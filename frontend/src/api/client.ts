/**
 * Cliente HTTP do sistema.
 *
 * Centraliza a URL base, o token JWT e o tratamento de erro, para que as telas
 * só precisem chamar `api.processos.listar(...)`.
 */

import type {
  Adiantamento,
  AnalisesResponse,
  DashboardFinanceiro,
  DashboardResponse,
  Devolucao,
  FiltroOpcoes,
  FiltrosFinanceiro,
  FiltrosProcesso,
  Importacao,
  ImportacaoDetalhe,
  ImportacaoFinanceira,
  ImportacaoResultado,
  Inconsistencia,
  LancamentoLista,
  OpcoesFiltroFinanceiro,
  AnaliseResponse,
  AnosFinanceiros,
  ContaContabil,
  ContratosResponse,
  DominiosResponse,
  Lancamento,
  PlanoHonorariosResponse,
  PreviewFinanceiro,
  RapResponse,
  PreviewPlanilha,
  ProcessoDetalhe,
  ProcessoLista,
  RelatorioPreview,
  ResultadoResponse,
  TokenResponse,
  Usuario,
} from './types';

const BASE_URL = (import.meta.env.VITE_API_URL || 'http://localhost:8000') + '/api';
const CHAVE_TOKEN = 'renault_juridico_token';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export const tokenStorage = {
  obter: (): string | null => {
    try {
      return localStorage.getItem(CHAVE_TOKEN);
    } catch {
      return null;
    }
  },
  salvar: (token: string) => {
    try {
      localStorage.setItem(CHAVE_TOKEN, token);
    } catch {
      /* navegação anônima — a sessão vale só enquanto a aba estiver aberta */
    }
  },
  limpar: () => {
    try {
      localStorage.removeItem(CHAVE_TOKEN);
    } catch {
      /* ignora */
    }
  },
};

/** Disparado quando o token expira, para o App voltar à tela de login. */
export const EVENTO_SESSAO_EXPIRADA = 'renault:sessao-expirada';

/** Filtros + paginação + ordenação aceitos pela listagem de processos. */
export interface ParametrosListagem extends FiltrosProcesso {
  pagina?: number;
  por_pagina?: number;
  ordenar_por?: string;
  direcao?: 'asc' | 'desc';
  /** Várias faixas de risco ao mesmo tempo (?riscos=Alto&riscos=Crítico). */
  riscos?: string[];
  /** true = defesa realizada, false = defesa pendente. */
  defesa?: boolean;
  /** Somente processos parados há mais de N dias. */
  sem_movimentacao_dias?: number;
}

function montarQuery(filtros: object = {}): string {
  const params = new URLSearchParams();
  Object.entries(filtros).forEach(([chave, valor]) => {
    if (valor === undefined || valor === null || valor === '') return;
    // Listas viram parâmetros repetidos (?riscos=Alto&riscos=Crítico), como o FastAPI espera.
    if (Array.isArray(valor)) {
      valor.forEach(item => params.append(chave, String(item)));
      return;
    }
    params.append(chave, String(valor));
  });
  const query = params.toString();
  return query ? `?${query}` : '';
}

async function requisitar<T>(caminho: string, opcoes: RequestInit = {}): Promise<T> {
  const token = tokenStorage.obter();
  const headers = new Headers(opcoes.headers);
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (opcoes.body && !(opcoes.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  let resposta: Response;
  try {
    resposta = await fetch(`${BASE_URL}${caminho}`, { ...opcoes, headers });
  } catch {
    throw new ApiError(0, 'Não foi possível falar com o servidor. Verifique se a API está no ar.');
  }

  if (resposta.status === 401) {
    tokenStorage.limpar();
    window.dispatchEvent(new CustomEvent(EVENTO_SESSAO_EXPIRADA));
    throw new ApiError(401, 'Sessão expirada. Faça login novamente.');
  }

  if (!resposta.ok) {
    let detalhe = `Erro ${resposta.status}`;
    try {
      const corpo = await resposta.json();
      if (typeof corpo.detail === 'string') detalhe = corpo.detail;
      else if (Array.isArray(corpo.detail)) detalhe = corpo.detail[0]?.msg ?? detalhe;
    } catch {
      /* resposta sem corpo JSON */
    }
    throw new ApiError(resposta.status, detalhe);
  }

  if (resposta.status === 204) return undefined as T;
  return (await resposta.json()) as T;
}

/** Baixa um arquivo da API respeitando o nome enviado no Content-Disposition. */
async function baixarArquivo(caminho: string, nomePadrao: string): Promise<void> {
  const token = tokenStorage.obter();
  const resposta = await fetch(`${BASE_URL}${caminho}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!resposta.ok) throw new ApiError(resposta.status, 'Não foi possível gerar o arquivo.');

  const disposicao = resposta.headers.get('Content-Disposition') || '';
  const nome = disposicao.match(/filename="?([^"]+)"?/)?.[1] || nomePadrao;

  const blob = await resposta.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = nome;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export const api = {
  auth: {
    login: (email: string, senha: string) =>
      requisitar<TokenResponse>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, senha }),
      }),
    registrar: (dados: { nome: string; email: string; senha: string; cargo?: string; perfil?: string }) =>
      requisitar<TokenResponse>('/auth/registrar', { method: 'POST', body: JSON.stringify(dados) }),
    eu: () => requisitar<Usuario>('/auth/eu'),
  },

  processos: {
    listar: (filtros: ParametrosListagem = {}) =>
      requisitar<ProcessoLista>(`/processos${montarQuery(filtros)}`),
    obter: (id: number) => requisitar<ProcessoDetalhe>(`/processos/${id}`),
    criar: (dados: Record<string, unknown>) =>
      requisitar<ProcessoDetalhe>('/processos', { method: 'POST', body: JSON.stringify(dados) }),
    atualizar: (id: number, dados: Record<string, unknown>) =>
      requisitar<ProcessoDetalhe>(`/processos/${id}`, { method: 'PUT', body: JSON.stringify(dados) }),
    excluir: (id: number) => requisitar<void>(`/processos/${id}`, { method: 'DELETE' }),
    opcoesFiltro: () => requisitar<FiltroOpcoes>('/processos/opcoes-filtro'),
    exportar: (filtros: FiltrosProcesso = {}) =>
      baixarArquivo(`/processos/exportar${montarQuery(filtros)}`, 'processos.xlsx'),
  },

  dashboard: {
    obter: (filtros: FiltrosProcesso = {}) =>
      requisitar<DashboardResponse>(`/dashboard${montarQuery(filtros)}`),
  },

  analises: {
    obter: (filtros: FiltrosProcesso = {}) =>
      requisitar<AnalisesResponse>(`/analises${montarQuery(filtros)}`),
  },

  importacoes: {
    preview: (arquivo: File) => {
      const form = new FormData();
      form.append('arquivo', arquivo);
      return requisitar<PreviewPlanilha>('/importacoes/preview', { method: 'POST', body: form });
    },
    importar: (arquivo: File, escritorio?: string) => {
      const form = new FormData();
      form.append('arquivo', arquivo);
      if (escritorio) form.append('escritorio', escritorio);
      return requisitar<ImportacaoResultado>('/importacoes', { method: 'POST', body: form });
    },
    listar: () => requisitar<Importacao[]>('/importacoes'),
    obter: (id: number) => requisitar<ImportacaoDetalhe>(`/importacoes/${id}`),
    atualizarInconsistencia: (id: number, status: string) =>
      requisitar<Inconsistencia>(`/importacoes/inconsistencias/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      }),
  },

  relatorios: {
    preview: (filtros: FiltrosProcesso = {}) =>
      requisitar<RelatorioPreview>(`/relatorios/preview${montarQuery(filtros)}`),
    exportarExcel: (filtros: FiltrosProcesso = {}) =>
      baixarArquivo(`/relatorios/exportar/excel${montarQuery(filtros)}`, 'relatorio.xlsx'),
    exportarPdf: (filtros: FiltrosProcesso = {}) =>
      baixarArquivo(`/relatorios/exportar/pdf${montarQuery(filtros)}`, 'relatorio.pdf'),
  },

  usuarios: {
    listar: () => requisitar<Usuario[]>('/usuarios'),
    criar: (dados: Record<string, unknown>) =>
      requisitar<Usuario>('/usuarios', { method: 'POST', body: JSON.stringify(dados) }),
    atualizar: (id: number, dados: Record<string, unknown>) =>
      requisitar<Usuario>(`/usuarios/${id}`, { method: 'PUT', body: JSON.stringify(dados) }),
    alternarStatus: (id: number) => requisitar<Usuario>(`/usuarios/${id}/status`, { method: 'PATCH' }),
    atualizarProprioPerfil: (dados: { nome: string; cargo: string | null }) =>
      requisitar<Usuario>('/usuarios/eu', { method: 'PUT', body: JSON.stringify(dados) }),
    alterarSenha: (senhaAtual: string, novaSenha: string) =>
      requisitar<Usuario>('/usuarios/eu/senha', {
        method: 'PUT',
        body: JSON.stringify({ senha_atual: senhaAtual, nova_senha: novaSenha }),
      }),
  },

  financeiro: {
    dashboard: (filtros: FiltrosFinanceiro = {}) =>
      requisitar<DashboardFinanceiro>(`/financeiro/dashboard${montarQuery(filtros)}`),
    lancamentos: (
      filtros: FiltrosFinanceiro & {
        pagina?: number;
        por_pagina?: number;
        ordenar_por?: string;
        direcao?: 'asc' | 'desc';
      } = {},
    ) => requisitar<LancamentoLista>(`/financeiro/lancamentos${montarQuery(filtros)}`),
    obterLancamento: (id: number) => requisitar<Lancamento>(`/financeiro/lancamentos/${id}`),
    criarLancamento: (dados: Record<string, unknown>) =>
      requisitar<Lancamento>('/financeiro/lancamentos', { method: 'POST', body: JSON.stringify(dados) }),
    atualizarLancamento: (id: number, dados: Record<string, unknown>) =>
      requisitar<Lancamento>(`/financeiro/lancamentos/${id}`, { method: 'PUT', body: JSON.stringify(dados) }),
    excluirLancamento: (id: number) => requisitar<void>(`/financeiro/lancamentos/${id}`, { method: 'DELETE' }),
    opcoesFiltro: () => requisitar<OpcoesFiltroFinanceiro>('/financeiro/lancamentos/opcoes-filtro'),
    exportarLancamentos: (filtros: FiltrosFinanceiro = {}) =>
      baixarArquivo(`/financeiro/lancamentos/exportar${montarQuery(filtros)}`, 'lancamentos.xlsx'),

    anos: () => requisitar<AnosFinanceiros>('/financeiro/anos'),
    definirMesFechamento: (ano: number, mes_fechamento: number) =>
      requisitar<{ ano: number; mes_fechamento: number }>(`/financeiro/exercicios/${ano}`, {
        method: 'PUT',
        body: JSON.stringify({ mes_fechamento }),
      }),
    rap: (ano?: number, mes_fechamento?: number) =>
      requisitar<RapResponse>(`/financeiro/rap${montarQuery({ ano, mes_fechamento })}`),
    atualizarItemOrcamento: (id: number, dados: Record<string, unknown>) =>
      requisitar<unknown>(`/financeiro/orcamento/itens/${id}`, { method: 'PUT', body: JSON.stringify(dados) }),
    resultado: (ano?: number, mes?: number) =>
      requisitar<ResultadoResponse>(`/financeiro/resultado${montarQuery({ ano, mes })}`),
    analise: (parametros: {
      ano?: number;
      edoa?: string;
      linha1?: string;
      linha2?: string;
      coluna?: string;
      mes_de?: number;
      mes_ate?: number;
    }) => {
      // edoa vazio precisa ir na URL ("todos"); undefined usa o padrão (LGPD).
      const { edoa, ...resto } = parametros;
      const query = montarQuery(resto);
      const sufixo = edoa === undefined ? '' : `${query ? '&' : '?'}edoa=${encodeURIComponent(edoa)}`;
      return requisitar<AnaliseResponse>(`/financeiro/analise${query}${sufixo}`);
    },
    planoHonorarios: (ano?: number) =>
      requisitar<PlanoHonorariosResponse>(`/financeiro/plano-honorarios${montarQuery({ ano })}`),
    contratos: (ano?: number) => requisitar<ContratosResponse>(`/financeiro/contratos${montarQuery({ ano })}`),

    adiantamentos: (filtros: { em_aberto?: boolean; area?: string; ano?: number } = {}) =>
      requisitar<Adiantamento[]>(`/financeiro/adiantamentos${montarQuery(filtros)}`),
    criarAdiantamento: (dados: Record<string, unknown>) =>
      requisitar<Adiantamento>('/financeiro/adiantamentos', { method: 'POST', body: JSON.stringify(dados) }),
    atualizarAdiantamento: (id: number, dados: Record<string, unknown>) =>
      requisitar<Adiantamento>(`/financeiro/adiantamentos/${id}`, { method: 'PUT', body: JSON.stringify(dados) }),
    excluirAdiantamento: (id: number) => requisitar<void>(`/financeiro/adiantamentos/${id}`, { method: 'DELETE' }),

    devolucoes: (filtros: { area?: string; fornecedor?: string; ano?: number } = {}) =>
      requisitar<Devolucao[]>(`/financeiro/devolucoes${montarQuery(filtros)}`),
    criarDevolucao: (dados: Record<string, unknown>) =>
      requisitar<Devolucao>('/financeiro/devolucoes', { method: 'POST', body: JSON.stringify(dados) }),
    atualizarDevolucao: (id: number, dados: Record<string, unknown>) =>
      requisitar<Devolucao>(`/financeiro/devolucoes/${id}`, { method: 'PUT', body: JSON.stringify(dados) }),
    excluirDevolucao: (id: number) => requisitar<void>(`/financeiro/devolucoes/${id}`, { method: 'DELETE' }),

    dominios: () => requisitar<DominiosResponse>('/financeiro/cadastros/dominios'),
    criarDominio: (tipo: string, valor: string) =>
      requisitar<unknown>('/financeiro/cadastros/dominios', { method: 'POST', body: JSON.stringify({ tipo, valor }) }),
    excluirDominio: (id: number) => requisitar<void>(`/financeiro/cadastros/dominios/${id}`, { method: 'DELETE' }),
    contas: () => requisitar<ContaContabil[]>('/financeiro/cadastros/contas'),
    salvarConta: (dados: Omit<ContaContabil, 'id'>, id?: number) =>
      requisitar<ContaContabil>(id ? `/financeiro/cadastros/contas/${id}` : '/financeiro/cadastros/contas', {
        method: id ? 'PUT' : 'POST',
        body: JSON.stringify(dados),
      }),
    excluirConta: (id: number) => requisitar<void>(`/financeiro/cadastros/contas/${id}`, { method: 'DELETE' }),

    baixarModelo: () => baixarArquivo('/financeiro/importacoes/modelo', 'modelo-pagamentos-juridico.xlsx'),
    previewImportacao: (arquivo: File) => {
      const form = new FormData();
      form.append('arquivo', arquivo);
      return requisitar<PreviewFinanceiro>('/financeiro/importacoes/preview', { method: 'POST', body: form });
    },
    importar: (arquivo: File, ano?: number) => {
      const form = new FormData();
      form.append('arquivo', arquivo);
      return requisitar<ImportacaoFinanceira>(`/financeiro/importacoes${montarQuery({ ano })}`, {
        method: 'POST',
        body: form,
      });
    },
  },
};
