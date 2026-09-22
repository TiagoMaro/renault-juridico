import { useEffect, useState } from 'react';
import { ArrowUpDown, ChevronLeft, ChevronRight, Download, Loader2, Pencil, Plus, Search, X } from 'lucide-react';

import { api } from '../api/client';
import type { FiltrosFinanceiro, Lancamento } from '../api/types';
import { Carregando, ErroCarregamento } from '../components/Estados';
import FiltrosFinanceiros, { BotaoFiltrosFinanceiros } from '../components/FiltrosFinanceiros';
import FormularioLancamento from '../components/financeiro/FormularioLancamento';
import { useAuth } from '../context/AuthContext';
import { useRequisicao } from '../hooks/useRequisicao';
import { data as formatarData, moeda, moedaCompacta, numero } from '../utils/formato';

const BRAND = '#0035AD';
const POR_PAGINA = 25;

const CORES_STATUS: Record<string, string> = {
  'Lançar Pgto': 'bg-slate-100 text-slate-600',
  'RC Criada': 'bg-indigo-100 text-indigo-700',
  'Pedido Concluído': 'bg-blue-100 text-blue-700',
  'Pedido Recepcionado': 'bg-cyan-100 text-cyan-700',
  'Enviado para pagamento': 'bg-amber-100 text-amber-700',
  Pago: 'bg-green-100 text-green-700',
};

const COLUNAS: { label: string; key: string }[] = [
  { label: 'Status', key: 'status' },
  { label: 'Área', key: 'area' },
  { label: 'EDOA', key: 'edoa' },
  { label: 'Categoria', key: 'categoria' },
  { label: 'Motivo', key: 'motivo' },
  { label: 'Descrição', key: '' },
  { label: 'Mês ref.', key: 'mes_referencia_num' },
  { label: 'Pagamento', key: 'data_pagamento' },
  { label: 'Chamado', key: '' },
  { label: 'Centro custo', key: '' },
  { label: 'Valor', key: 'valor' },
];

