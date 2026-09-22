import { useState } from 'react';
import { Download, FileText, Filter, Loader2, Printer } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

import { api } from '../api/client';
import type { FiltrosProcesso, RelatorioPreview } from '../api/types';
import { RiscoBadge } from '../components/Badges';
import { Aviso } from '../components/Estados';
import { useAuth } from '../context/AuthContext';
import { useRequisicao } from '../hooks/useRequisicao';
import { dataHora, moeda, moedaCompacta, numero } from '../utils/formato';

const BRAND = '#0035AD';

const CAMPOS: { key: keyof FiltrosProcesso; label: string; opcoes?: string[]; tipo?: 'data' }[] = [
  { key: 'data_inicio', label: 'Início a partir de', tipo: 'data' },
  { key: 'data_fim', label: 'Início até', tipo: 'data' },
  {
    key: 'natureza',
    label: 'Natureza',
    opcoes: ['Trabalhista', 'Cível', 'Consumidor', 'Tributário', 'Contratual', 'Administrativo', 'Outros'],
  },
  { key: 'status', label: 'Status', opcoes: ['Ativo', 'Inativo'] },
  {
    key: 'fase',
    label: 'Fase Processual',
    opcoes: ['Conhecimento', 'Recurso', 'Execução', 'Cumprimento de sentença', 'Encerrado', 'Outros'],
  },
  { key: 'posicao', label: 'Posição Renault', opcoes: ['Polo Ativo', 'Polo Passivo'] },
  { key: 'risco', label: 'Faixa de risco', opcoes: ['Baixo', 'Médio', 'Alto', 'Crítico'] },
];

