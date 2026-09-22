import { useEffect, useState } from 'react';
import {
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  Download,
  Edit2,
  Eye,
  Loader2,
  Plus,
  Search,
  X,
} from 'lucide-react';

import { api } from '../api/client';
import type { FiltrosProcesso, Processo } from '../api/types';
import { NaturezaBadge, RiscoBadge, StatusBadge } from '../components/Badges';
import { Carregando, ErroCarregamento } from '../components/Estados';
import FormularioProcesso from '../components/FormularioProcesso';
import { useAuth } from '../context/AuthContext';
import { useRequisicao } from '../hooks/useRequisicao';
import type { NavigateFn } from '../types';
import { data as formatarData, moedaCompacta, numero } from '../utils/formato';
import { lerPreferencias } from '../utils/preferencias';

interface Props {
  navigate: NavigateFn;
}

const BRAND = '#0035AD';

const COLUNAS: { label: string; key: string }[] = [
  { label: 'Status', key: 'status' },
  { label: 'Número dos Autos', key: 'numero_autos' },
  { label: 'Autor/Réu', key: 'autor_reu' },
  { label: 'Natureza', key: 'natureza' },
  { label: 'Comarca', key: 'comarca' },
  { label: 'Fase', key: 'fase_processual' },
  { label: 'Posição', key: '' },
  { label: 'Risco', key: 'risco' },
  { label: 'Valor Causa', key: 'valor_causa' },
  { label: 'Valor Risco', key: 'valor_risco' },
  { label: 'Última Mov.', key: 'ultima_movimentacao' },
  { label: '', key: '' },
];

