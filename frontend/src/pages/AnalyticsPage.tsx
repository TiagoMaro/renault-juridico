import { useState } from 'react';
import { AlertTriangle, Clock, Lightbulb, TrendingUp, XCircle } from 'lucide-react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { api } from '../api/client';
import type { FiltrosProcesso, Insight, Processo } from '../api/types';
import { RiscoBadge } from '../components/Badges';
import { Carregando, ErroCarregamento, EstadoVazio } from '../components/Estados';
import FiltrosGlobais, { BotaoFiltros } from '../components/FiltrosGlobais';
import { useRequisicao } from '../hooks/useRequisicao';
import { data as formatarData, moedaCompacta, numero } from '../utils/formato';

const BRAND = '#0035AD';
const CORES_FASE = ['#0035AD', '#7C3AED', '#0891B2', '#059669', '#94A3B8', '#F59E0B'];

const ESTILO_INSIGHT: Record<Insight['tipo'], { icon: React.ElementType; color: string; bg: string }> = {
  critico: { icon: XCircle, color: '#DC2626', bg: '#FEF2F2' },
  alerta: { icon: AlertTriangle, color: '#D97706', bg: '#FFFBEB' },
  positivo: { icon: TrendingUp, color: '#16A34A', bg: '#F0FDF4' },
  info: { icon: TrendingUp, color: BRAND, bg: '#EEF3FF' },
};

