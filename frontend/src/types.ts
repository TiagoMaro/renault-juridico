export type Page =
  | 'dashboard'
  | 'processes'
  | 'process-detail'
  | 'import'
  | 'import-history'
  | 'analytics'
  | 'reports'
  | 'users'
  | 'settings'
  // Módulo financeiro
  | 'fin-dashboard'
  | 'fin-lancamentos'
  | 'fin-orcamento'
  | 'fin-resultado'
  | 'fin-analise'
  | 'fin-cadastros'
  | 'fin-adiantamentos'
  | 'fin-devolucoes'
  | 'fin-import';

export type NavigateFn = (page: Page, params?: { processId?: number }) => void;
