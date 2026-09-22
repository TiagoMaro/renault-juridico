/** Preferências locais do usuário (ficam no navegador, não no banco). */

const CHAVE = 'renault_juridico_preferencias';

export interface Preferencias {
  /** Quantos processos por página na tela de Processos. */
  itensPorPagina: number;
  /** Tipos de ponto de atenção exibidos no sino da barra superior. */
  alertasVisiveis: string[];
}

export const TIPOS_ALERTA: { tipo: string; label: string; descricao: string }[] = [
  {
    tipo: 'sem_defesa',
    label: 'Processos sem defesa',
    descricao: 'Alertar sobre processos ativos sem defesa registrada',
  },
  {
    tipo: 'risco_critico',
    label: 'Risco crítico',
    descricao: 'Alertar quando houver processos classificados como críticos',
  },
  {
    tipo: 'exposicao_alto_risco',
    label: 'Exposição financeira alta',
    descricao: 'Alertar sobre o valor concentrado em risco alto/crítico',
  },
  {
    tipo: 'sem_movimentacao',
    label: 'Processos parados',
    descricao: 'Alertar sobre processos sem movimentação há mais de 90 dias',
  },
  {
    tipo: 'movimentacao_recente',
    label: 'Movimentações recentes',
    descricao: 'Informar processos movimentados nos últimos 30 dias',
  },
];

const PADRAO: Preferencias = {
  itensPorPagina: 10,
  alertasVisiveis: TIPOS_ALERTA.map(a => a.tipo),
};

export const EVENTO_PREFERENCIAS = 'renault:preferencias';

export function lerPreferencias(): Preferencias {
  try {
    const bruto = localStorage.getItem(CHAVE);
    if (!bruto) return PADRAO;
    return { ...PADRAO, ...(JSON.parse(bruto) as Partial<Preferencias>) };
  } catch {
    return PADRAO;
  }
}

export function salvarPreferencias(preferencias: Preferencias): void {
  try {
    localStorage.setItem(CHAVE, JSON.stringify(preferencias));
  } catch {
    /* navegação anônima: a preferência vale só para esta sessão */
  }
  window.dispatchEvent(new CustomEvent(EVENTO_PREFERENCIAS, { detail: preferencias }));
}