export default function AnalyticsPage() {
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filtros, setFiltros] = useState<FiltrosProcesso>({});
  const chave = JSON.stringify(filtros);

  const { dados, carregando, erro, recarregar } = useRequisicao(() => api.analises.obter(filtros), [chave]);

  // Listas de acompanhamento — cada uma é uma consulta filtrada de verdade.
  const { dados: altoRisco } = useRequisicao(
    () =>
      api.processos.listar({
        ...filtros,
        riscos: ['Alto', 'Crítico'],
        por_pagina: 5,
        ordenar_por: 'valor_risco',
        direcao: 'desc',
      }),
    [chave],
  );
  const { dados: semDefesa } = useRequisicao(
    () => api.processos.listar({ ...filtros, defesa: false, status: 'Ativo', por_pagina: 5 }),
    [chave],
  );
  const { dados: paradas } = useRequisicao(
    () =>
      api.processos.listar({
        ...filtros,
        sem_movimentacao_dias: 90,
        status: 'Ativo',
        por_pagina: 5,
        ordenar_por: 'ultima_movimentacao',
        direcao: 'asc',
      }),
    [chave],
  );

  if (carregando && !dados) return <Carregando mensagem="Calculando análises..." />;
  if (erro) return <ErroCarregamento mensagem={erro} aoTentarNovamente={recarregar} />;
  if (!dados) return null;

  // Exposição acumulada mês a mês, a partir da data de início dos processos.
  const evolucaoRisco = dados.evolucao.map(ponto => ({ mes: ponto.mes, valor_risco: ponto.valor_risco }));
  const filtrosAtivos = Object.values(filtros).filter(Boolean).length;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 font-display">Análises Jurídicas</h1>
          <p className="text-sm text-slate-500 mt-0.5">Análises aprofundadas do portfólio de processos</p>
        </div>
        <BotaoFiltros aberto={filtersOpen} aoAlternar={() => setFiltersOpen(o => !o)} quantidade={filtrosAtivos} />
      </div>

      <FiltrosGlobais
        filtros={filtros}
        aoAlterar={setFiltros}
        aberto={filtersOpen}
        aoAlternar={() => setFiltersOpen(o => !o)}
      />

      {/* Indicadores de acompanhamento */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: 'Processos de alto/crítico risco', valor: numero(dados.processos_alto_risco), cor: '#DC2626' },
          { label: 'Processos sem defesa', valor: numero(dados.processos_sem_defesa), cor: '#D97706' },
          { label: 'Sem movimentação (+90 dias)', valor: numero(dados.processos_sem_movimentacao), cor: '#94A3B8' },
          {
            label: 'Exposição alto/crítico',
            valor: moedaCompacta(dados.valor_risco_alto_critico),
            cor: '#EA580C',
          },
        ].map(({ label, valor, cor }) => (
          <div key={label} className="bg-white rounded-xl border border-slate-200 p-4">
            <p className="text-2xl font-bold font-display" style={{ color: cor }}>
              {valor}
            </p>
            <p className="text-xs text-slate-500 mt-1">{label}</p>
          </div>
        ))}
      </div>

      {/* Insights */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Lightbulb size={16} className="text-amber-500" />
          <h2 className="font-semibold text-slate-900 text-sm font-display">Insights</h2>
          <span className="px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full text-xs font-medium">
            Calculado a partir dos dados importados
          </span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {dados.insights.map((insight, i) => {
            const estilo = ESTILO_INSIGHT[insight.tipo] ?? ESTILO_INSIGHT.info;
            const Icone = estilo.icon;
            return (
              <div
                key={i}
                className="flex items-start gap-3 p-4 rounded-xl border"
                style={{ background: estilo.bg, borderColor: `${estilo.color}22` }}
              >
                <Icone size={16} style={{ color: estilo.color }} className="flex-shrink-0 mt-0.5" />
                <p className="text-sm text-slate-700 leading-relaxed">{insight.texto}</p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Row 1: evolução do valor em risco + quantidade */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h3 className="font-semibold text-slate-900 text-sm font-display mb-1">Evolução do Valor em Risco</h3>
          <p className="text-xs text-slate-400 mb-4">Exposição acumulada por mês</p>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={evolucaoRisco}>
              <defs>
                <linearGradient id="grad-risco" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#EA580C" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="#EA580C" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
              <XAxis dataKey="mes" tick={{ fontSize: 11, fill: '#94A3B8' }} axisLine={false} tickLine={false} />
              <YAxis
                tick={{ fontSize: 11, fill: '#94A3B8' }}
                axisLine={false}
                tickLine={false}
                width={65}
                tickFormatter={(v: number) => moedaCompacta(v)}
              />
              <Tooltip
                contentStyle={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '8px', fontSize: 12 }}
                formatter={(v: number) => [moedaCompacta(v), 'Valor em risco']}
              />
              <Area
                type="monotone"
                dataKey="valor_risco"
                stroke="#EA580C"
                fill="url(#grad-risco)"
                strokeWidth={2}
                name="Valor em risco"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h3 className="font-semibold text-slate-900 text-sm font-display mb-1">
            Evolução da Quantidade de Processos
          </h3>
          <p className="text-xs text-slate-400 mb-4">Total acumulado por mês</p>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={dados.evolucao}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
              <XAxis dataKey="mes" tick={{ fontSize: 11, fill: '#94A3B8' }} axisLine={false} tickLine={false} />
              <YAxis
                tick={{ fontSize: 11, fill: '#94A3B8' }}
                axisLine={false}
                tickLine={false}
                domain={['dataMin - 2', 'dataMax + 2']}
              />
              <Tooltip
                contentStyle={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '8px', fontSize: 12 }}
                formatter={(v: number) => [numero(v), 'Processos']}
              />
              <Line
                type="monotone"
                dataKey="processos"
                stroke={BRAND}
                strokeWidth={2}
                dot={{ fill: BRAND, r: 3 }}
                activeDot={{ r: 5 }}
                name="Processos"
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Row 2: comarcas + naturezas com maior exposição */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h3 className="font-semibold text-slate-900 text-sm font-display mb-1">
            Comarcas com Maior Concentração
          </h3>
          <p className="text-xs text-slate-400 mb-4">Volume de processos por comarca</p>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={dados.comarcas_maior_concentracao} layout="vertical" margin={{ left: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 11, fill: '#94A3B8' }} axisLine={false} tickLine={false} />
              <YAxis
                type="category"
                dataKey="label"
                tick={{ fontSize: 11, fill: '#64748B' }}
                axisLine={false}
                tickLine={false}
                width={120}
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
          <h3 className="font-semibold text-slate-900 text-sm font-display mb-1">
            Fases Processuais com Maior Volume
          </h3>
          <p className="text-xs text-slate-400 mb-4">Distribuição por etapa processual</p>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={dados.fases_maior_volume}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#64748B' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: '#94A3B8' }} axisLine={false} tickLine={false} />
              <Tooltip
                contentStyle={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '8px', fontSize: 12 }}
                formatter={(v: number) => [numero(v), 'Processos']}
              />
              <Bar dataKey="quantidade" name="Processos" radius={[4, 4, 0, 0]}>
                {dados.fases_maior_volume.map((_, i) => (
                  <Cell key={i} fill={CORES_FASE[i % CORES_FASE.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Row 3: listas de acompanhamento */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <ListaAlerta
          title="Processos de Alto e Crítico Risco"
          icon={XCircle}
          iconColor="#DC2626"
          processos={altoRisco?.itens ?? []}
          render={p => <RiscoBadge risco={p.risco} />}
        />
        <ListaAlerta
          title="Processos Sem Defesa"
          icon={AlertTriangle}
          iconColor="#D97706"
          processos={semDefesa?.itens ?? []}
          render={() => (
            <span className="px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded text-xs flex-shrink-0">Pendente</span>
          )}
        />
        <ListaAlerta
          title="Sem Movimentação (+90 dias)"
          icon={Clock}
          iconColor="#94A3B8"
          processos={paradas?.itens ?? []}
          render={p => (
            <span className="text-xs text-slate-400 flex-shrink-0 whitespace-nowrap">
              {formatarData(p.ultima_movimentacao)}
            </span>
          )}
        />
      </div>
    </div>
  );
}

function ListaAlerta({
  title,
  icon: Icon,
  iconColor,
  processos,
  render,
}: {
  title: string;
  icon: React.ElementType;
  iconColor: string;
  processos: Processo[];
  render: (p: Processo) => React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="px-4 py-3.5 border-b border-slate-100 flex items-center gap-2">
        <Icon size={15} style={{ color: iconColor }} />
        <h3 className="font-semibold text-slate-900 text-xs font-display">{title}</h3>
      </div>
      {processos.length === 0 ? (
        <EstadoVazio titulo="Nada por aqui" descricao="Nenhum processo nesta condição." />
      ) : (
        <div className="divide-y divide-slate-50">
          {processos.map(p => (
            <div key={p.id} className="px-4 py-3 hover:bg-slate-50 transition-colors">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs text-slate-700 font-medium truncate">{p.autor_reu}</p>
                  <p className="text-xs text-slate-400 font-mono mt-0.5 truncate">{p.numero_autos}</p>
                </div>
                {render(p)}
              </div>
              <p className="text-xs text-slate-500 mt-1">
                {p.natureza} · {p.comarca ?? 'Comarca não informada'} · {moedaCompacta(p.valor_risco)}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
