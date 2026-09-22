import { useState } from 'react';
import { AlertTriangle, Eye, RefreshCw } from 'lucide-react';

import { api } from '../api/client';
import type { ImportacaoDetalhe } from '../api/types';
import { Carregando, ErroCarregamento, EstadoVazio } from '../components/Estados';
import { useRequisicao } from '../hooks/useRequisicao';
import { dataHora, numero } from '../utils/formato';

const BRAND = '#0035AD';

export default function ImportHistoryPage() {
  const [selecionada, setSelecionada] = useState<number | null>(null);
  const [detalhe, setDetalhe] = useState<ImportacaoDetalhe | null>(null);
  const [carregandoDetalhe, setCarregandoDetalhe] = useState(false);

  const { dados, carregando, erro, recarregar } = useRequisicao(() => api.importacoes.listar(), []);
  const importacoes = dados ?? [];

  const abrirDetalhe = async (id: number) => {
    if (selecionada === id) {
      setSelecionada(null);
      setDetalhe(null);
      return;
    }
    setSelecionada(id);
    setCarregandoDetalhe(true);
    try {
      setDetalhe(await api.importacoes.obter(id));
    } finally {
      setCarregandoDetalhe(false);
    }
  };

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 font-display">Histórico de Importações</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {carregando ? 'Carregando...' : `${importacoes.length} importação(ões) registrada(s)`}
          </p>
        </div>
        <button
          onClick={recarregar}
          className="flex items-center gap-2 px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white text-slate-600 hover:bg-slate-50 transition-colors"
        >
          <RefreshCw size={14} /> Atualizar
        </button>
      </div>

      {erro ? (
        <ErroCarregamento mensagem={erro} aoTentarNovamente={recarregar} />
      ) : carregando ? (
        <Carregando />
      ) : importacoes.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200">
          <EstadoVazio
            titulo="Nenhuma importação registrada"
            descricao="Assim que a primeira planilha for importada, o histórico aparece aqui."
          />
        </div>
      ) : (
        <div className={`grid gap-4 ${selecionada ? 'lg:grid-cols-[1fr_320px]' : 'grid-cols-1'}`}>
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/60">
                    {['Arquivo', 'Data', 'Usuário', 'Processos', 'Válidos', 'Inconsistências', 'Status', 'Ações'].map(
                      h => (
                        <th
                          key={h}
                          className="text-left text-xs font-medium text-slate-500 px-4 py-3 whitespace-nowrap"
                        >
                          {h}
                        </th>
                      ),
                    )}
                  </tr>
                </thead>
                <tbody>
                  {importacoes.map(imp => (
                    <tr
                      key={imp.id}
                      className={`border-b border-slate-50 last:border-0 cursor-pointer transition-colors ${
                        selecionada === imp.id ? 'bg-blue-50' : 'hover:bg-slate-50'
                      }`}
                      onClick={() => abrirDetalhe(imp.id)}
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded bg-green-100 flex items-center justify-center flex-shrink-0">
                            <span className="text-green-700 text-[10px] font-bold">
                              {imp.arquivo.split('.').pop()?.slice(0, 3).toUpperCase() ?? 'XLS'}
                            </span>
                          </div>
                          <div className="min-w-0">
                            <span className="block text-xs text-slate-700 max-w-[220px] truncate">
                              {imp.arquivo}
                            </span>
                            {imp.escritorio && (
                              <span className="block text-[10px] text-slate-400 max-w-[220px] truncate">
                                {imp.escritorio}
                              </span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">{dataHora(imp.data)}</td>
                      <td className="px-4 py-3 text-xs text-slate-700">{imp.usuario_nome ?? '—'}</td>
                      <td className="px-4 py-3 text-xs font-medium text-slate-800 text-center">
                        {numero(imp.total_processos)}
                      </td>
                      <td className="px-4 py-3 text-xs font-medium text-green-700 text-center">
                        {numero(imp.registros_validos)}
                      </td>
                      <td className="px-4 py-3 text-xs text-center">
                        {imp.total_inconsistencias > 0 ? (
                          <span className="text-amber-600 font-medium">{numero(imp.total_inconsistencias)}</span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={imp.status} />
                      </td>
                      <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                        <button
                          onClick={() => abrirDetalhe(imp.id)}
                          className="text-slate-400 hover:text-slate-700 transition-colors"
                          title="Detalhes"
                        >
                          <Eye size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Detail panel */}
          {selecionada && (
            <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-5 h-fit">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-slate-900 text-sm font-display">Detalhes da importação</h3>
                <button
                  onClick={() => {
                    setSelecionada(null);
                    setDetalhe(null);
                  }}
                  className="text-slate-400 hover:text-slate-600 text-xs"
                >
                  Fechar
                </button>
              </div>

              {carregandoDetalhe || !detalhe ? (
                <Carregando mensagem="Carregando detalhes..." />
              ) : (
                <>
                  <div className="p-3 rounded-xl border border-slate-100 bg-slate-50 break-all">
                    <p className="text-xs text-slate-500 mb-1">Arquivo</p>
                    <p className="text-sm font-medium text-slate-800">{detalhe.arquivo}</p>
                  </div>

                  <div className="space-y-3">
                    {[
                      { label: 'Data e hora', value: dataHora(detalhe.data) },
                      { label: 'Usuário', value: detalhe.usuario_nome ?? '—' },
                      { label: 'Escritório', value: detalhe.escritorio ?? '—' },
                      { label: 'Status', value: detalhe.status },
                      { label: 'Criados', value: numero(detalhe.criados) },
                      { label: 'Atualizados', value: numero(detalhe.atualizados) },
                      {
                        label: 'Duração',
                        value: detalhe.duracao_ms ? `${(detalhe.duracao_ms / 1000).toFixed(1)}s` : '—',
                      },
                    ].map(({ label, value }) => (
                      <div key={label} className="flex justify-between items-center text-sm gap-3">
                        <span className="text-slate-500 text-xs">{label}</span>
                        <span className="font-medium text-slate-800 text-xs text-right">{value}</span>
                      </div>
                    ))}
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { label: 'Total', value: detalhe.total_processos, color: '#0035AD', bg: '#EEF3FF' },
                      { label: 'Válidos', value: detalhe.registros_validos, color: '#16A34A', bg: '#F0FDF4' },
                      {
                        label: 'Alertas',
                        value: detalhe.total_inconsistencias,
                        color: detalhe.total_inconsistencias > 0 ? '#D97706' : '#94A3B8',
                        bg: detalhe.total_inconsistencias > 0 ? '#FFFBEB' : '#F8FAFC',
                      },
                    ].map(({ label, value, color, bg }) => (
                      <div key={label} className="text-center p-3 rounded-xl" style={{ background: bg }}>
                        <p className="text-xl font-bold font-display" style={{ color }}>
                          {numero(value)}
                        </p>
                        <p className="text-xs text-slate-500 mt-0.5">{label}</p>
                      </div>
                    ))}
                  </div>

                  {detalhe.total_processos > 0 && (
                    <div>
                      <div className="flex justify-between text-xs text-slate-500 mb-1.5">
                        <span>Taxa de sucesso</span>
                        <span className="font-medium text-green-700">
                          {Math.round((detalhe.registros_validos / detalhe.total_processos) * 100)}%
                        </span>
                      </div>
                      <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${Math.round((detalhe.registros_validos / detalhe.total_processos) * 100)}%`,
                            background: '#16A34A',
                          }}
                        />
                      </div>
                    </div>
                  )}

                  {detalhe.mensagem_erro && (
                    <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg border border-red-200 bg-red-50 text-xs text-red-700">
                      <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />
                      <span>{detalhe.mensagem_erro}</span>
                    </div>
                  )}

                  {detalhe.inconsistencias.length > 0 && (
                    <div>
                      <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
                        Inconsistências ({detalhe.inconsistencias.length})
                      </h4>
                      <div className="space-y-2 max-h-80 overflow-y-auto">
                        {detalhe.inconsistencias.map(inc => (
                          <div key={inc.id} className="p-2.5 rounded-lg border border-slate-100 bg-slate-50">
                            <div className="flex items-center justify-between gap-2 mb-1">
                              <span className="text-[10px] font-mono text-slate-500">Linha {inc.linha}</span>
                              <span
                                className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                                  inc.status === 'Pendente'
                                    ? 'bg-amber-100 text-amber-700'
                                    : 'bg-slate-200 text-slate-600'
                                }`}
                              >
                                {inc.status}
                              </span>
                            </div>
                            <p className="text-xs font-medium text-slate-700">{inc.campo}</p>
                            <p className="text-xs text-slate-500 mt-0.5">{inc.problema}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, string> = {
    'Concluído': 'bg-green-100 text-green-700',
    'Concluído com alertas': 'bg-amber-100 text-amber-700',
    Processando: 'bg-blue-100 text-blue-700',
    Erro: 'bg-red-100 text-red-700',
  };
  return (
    <span
      className={`px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${
        config[status] || 'bg-slate-100 text-slate-600'
      }`}
      style={status === 'Processando' ? { color: BRAND } : {}}
    >
      {status}
    </span>
  );
}