export default function LancamentosPage() {
  const [busca, setBusca] = useState('');
  const [termo, setTermo] = useState('');
  const [filtros, setFiltros] = useState<FiltrosFinanceiro>({});
  const [filtrosAbertos, setFiltrosAbertos] = useState(false);
  const [ordenarPor, setOrdenarPor] = useState('data_pagamento');
  const [direcao, setDirecao] = useState<'asc' | 'desc'>('desc');
  const [pagina, setPagina] = useState(1);
  const [exportando, setExportando] = useState(false);
  const [selecionado, setSelecionado] = useState<Lancamento | null>(null);
  const [formulario, setFormulario] = useState<Lancamento | 'novo' | null>(null);
  const { podeAcessar } = useAuth();
  const podeEditar = podeAcessar('Analista');
  const { dados: opcoes } = useRequisicao(() => api.financeiro.opcoesFiltro(), []);

  useEffect(() => {
    const tempo = setTimeout(() => {
      setTermo(busca);
      setPagina(1);
    }, 350);
    return () => clearTimeout(tempo);
  }, [busca]);

  const chave = JSON.stringify({ filtros, termo, ordenarPor, direcao, pagina });
  const { dados, carregando, erro, recarregar } = useRequisicao(
    () =>
      api.financeiro.lancamentos({
        ...filtros,
        busca: termo || undefined,
        pagina,
        por_pagina: POR_PAGINA,
        ordenar_por: ordenarPor,
        direcao,
      }),
    [chave],
  );

  const ordenar = (key: string) => {
    if (!key) return;
    if (ordenarPor === key) setDirecao(d => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setOrdenarPor(key);
      setDirecao('desc');
    }
    setPagina(1);
  };

  const exportar = async () => {
    setExportando(true);
    try {
      await api.financeiro.exportarLancamentos({ ...filtros, busca: termo || undefined });
    } finally {
      setExportando(false);
    }
  };

  const filtrosAtivos = Object.values(filtros).filter(v => v !== undefined && v !== '').length;
  const total = dados?.total ?? 0;
  const totalPaginas = dados?.total_paginas ?? 1;

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-slate-900 font-display">Controle de Lançamentos</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {carregando && !dados
              ? 'Carregando...'
              : `${numero(total)} lançamento(s) · ${moeda(dados?.total_valor ?? 0)}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {podeEditar && (
            <button
              onClick={() => setFormulario('novo')}
              className="flex items-center gap-2 px-3 py-2 text-sm rounded-lg text-white font-medium"
              style={{ background: BRAND }}
            >
              <Plus size={15} /> Novo lançamento
            </button>
          )}
          <BotaoFiltrosFinanceiros
            aberto={filtrosAbertos}
            aoAlternar={() => setFiltrosAbertos(a => !a)}
            quantidade={filtrosAtivos}
          />
          <button
            onClick={exportar}
            disabled={exportando || total === 0}
            className="flex items-center gap-2 px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-50"
          >
            {exportando ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
            Exportar
          </button>
        </div>
      </div>

      <FiltrosFinanceiros filtros={filtros} aoAlterar={setFiltros} aberto={filtrosAbertos} />

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-3">
          <div className="relative flex-1 max-w-md">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={busca}
              onChange={e => setBusca(e.target.value)}
              placeholder="Buscar por descrição, chamado, RC, pedido ou documento..."
              className="w-full pl-8 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:border-transparent bg-white"
              style={{ '--tw-ring-color': BRAND } as React.CSSProperties}
            />
          </div>
          {(termo || filtrosAtivos > 0) && (
            <button
              onClick={() => {
                setBusca('');
                setFiltros({});
              }}
              className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700"
            >
              <X size={12} /> Limpar
            </button>
          )}
        </div>

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
                        className={`text-left text-xs font-medium text-slate-500 px-4 py-3 whitespace-nowrap ${
                          label === 'Valor' ? 'text-right' : ''
                        }`}
                      >
                        {key ? (
                          <button
                            onClick={() => ordenar(key)}
                            className={`flex items-center gap-1 hover:text-slate-700 transition-colors ${
                              label === 'Valor' ? 'ml-auto' : ''
                            }`}
                          >
                            {label}
                            <ArrowUpDown
                              size={11}
                              className={ordenarPor === key ? 'text-slate-700' : 'text-slate-300'}
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
                  {(dados?.itens ?? []).length === 0 ? (
                    <tr>
                      <td colSpan={COLUNAS.length} className="text-center py-16 text-slate-400 text-sm">
                        Nenhum lançamento encontrado com os filtros aplicados.
                      </td>
                    </tr>
                  ) : (
                    dados?.itens.map(item => (
                      <tr
                        key={item.id}
                        onClick={() => setSelecionado(item)}
                        className="border-b border-slate-50 hover:bg-slate-50 cursor-pointer transition-colors last:border-0"
                      >
                        <td className="px-4 py-3">
                          <span
                            className={`px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${
                              CORES_STATUS[item.status] ?? 'bg-slate-100 text-slate-600'
                            }`}
                          >
                            {item.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-700 whitespace-nowrap">{item.area ?? '—'}</td>
                        <td className="px-4 py-3 text-xs text-slate-600 whitespace-nowrap max-w-[150px] truncate">
                          {item.edoa ?? '—'}
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-600 whitespace-nowrap">
                          {item.categoria ?? '—'}
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-600 whitespace-nowrap">{item.motivo ?? '—'}</td>
                        <td className="px-4 py-3 text-xs text-slate-500 max-w-[220px] truncate">
                          {item.descricao ?? '—'}
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-600 whitespace-nowrap">
                          {item.mes_referencia ?? '—'}
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">
                          {formatarData(item.data_pagamento)}
                        </td>
                        <td className="px-4 py-3 text-xs font-mono text-slate-500 whitespace-nowrap">
                          {item.chamado ?? '—'}
                        </td>
                        <td className="px-4 py-3 text-xs font-mono text-slate-500 whitespace-nowrap">
                          {item.centro_custo ?? '—'}
                        </td>
                        <td className="px-4 py-3 text-xs font-mono font-medium text-slate-800 whitespace-nowrap text-right">
                          {moeda(item.valor)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="px-4 py-3 border-t border-slate-100 flex items-center justify-between">
              <span className="text-xs text-slate-500">
                {total === 0
                  ? 'Nenhum registro'
                  : `Mostrando ${(pagina - 1) * POR_PAGINA + 1}–${Math.min(pagina * POR_PAGINA, total)} de ${numero(total)}`}
              </span>
              <div className="flex items-center gap-1">
                <button
                  disabled={pagina === 1}
                  onClick={() => setPagina(p => p - 1)}
                  className="w-7 h-7 flex items-center justify-center rounded border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-40"
                >
                  <ChevronLeft size={14} />
                </button>
                {Array.from({ length: Math.min(totalPaginas, 5) }, (_, i) => {
                  const inicio = Math.max(1, Math.min(pagina - 2, totalPaginas - 4));
                  const pg = inicio + i;
                  if (pg > totalPaginas) return null;
                  return (
                    <button
                      key={pg}
                      onClick={() => setPagina(pg)}
                      className={`w-7 h-7 flex items-center justify-center rounded text-xs font-medium ${
                        pg === pagina ? 'text-white' : 'border border-slate-200 text-slate-600 hover:bg-slate-50'
                      }`}
                      style={pg === pagina ? { background: BRAND } : {}}
                    >
                      {pg}
                    </button>
                  );
                })}
                {totalPaginas > 5 && <span className="text-slate-400 text-xs px-1">...</span>}
                <button
                  disabled={pagina >= totalPaginas}
                  onClick={() => setPagina(p => p + 1)}
                  className="w-7 h-7 flex items-center justify-center rounded border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-40"
                >
                  <ChevronRight size={14} />
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {selecionado && (
        <DetalheLancamento
          item={selecionado}
          aoFechar={() => setSelecionado(null)}
          aoEditar={
            podeEditar
              ? () => {
                  setFormulario(selecionado);
                  setSelecionado(null);
                }
              : undefined
          }
        />
      )}
      {formulario && (
        <FormularioLancamento
          lancamento={formulario === 'novo' ? null : formulario}
          opcoes={opcoes}
          anoPadrao={filtros.ano ?? opcoes?.anos?.[0]}
          aoFechar={() => setFormulario(null)}
          aoSalvar={() => {
            setFormulario(null);
            recarregar();
          }}
        />
      )}
    </div>
  );
}

function DetalheLancamento({
  item,
  aoFechar,
  aoEditar,
}: {
  item: Lancamento;
  aoFechar: () => void;
  aoEditar?: () => void;
}) {
  const campos: { label: string; valor: string }[] = [
    { label: 'Status', valor: item.status },
    { label: 'Valor', valor: moeda(item.valor) },
    { label: 'Área', valor: item.area ?? '—' },
    { label: 'Categoria', valor: item.categoria ?? '—' },
    { label: 'EDOA', valor: item.edoa ?? '—' },
    { label: 'Motivo', valor: item.motivo ?? '—' },
    { label: 'Tipo de pagamento', valor: item.tipo_pagamento ?? '—' },
    { label: 'Recorrência', valor: item.recorrencia ?? '—' },
    { label: 'Referência', valor: item.referencia ?? '—' },
    { label: 'Mês de referência', valor: item.mes_referencia ?? '—' },
    { label: 'Data de pagamento', valor: formatarData(item.data_pagamento) },
    { label: 'Envio para pagamento', valor: formatarData(item.envio_para_pagamento) },
    { label: 'RC', valor: item.rc ?? '—' },
    { label: 'Nº pedido', valor: item.numero_pedido ?? '—' },
    { label: 'Recepção', valor: item.recepcao ?? '—' },
    { label: 'Item', valor: item.item ?? '—' },
    { label: 'Chamado', valor: item.chamado ?? '—' },
    { label: 'Documento pago', valor: item.documento_pago ?? '—' },
    { label: 'Centro de custo', valor: item.centro_custo ?? '—' },
    { label: 'Conta contábil', valor: item.conta_contabil ?? '—' },
    { label: 'Origem', valor: item.manual ? 'Lançado no sistema' : `Planilha${item.linha_planilha ? ` (linha ${item.linha_planilha})` : ''}` },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xl w-full max-w-3xl max-h-[88vh] overflow-y-auto">
        <div className="px-6 py-4 border-b border-slate-100 flex items-start justify-between sticky top-0 bg-white">
          <div>
            <h2 className="font-semibold text-slate-900 font-display">Lançamento</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              {moedaCompacta(item.valor)} · {item.area ?? 'sem área'} · {item.mes_referencia ?? 'sem mês'}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {aoEditar && (
              <button
                onClick={aoEditar}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"
              >
                <Pencil size={13} /> Editar
              </button>
            )}
            <button onClick={aoFechar} className="text-slate-400 hover:text-slate-700">
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="px-6 py-5">
          {item.descricao && (
            <div className="mb-5 p-3 rounded-lg bg-slate-50 border border-slate-100">
              <p className="text-xs font-medium text-slate-500 mb-1">Descrição</p>
              <p className="text-sm text-slate-700">{item.descricao}</p>
            </div>
          )}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-4">
            {campos.map(({ label, valor }) => (
              <div key={label}>
                <dt className="text-xs font-medium text-slate-500 mb-0.5">{label}</dt>
                <dd className="text-sm text-slate-800 break-words">{valor}</dd>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
