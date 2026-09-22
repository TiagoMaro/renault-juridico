import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Eye,
  Info,
  Scale,
  TrendingDown,
  TrendingUp,
  XCircle,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { api } from '../api/client';
import type { FiltrosProcesso } from '../api/types';
import { NaturezaBadge, StatusBadge } from '../components/Badges';
import { Carregando, ErroCarregamento, EstadoVazio } from '../components/Estados';
import FiltrosGlobais, { BotaoFiltros } from '../components/FiltrosGlobais';
import { useRequisicao } from '../hooks/useRequisicao';
import type { NavigateFn } from '../types';
import { CORES_RISCO, data as formatarData, moedaCompacta, numero, percentual } from '../utils/formato';

const BRAND = '#0035AD';
const PHASE_COLORS = ['#0035AD', '#7C3AED', '#0891B2', '#059669', '#94A3B8', '#F59E0B'];

interface Props {
  navigate: NavigateFn;
}

type Metrica = 'processos' | 'valor_causa' | 'valor_risco';

export default function DashboardPage({ navigate }: Props) {
  const [metric, setMetric] = useState<Metrica>('processos');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filtros, setFiltros] = useState<FiltrosProcesso>({});

  const chaveFiltros = JSON.stringify(filtros);
  const { dados, carregando, erro, recarregar } = useRequisicao(
    () => api.dashboard.obter(filtros),
    [chaveFiltros],
  );

  const metricCfg: Record<Metrica, { label: string; color: string; moeda: boolean }> = {
    processos: { label: 'Qtd. de Processos', color: BRAND, moeda: false },
    valor_causa: { label: 'Valor da Causa', color: '#7C3AED', moeda: true },
    valor_risco: { label: 'Valor em Risco', color: '#EA580C', moeda: true },
  };

  const periodo = useMemo(() => {
    if (!dados?.evolucao?.length) return '';
    return `${dados.evolucao[0].mes} a ${dados.evolucao[dados.evolucao.length - 1].mes}`;
  }, [dados]);

  const filtrosAtivos = Object.values(filtros).filter(Boolean).length;

  if (carregando && !dados) return <Carregando mensagem="Consolidando indicadores..." />;
  if (erro) return <ErroCarregamento mensagem={erro} aoTentarNovamente={recarregar} />;
  if (!dados) return null;

  const { kpis, evolucao, por_natureza, por_fase, por_risco, por_posicao, risco_por_natureza } = dados;
  const semDados = kpis.total_processos.valor === 0;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 font-display">Dashboard Jurídico</h1>
          <p className="text-sm text-slate-500 mt-0.5">Visão consolidada dos processos e exposição jurídica</p>
        </div>
        <div className="flex items-center gap-2">
          <BotaoFiltros
            aberto={filtersOpen}
            aoAlternar={() => setFiltersOpen(o => !o)}
            quantidade={filtrosAtivos}
          />
        </div>
      </div>

      <FiltrosGlobais
        filtros={filtros}
        aoAlterar={setFiltros}
        aberto={filtersOpen}
        aoAlternar={() => setFiltersOpen(o => !o)}
      />

      {semDados ? (
        <div className="bg-white rounded-xl border border-slate-200">
          <EstadoVazio
            titulo="Nenhum processo encontrado"
            descricao={
              filtrosAtivos > 0
                ? 'Nenhum processo atende aos filtros aplicados. Ajuste ou limpe os filtros.'
                : 'Importe a planilha enviada pelo escritório para alimentar o dashboard.'
            }
            acao={
              filtrosAtivos > 0 ? (
                <button
                  onClick={() => setFiltros({})}
                  className="px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white text-slate-600 hover:bg-slate-50"
                >
                  Limpar filtros
                </button>
              ) : (
                <button
                  onClick={() => navigate('import')}
                  className="px-3 py-2 text-sm rounded-lg text-white hover:opacity-90"
                  style={{ background: BRAND }}
                >
                  Importar planilha
                </button>
              )
            }
          />
        </div>
      ) : (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
            <KpiCard
              icon={Scale}
              title="Total de processos"
              value={numero(kpis.total_processos.valor)}
              trend={kpis.total_processos.variacao_percentual}
              invertido={false}
              desc="vs. mês anterior"
              color={BRAND}
            />
            <KpiCard
              icon={CheckCircle2}
              title="Processos ativos"
              value={numero(kpis.processos_ativos.valor)}
              trend={null}
              invertido={false}
              desc="em andamento"
              color="#0891B2"
            />
            <KpiCard
              icon={XCircle}
              title="Processos inativos"
              value={numero(kpis.processos_inativos.valor)}
              trend={null}
              invertido={false}
              desc="encerrados/arquivados"
              color="#94A3B8"
            />
            <KpiCard
              icon={TrendingUp}
              title="Valor total das causas"
              value={moedaCompacta(kpis.valor_causa_total.valor)}
              trend={kpis.valor_causa_total.variacao_percentual}
              invertido
              desc="vs. mês anterior"
              color="#7C3AED"
            />
            <KpiCard
              icon={AlertTriangle}
              title="Valor total em risco"
              value={moedaCompacta(kpis.valor_risco_total.valor)}
              trend={kpis.valor_risco_total.variacao_percentual}
              invertido
              desc="exposição financeira"
              color="#EA580C"
            />
            <KpiCard
              icon={Info}
              title="Defesa pendente"
              value={numero(kpis.defesa_pendente.valor)}
              trend={null}
              invertido
              desc="processos sem defesa"
              color="#DC2626"
            />
          </div>

          {/* Row 2: Evolution + Risk distribution */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 p-5">
              <div className="flex items-center justify-between mb-5">
                <div>
                  <h3 className="font-semibold text-slate-900 text-sm font-display">Evolução dos Processos</h3>
                  <p className="text-xs text-slate-400 mt-0.5">{periodo} · acumulado no período</p>
                </div>
                <div className="flex rounded-lg overflow-hidden border border-slate-200">
                  {(['processos', 'valor_causa', 'valor_risco'] as const).map(m => (
                    <button
                      key={m}
                      onClick={() => setMetric(m)}
                      className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                        metric === m ? 'text-white' : 'text-slate-500 hover:bg-slate-50'
                      }`}
                      style={metric === m ? { background: metricCfg[m].color } : {}}
                    >
                      {m === 'processos' ? 'Qtd.' : m === 'valor_causa' ? 'Causa' : 'Risco'}
                    </button>
                  ))}
                </div>
              </div>
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={evolucao}>
                  <defs>
                    <linearGradient id="metricGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={metricCfg[metric].color} stopOpacity={0.12} />
                      <stop offset="95%" stopColor={metricCfg[metric].color} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
                  <XAxis dataKey="mes" tick={{ fontSize: 11, fill: '#94A3B8' }} axisLine={false} tickLine={false} />
                  <YAxis
                    tick={{ fontSize: 11, fill: '#94A3B8' }}
                    axisLine={false}
                    tickLine={false}
                    width={60}
                    tickFormatter={(v: number) => (metricCfg[metric].moeda ? moedaCompacta(v) : numero(v))}
                  />
                  <Tooltip
                    contentStyle={{
                      background: '#fff',
                      border: '1px solid #E2E8F0',
                      borderRadius: '8px',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                      fontSize: 12,
                    }}
                    formatter={(v: number) => [
                      metricCfg[metric].moeda ? moedaCompacta(v) : numero(v),
                      metricCfg[metric].label,
                    ]}
                  />
                  <Area
                    type="monotone"
                    dataKey={metric}
                    stroke={metricCfg[metric].color}
                    fill="url(#metricGrad)"
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4, fill: metricCfg[metric].color }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            {/* Risk distribution donut */}
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <h3 className="font-semibold text-slate-900 text-sm font-display mb-1">Distribuição de Risco</h3>
              <p className="text-xs text-slate-400 mb-4">Por nível de exposição</p>
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie
                    data={por_risco}
                    cx="50%"
                    cy="50%"
                    innerRadius={48}
                    outerRadius={72}
                    dataKey="quantidade"
                    nameKey="label"
                    paddingAngle={3}
                  >
                    {por_risco.map(item => (
                      <Cell key={item.label} fill={CORES_RISCO[item.label] ?? '#94A3B8'} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '8px', fontSize: 12 }}
                    formatter={(v: number, n: string) => [`${numero(v)} processos`, n]}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-2 mt-2">
                {por_risco.map(item => (
                  <div key={item.label} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <span
                        className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                        style={{ background: CORES_RISCO[item.label] ?? '#94A3B8' }}
                      />
                      <span className="text-slate-600">{item.label}</span>
                    </div>
                    <span className="font-medium text-slate-800">{numero(item.quantidade)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Row 3: By nature + By phase */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <h3 className="font-semibold text-slate-900 text-sm font-display mb-1">Processos por Natureza</h3>
              <p className="text-xs text-slate-400 mb-4">Volume por tipo de ação</p>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={por_natureza} layout="vertical" margin={{ left: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11, fill: '#94A3B8' }} axisLine={false} tickLine={false} />
                  <YAxis
                    type="category"
                    dataKey="label"
                    tick={{ fontSize: 11, fill: '#64748B' }}
                    axisLine={false}
                    tickLine={false}
                    width={90}
                  />
                  <Tooltip
                    contentStyle={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '8px', fontSize: 12 }}
                    formatter={(v: number) => [numero(v), 'Processos']}
                  />
                  <Bar dataKey="quantidade" fill={BRAND} radius={[0, 4, 4, 0]} name="Processos" />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <h3 className="font-semibold text-slate-900 text-sm font-display mb-1">Distribuição por Fase</h3>
              <p className="text-xs text-slate-400 mb-4">Fase processual atual</p>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie
                    data={por_fase}
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    dataKey="quantidade"
                    nameKey="label"
                    paddingAngle={2}
                  >
                    {por_fase.map((_, i) => (
                      <Cell key={i} fill={PHASE_COLORS[i % PHASE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '8px', fontSize: 12 }}
                    formatter={(v: number, n: string) => [`${numero(v)} processos`, n]}
                  />
                  <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Row 4: Position + Value by nature */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <h3 className="font-semibold text-slate-900 text-sm font-display mb-1">Processos por Posição</h3>
              <p className="text-xs text-slate-400 mb-4">Polo ativo vs. polo passivo</p>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={por_posicao}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748B' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: '#94A3B8' }} axisLine={false} tickLine={false} />
                  <Tooltip
                    contentStyle={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '8px', fontSize: 12 }}
                    formatter={(v: number) => [numero(v), 'Processos']}
                  />
                  <Bar dataKey="quantidade" name="Processos" radius={[4, 4, 0, 0]}>
                    {por_posicao.map((item, i) => (
                      <Cell key={i} fill={item.label === 'Polo Ativo' ? BRAND : '#94A3B8'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <h3 className="font-semibold text-slate-900 text-sm font-display mb-1">
                Valor em Risco por Natureza
              </h3>
              <p className="text-xs text-slate-400 mb-4">Exposição financeira</p>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={risco_por_natureza} layout="vertical" margin={{ left: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" horizontal={false} />
                  <XAxis
                    type="number"
                    tick={{ fontSize: 11, fill: '#94A3B8' }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v: number) => moedaCompacta(v)}
                  />
                  <YAxis
                    type="category"
                    dataKey="label"
                    tick={{ fontSize: 11, fill: '#64748B' }}
                    axisLine={false}
                    tickLine={false}
                    width={90}
                  />
                  <Tooltip
                    contentStyle={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '8px', fontSize: 12 }}
                    formatter={(v: number) => [moedaCompacta(v), 'Valor em risco']}
                  />
                  <Bar dataKey="valor_risco" fill="#EA580C" radius={[0, 4, 4, 0]} name="Valor em risco" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Pontos de atenção */}
          {dados.pontos_atencao.length > 0 && (
            <div>
              <h3 className="font-semibold text-slate-900 text-sm font-display mb-3">Pontos de Atenção</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
                {dados.pontos_atencao.map((ponto, i) => {
                  const estilo = {
                    critico: { icone: XCircle, cor: 'text-red-600', bg: 'bg-red-50', borda: 'border-red-100' },
                    alerta: {
                      icone: AlertTriangle,
                      cor: 'text-amber-600',
                      bg: 'bg-amber-50',
                      borda: 'border-amber-100',
                    },
                    info: { icone: Info, cor: 'text-blue-600', bg: 'bg-blue-50', borda: 'border-blue-100' },
                  }[ponto.severidade] ?? {
                    icone: Info,
                    cor: 'text-slate-600',
                    bg: 'bg-slate-50',
                    borda: 'border-slate-200',
                  };
                  const Icone = estilo.icone;
                  return (
                    <div
                      key={i}
                      className={`flex items-start gap-3 p-3.5 rounded-xl border ${estilo.bg} ${estilo.borda}`}
                    >
                      <Icone size={16} className={`${estilo.cor} flex-shrink-0 mt-0.5`} />
                      <p className="text-xs text-slate-700 leading-relaxed">{ponto.texto}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Recent processes table */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-slate-900 text-sm font-display">
                  Processos com Movimentação Recente
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">Últimas atualizações registradas</p>
              </div>
              <button
                onClick={() => navigate('processes')}
                className="flex items-center gap-1 text-xs font-medium transition-colors hover:underline"
                style={{ color: BRAND }}
              >
                Ver todos <ChevronRight size={14} />
              </button>
            </div>
            <div className="overflow-x-auto">
              {dados.processos_recentes.length === 0 ? (
                <EstadoVazio titulo="Nenhuma movimentação registrada nos processos filtrados." />
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100">
                      {[
                        'Número dos Autos',
                        'Autor/Réu',
                        'Natureza',
                        'Comarca',
                        'Fase',
                        'Status',
                        'Valor Risco',
                        'Última Mov.',
                        '',
                      ].map(h => (
                        <th
                          key={h}
                          className="text-left text-xs font-medium text-slate-500 px-4 py-3 whitespace-nowrap"
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {dados.processos_recentes.map(p => (
                      <tr
                        key={p.id}
                        onClick={() => navigate('process-detail', { processId: p.id })}
                        className="border-b border-slate-50 hover:bg-slate-50 cursor-pointer transition-colors last:border-0"
                      >
                        <td className="px-4 py-3 font-mono text-xs text-slate-600 whitespace-nowrap">
                          {p.numero_autos}
                        </td>
                        <td className="px-4 py-3 text-slate-800 max-w-[160px] truncate">{p.autor_reu}</td>
                        <td className="px-4 py-3">
                          <NaturezaBadge natureza={p.natureza} />
                        </td>
                        <td className="px-4 py-3 text-slate-600 text-xs whitespace-nowrap">{p.comarca ?? '—'}</td>
                        <td className="px-4 py-3 text-xs text-slate-600 whitespace-nowrap">{p.fase_processual}</td>
                        <td className="px-4 py-3">
                          <StatusBadge status={p.status} />
                        </td>
                        <td className="px-4 py-3 text-xs font-medium text-slate-800 whitespace-nowrap font-mono">
                          {moedaCompacta(p.valor_risco)}
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">
                          {formatarData(p.ultima_movimentacao)}
                        </td>
                        <td className="px-4 py-3">
                          <button className="text-slate-400 hover:text-slate-700 transition-colors" title="Ver detalhes">
                            <Eye size={15} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function KpiCard({
  icon: Icon,
  title,
  value,
  trend,
  invertido,
  desc,
  color,
}: {
  icon: React.ElementType;
  title: string;
  value: string;
  trend: number | null;
  /** true quando crescer é ruim (valores de risco/causa). */
  invertido: boolean;
  desc: string;
  color: string;
}) {
  // Sem histórico suficiente o backend devolve null — não inventamos variação.
  // Variação zero também não vira badge: seta vermelha em "0,0%" engana o leitor.
  const mostrarVariacao = trend !== null && Math.abs(trend) >= 0.05;
  const subiu = (trend ?? 0) > 0;
  const bom = invertido ? !subiu : subiu;

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: `${color}14` }}>
          <Icon size={18} style={{ color }} />
        </div>
        {mostrarVariacao && (
          <div className={`flex items-center gap-1 text-xs font-medium ${bom ? 'text-green-600' : 'text-red-500'}`}>
            {subiu ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
            {percentual(trend)}
          </div>
        )}
      </div>
      <div className="text-xl font-bold text-slate-900 font-display">{value}</div>
      <div className="text-xs font-medium text-slate-600 mt-1">{title}</div>
      <div className="text-xs text-slate-400 mt-0.5">{desc}</div>
    </div>
  );
}