export default function ProcessesPage({ navigate }: Props) {
  const { podeAcessar } = useAuth();
  const podeEditar = podeAcessar('Analista');
  // Definido em Configurações → Preferências.
  const POR_PAGINA = lerPreferencias().itensPorPagina;

  const [search, setSearch] = useState('');
  const [termoBusca, setTermoBusca] = useState('');
  const [filtros, setFiltros] = useState<FiltrosProcesso>({});
  const [sortKey, setSortKey] = useState('ultima_movimentacao');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);
  const [exportando, setExportando] = useState(false);
  const [formAberto, setFormAberto] = useState(false);
  const [processoEmEdicao, setProcessoEmEdicao] = useState<Processo | null>(null);

  // Busca vinda da barra superior do Layout.
  useEffect(() => {
    const pendente = window.sessionStorage.getItem('busca_pendente');
    if (pendente) {
      setSearch(pendente);
      setTermoBusca(pendente);
      window.sessionStorage.removeItem('busca_pendente');
    }
    const aoBuscar = (evento: Event) => {
      const termo = (evento as CustomEvent<string>).detail;
      setSearch(termo);
      setTermoBusca(termo);
      setPage(1);
    };
    window.addEventListener('renault:busca', aoBuscar);
    return () => window.removeEventListener('renault:busca', aoBuscar);
  }, []);

  // Evita uma requisição por tecla digitada.
  useEffect(() => {
    const tempo = setTimeout(() => {
      setTermoBusca(search);
      setPage(1);
    }, 350);
    return () => clearTimeout(tempo);
  }, [search]);

  const chave = JSON.stringify({ filtros, termoBusca, sortKey, sortDir, page });
  const { dados, carregando, erro, recarregar } = useRequisicao(
    () =>
      api.processos.listar({
        ...filtros,
        busca: termoBusca || undefined,
        pagina: page,
        por_pagina: POR_PAGINA,
        ordenar_por: sortKey,
        direcao: sortDir,
      }),
    [chave],
  );

  const toggleSort = (key: string) => {
    if (!key) return;
    if (sortKey === key) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortKey(key);
      setSortDir('asc');
    }
    setPage(1);
  };

  const alterarFiltro = (campo: keyof FiltrosProcesso, valor: string) => {
    setFiltros(f => ({ ...f, [campo]: valor || undefined }));
    setPage(1);
  };

  const limparFiltros = () => {
    setFiltros({});
    setSearch('');
    setTermoBusca('');
    setPage(1);
  };

  const exportar = async () => {
    setExportando(true);
    try {
      await api.processos.exportar({ ...filtros, busca: termoBusca || undefined });
    } catch {
      /* o cliente já sinaliza a falha */
    } finally {
      setExportando(false);
    }
  };

  const temFiltros = Boolean(termoBusca) || Object.values(filtros).some(Boolean);
  const total = dados?.total ?? 0;
  const totalPaginas = dados?.total_paginas ?? 1;
  const itens = dados?.itens ?? [];

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 font-display">Processos</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {carregando ? 'Carregando...' : `${numero(total)} processo(s) encontrado(s)`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={exportar}
            disabled={exportando || total === 0}
            className="flex items-center gap-2 px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-50"
          >
            {exportando ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
            Exportar
          </button>
          {podeEditar && (
            <button
              onClick={() => {
                setProcessoEmEdicao(null);
                setFormAberto(true);
              }}
              className="flex items-center gap-2 px-3 py-2 text-sm rounded-lg text-white transition-colors hover:opacity-90"
              style={{ background: BRAND }}
            >
              <Plus size={15} />
              Novo processo
            </button>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-slate-200 p-4">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
          <div className="relative lg:col-span-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar processo, parte, comarca..."
              className="w-full pl-8 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:border-transparent bg-white"
              style={{ '--tw-ring-color': BRAND } as React.CSSProperties}
            />
          </div>
          <Select value={filtros.status ?? ''} onChange={e => alterarFiltro('status', e.target.value)}>
            <option value="">Todos os status</option>
            <option>Ativo</option>
            <option>Inativo</option>
          </Select>
          <Select value={filtros.natureza ?? ''} onChange={e => alterarFiltro('natureza', e.target.value)}>
            <option value="">Todas as naturezas</option>
            {['Trabalhista', 'Cível', 'Consumidor', 'Tributário', 'Contratual', 'Administrativo', 'Outros'].map(n => (
              <option key={n}>{n}</option>
            ))}
          </Select>
          <Select value={filtros.risco ?? ''} onChange={e => alterarFiltro('risco', e.target.value)}>
            <option value="">Todos os riscos</option>
            {['Baixo', 'Médio', 'Alto', 'Crítico'].map(r => (
              <option key={r}>{r}</option>
            ))}
          </Select>
          <Select value={filtros.fase ?? ''} onChange={e => alterarFiltro('fase', e.target.value)}>
            <option value="">Todas as fases</option>
            {['Conhecimento', 'Recurso', 'Execução', 'Cumprimento de sentença', 'Encerrado', 'Outros'].map(f => (
              <option key={f}>{f}</option>
            ))}
          </Select>
        </div>
        {temFiltros && (
          <button
            onClick={limparFiltros}
            className="mt-3 flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700 transition-colors"
          >
            <X size={12} /> Limpar filtros
          </button>
        )}
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {erro ? (
          <ErroCarregamento mensagem={erro} aoTentarNovamente={recarregar} />
        ) : carregando && !dados ? (
          <Carregando />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/60">
                    {COLUNAS.map(({ label, key }, i) => (
                      <th
                        key={`${label}-${i}`}
                        className="text-left text-xs font-medium text-slate-500 px-4 py-3 whitespace-nowrap"
                      >
                        {key ? (
                          <button
                            onClick={() => toggleSort(key)}
                            className="flex items-center gap-1 hover:text-slate-700 transition-colors"
                          >
                            {label}
                            <ArrowUpDown
                              size={11}
                              className={sortKey === key ? 'text-slate-700' : 'text-slate-300'}
                            />
                          </button>
                        ) : (
                          label
                        )}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {itens.length === 0 ? (
                    <tr>
                      <td colSpan={12} className="text-center py-16 text-slate-400 text-sm">
                        {temFiltros
                          ? 'Nenhum processo encontrado com os filtros aplicados.'
                          : 'Nenhum processo cadastrado. Importe uma planilha para começar.'}
                      </td>
                    </tr>
                  ) : (
                    itens.map(p => (
                      <tr
                        key={p.id}
                        className="border-b border-slate-50 hover:bg-slate-50 cursor-pointer transition-colors last:border-0"
                        onClick={() => navigate('process-detail', { processId: p.id })}
                      >
                        <td className="px-4 py-3">
                          <StatusBadge status={p.status} />
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-slate-600 whitespace-nowrap">
                          {p.numero_autos}
                        </td>
                        <td className="px-4 py-3 text-slate-800 max-w-[180px] truncate">{p.autor_reu}</td>
                        <td className="px-4 py-3">
                          <NaturezaBadge natureza={p.natureza} />
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-600 whitespace-nowrap">{p.comarca ?? '—'}</td>
                        <td className="px-4 py-3 text-xs text-slate-600 whitespace-nowrap">{p.fase_processual}</td>
                        <td className="px-4 py-3">
                          <span
                            className={`text-xs ${
                              p.posicao_renault === 'Polo Ativo' ? 'text-blue-700' : 'text-slate-600'
                            }`}
                          >
                            {p.posicao_renault}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <RiscoBadge risco={p.risco} />
                        </td>
                        <td className="px-4 py-3 text-xs font-mono text-slate-700 whitespace-nowrap">
                          {moedaCompacta(p.valor_causa)}
                        </td>
                        <td className="px-4 py-3 text-xs font-mono font-medium text-slate-800 whitespace-nowrap">
                          {moedaCompacta(p.valor_risco)}
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">
                          {formatarData(p.ultima_movimentacao)}
                        </td>
                        <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => navigate('process-detail', { processId: p.id })}
                              className="text-slate-400 hover:text-slate-700 transition-colors"
                              title="Ver detalhes"
                            >
                              <Eye size={15} />
                            </button>
                            {podeEditar && (
                              <button
                                onClick={() => {
                                  setProcessoEmEdicao(p);
                                  setFormAberto(true);
                                }}
                                className="text-slate-400 hover:text-slate-700 transition-colors"
                                title="Editar"
                              >
                                <Edit2 size={15} />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="px-4 py-3 border-t border-slate-100 flex items-center justify-between">
              <span className="text-xs text-slate-500">
                {total === 0
                  ? 'Nenhum registro'
                  : `Mostrando ${(page - 1) * POR_PAGINA + 1}–${Math.min(page * POR_PAGINA, total)} de ${numero(total)}`}
              </span>
              <div className="flex items-center gap-1">
                <button
                  disabled={page === 1}
                  onClick={() => setPage(p => p - 1)}
                  className="w-7 h-7 flex items-center justify-center rounded border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-40 transition-colors"
                >
                  <ChevronLeft size={14} />
                </button>
                {Array.from({ length: Math.min(totalPaginas, 5) }, (_, i) => {
                  // Janela deslizante em volta da página atual.
                  const inicio = Math.max(1, Math.min(page - 2, totalPaginas - 4));
                  const pg = inicio + i;
                  if (pg > totalPaginas) return null;
                  return (
                    <button
                      key={pg}
                      onClick={() => setPage(pg)}
                      className={`w-7 h-7 flex items-center justify-center rounded text-xs font-medium transition-colors ${
                        pg === page ? 'text-white' : 'border border-slate-200 text-slate-600 hover:bg-slate-50'
                      }`}
                      style={pg === page ? { background: BRAND } : {}}
                    >
                      {pg}
                    </button>
                  );
                })}
                {totalPaginas > 5 && <span className="text-slate-400 text-xs px-1">...</span>}
                <button
                  disabled={page >= totalPaginas}
                  onClick={() => setPage(p => p + 1)}
                  className="w-7 h-7 flex items-center justify-center rounded border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-40 transition-colors"
                >
                  <ChevronRight size={14} />
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {formAberto && (
        <FormularioProcesso
          processo={processoEmEdicao}
          aoFechar={() => setFormAberto(false)}
          aoSalvar={() => {
            setFormAberto(false);
            recarregar();
          }}
        />
      )}
    </div>
  );
}

function Select({
  value,
  onChange,
  children,
}: {
  value: string;
  onChange: React.ChangeEventHandler<HTMLSelectElement>;
  children: React.ReactNode;
}) {
  return (
    <select
      value={value}
      onChange={onChange}
      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:border-transparent bg-white text-slate-700"
      style={{ '--tw-ring-color': BRAND } as React.CSSProperties}
    >
      {children}
    </select>
  );
}