export default function ReportsPage() {
  const { usuario } = useAuth();
  const [filtros, setFiltros] = useState<FiltrosProcesso>({});
  const [aplicados, setAplicados] = useState<FiltrosProcesso | null>(null);
  const [exportando, setExportando] = useState<'excel' | 'pdf' | null>(null);
  const [erroExport, setErroExport] = useState<string | null>(null);

  const { dados: opcoes } = useRequisicao(() => api.processos.opcoesFiltro(), []);

  const chave = JSON.stringify(aplicados);
  const { dados, carregando, erro } = useRequisicao(
    () => (aplicados ? api.relatorios.preview(aplicados) : Promise.resolve(null as RelatorioPreview | null)),
    [chave],
  );

  const set = (campo: keyof FiltrosProcesso) => (e: React.ChangeEvent<HTMLSelectElement | HTMLInputElement>) =>
    setFiltros(f => ({ ...f, [campo]: e.target.value || undefined }));

  const exportar = async (formato: 'excel' | 'pdf') => {
    setErroExport(null);
    setExportando(formato);
    try {
      if (formato === 'excel') await api.relatorios.exportarExcel(aplicados ?? {});
      else await api.relatorios.exportarPdf(aplicados ?? {});
    } catch (problema) {
      setErroExport(problema instanceof Error ? problema.message : 'Falha ao gerar o arquivo.');
    } finally {
      setExportando(null);
    }
  };

  const descricaoFiltros =
    aplicados && Object.entries(aplicados).filter(([, v]) => v).length > 0
      ? Object.entries(aplicados)
          .filter(([, v]) => v)
          .map(([k, v]) => `${CAMPOS.find(c => c.key === k)?.label ?? k}: ${v}`)
          .join(' · ')
      : 'Nenhum filtro aplicado (base completa)';

  return (
    <div className="p-6 space-y-5">
      <div>
        <h1 className="text-xl font-bold text-slate-900 font-display">Relatórios</h1>
        <p className="text-sm text-slate-500 mt-0.5">Gere relatórios gerenciais personalizados para exportação</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Filters panel */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4 h-fit">
          <div className="flex items-center gap-2">
            <Filter size={15} className="text-slate-500" />
            <h3 className="font-semibold text-slate-900 text-sm font-display">Filtros do relatório</h3>
          </div>

          {CAMPOS.map(({ key, label, opcoes: lista, tipo }) => (
            <div key={key}>
              <label className="block text-xs font-medium text-slate-500 mb-1.5">{label}</label>
              {tipo === 'data' ? (
                <input
                  type="date"
                  value={(filtros[key] as string) ?? ''}
                  onChange={set(key)}
                  className={campoClass}
                />
              ) : (
                <select value={(filtros[key] as string) ?? ''} onChange={set(key)} className={campoClass}>
                  <option value="">Todos</option>
                  {(lista ?? []).map(o => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              )}
            </div>
          ))}

          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1.5">Comarca</label>
            <select value={filtros.comarca ?? ''} onChange={set('comarca')} className={campoClass}>
              <option value="">Todas</option>
              {(opcoes?.comarcas ?? []).map(c => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1.5">Escritório</label>
            <select value={filtros.escritorio ?? ''} onChange={set('escritorio')} className={campoClass}>
              <option value="">Todos</option>
              {(opcoes?.escritorios ?? []).map(e => (
                <option key={e} value={e}>
                  {e}
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={() => setAplicados({ ...filtros })}
            disabled={carregando}
            className="w-full py-2.5 rounded-lg text-sm font-medium text-white transition-all hover:opacity-90 disabled:opacity-60"
            style={{ background: BRAND }}
          >
            {carregando ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Gerando...
              </span>
            ) : (
              'Gerar relatório'
            )}
          </button>

          {aplicados && (
            <button
              onClick={() => {
                setFiltros({});
                setAplicados(null);
              }}
              className="w-full text-xs text-slate-500 hover:text-slate-700 transition-colors"
            >
              Limpar e recomeçar
            </button>
          )}
        </div>

        {/* Preview */}
        <div className="lg:col-span-2 space-y-4">
          {erro && <Aviso texto={erro} tom="erro" />}
          {erroExport && <Aviso texto={erroExport} tom="erro" />}

          {!dados ? (
            <div className="bg-white rounded-xl border border-slate-200 p-16 flex flex-col items-center justify-center text-center">
              <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center mb-4">
                <FileText size={28} className="text-slate-400" />
              </div>
              <p className="font-semibold text-slate-700">Configure os filtros e gere o relatório</p>
              <p className="text-sm text-slate-400 mt-1">A prévia será exibida aqui após a geração.</p>
            </div>
          ) : (
            <>
              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                {/* Report header */}
                <div className="px-6 py-5 border-b border-slate-100" style={{ background: '#0D1B3E' }}>
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded bg-[#0035AD] flex items-center justify-center text-white text-xs font-bold">
                        RG
                      </div>
                      <div>
                        <p className="text-white font-semibold text-sm font-display">Renault Geely do Brasil</p>
                        <p className="text-xs" style={{ color: '#7BA3D4' }}>
                          Gestão Jurídica · Relatório Gerencial
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-white text-sm font-medium">{numero(dados.total_processos)} processos</p>
                      <p className="text-xs" style={{ color: '#7BA3D4' }}>
                        Gerado em {dataHora(new Date().toISOString())}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Filters used */}
                <div className="px-6 py-3 bg-slate-50 border-b border-slate-100">
                  <p className="text-xs text-slate-500">
                    <span className="font-medium">Filtros aplicados:</span> {descricaoFiltros}
                  </p>
                </div>

                {/* KPI Summary */}
                <div className="px-6 py-5 border-b border-slate-100">
                  <h3 className="font-semibold text-slate-900 text-sm mb-4 font-display">Indicadores Principais</h3>
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                    {[
                      { label: 'Processos', value: numero(dados.total_processos) },
                      { label: 'Ativos', value: numero(dados.processos_ativos) },
                      { label: 'Risco crítico', value: numero(dados.processos_criticos) },
                      { label: 'Valor da causa', value: moedaCompacta(dados.valor_causa_total) },
                      { label: 'Valor em risco', value: moedaCompacta(dados.valor_risco_total) },
                    ].map(({ label, value }) => (
                      <div key={label} className="text-center p-3 bg-slate-50 rounded-lg">
                        <p className="text-lg font-bold text-slate-900 font-display">{value}</p>
                        <p className="text-xs text-slate-500 mt-0.5">{label}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Chart */}
                <div className="px-6 py-5 border-b border-slate-100">
                  <h3 className="font-semibold text-slate-900 text-sm mb-4 font-display">Processos por Natureza</h3>
                  <ResponsiveContainer width="100%" height={160}>
                    <BarChart data={dados.por_natureza}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
                      <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#64748B' }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 10, fill: '#94A3B8' }} axisLine={false} tickLine={false} />
                      <Tooltip
                        contentStyle={{
                          background: '#fff',
                          border: '1px solid #E2E8F0',
                          borderRadius: '8px',
                          fontSize: 11,
                        }}
                        formatter={(v: number) => [numero(v), 'Processos']}
                      />
                      <Bar dataKey="quantidade" fill={BRAND} radius={[3, 3, 0, 0]} name="Processos" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                {/* Table */}
                <div className="px-6 py-5">
                  <h3 className="font-semibold text-slate-900 text-sm mb-4 font-display">
                    Processos Detalhados{' '}
                    <span className="font-normal text-slate-400">
                      (amostra de {dados.amostra.length} de {numero(dados.total_processos)})
                    </span>
                  </h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-slate-100">
                          {['Número dos Autos', 'Natureza', 'Fase', 'Risco', 'Valor Risco'].map(h => (
                            <th key={h} className="text-left text-xs font-medium text-slate-500 pb-2 pr-3">
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {dados.amostra.map(p => (
                          <tr key={p.id} className="border-b border-slate-50 last:border-0">
                            <td className="py-2 pr-3 font-mono text-slate-600 whitespace-nowrap">{p.numero_autos}</td>
                            <td className="py-2 pr-3 text-slate-700">{p.natureza}</td>
                            <td className="py-2 pr-3 text-slate-600">{p.fase_processual}</td>
                            <td className="py-2 pr-3">
                              <RiscoBadge risco={p.risco} />
                            </td>
                            <td className="py-2 pr-3 font-mono text-slate-700 whitespace-nowrap">
                              {moeda(p.valor_risco)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="text-xs text-slate-400 mt-3 text-right">
                    Responsável: {usuario?.nome ?? '—'} · Sistema de Gestão Jurídica Renault Geely
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3">
                <button
                  onClick={() => window.print()}
                  className="flex items-center gap-2 px-4 py-2 text-sm border border-slate-200 rounded-lg bg-white text-slate-600 hover:bg-slate-50 transition-colors"
                >
                  <Printer size={15} /> Imprimir
                </button>
                <button
                  onClick={() => exportar('excel')}
                  disabled={exportando !== null}
                  className="flex items-center gap-2 px-4 py-2 text-sm border border-green-200 rounded-lg bg-green-50 text-green-700 hover:bg-green-100 transition-colors disabled:opacity-60"
                >
                  {exportando === 'excel' ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
                  Exportar Excel
                </button>
                <button
                  onClick={() => exportar('pdf')}
                  disabled={exportando !== null}
                  className="flex items-center gap-2 px-4 py-2 text-sm rounded-lg text-white hover:opacity-90 transition-colors disabled:opacity-60"
                  style={{ background: BRAND }}
                >
                  {exportando === 'pdf' ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
                  Exportar PDF
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

const campoClass =
  'w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:border-transparent bg-white text-slate-700';
