import { useState } from 'react';
import {
  AlertTriangle,
  ArrowDownLeft,
  Banknote,
  CheckCircle2,
  Clock,
  Receipt,
  Wallet,
} from 'lucide-react';
import {
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
import type { FiltrosFinanceiro } from '../api/types';
import { Carregando, ErroCarregamento, EstadoVazio } from '../components/Estados';
import FiltrosFinanceiros, { BotaoFiltrosFinanceiros } from '../components/FiltrosFinanceiros';
import { useRequisicao } from '../hooks/useRequisicao';
import type { NavigateFn } from '../types';
import { moeda, moedaCompacta, numero } from '../utils/formato';

const BRAND = '#0035AD';
const CORES_AREA = ['#0035AD', '#7C3AED', '#0891B2', '#059669', '#EA580C', '#DC2626', '#F59E0B', '#94A3B8'];

interface Props {
  navigate: NavigateFn;
}

export default function FinanceDashboardPage({ navigate }: Props) {
  const [filtros, setFiltros] = useState<FiltrosFinanceiro>({});
  const [filtrosAbertos, setFiltrosAbertos] = useState(false);

  const chave = JSON.stringify(filtros);
  const { dados, carregando, erro, recarregar } = useRequisicao(
    () => api.financeiro.dashboard(filtros),
    [chave],
  );

  const filtrosAtivos = Object.values(filtros).filter(v => v !== undefined && v !== '').length;

  if (carregando && !dados) return <Carregando mensagem="Consolidando os pagamentos..." />;
  if (erro) return <ErroCarregamento mensagem={erro} aoTentarNovamente={recarregar} />;
  if (!dados) return null;

  const vazio = dados.total_geral.quantidade === 0;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 font-display">Dashboard Financeiro</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Pagamentos do Jurídico — visão consolidada por área, EDOA e mês
          </p>
        </div>
        <BotaoFiltrosFinanceiros
          aberto={filtrosAbertos}
          aoAlternar={() => setFiltrosAbertos(a => !a)}
          quantidade={filtrosAtivos}
        />
      </div>

      <FiltrosFinanceiros
        filtros={filtros}
        aoAlterar={setFiltros}
        aberto={filtrosAbertos}
      />

      {vazio ? (
        <div className="bg-white rounded-xl border border-slate-200">
          <EstadoVazio
            titulo="Nenhum lançamento encontrado"
            descricao={
              filtrosAtivos > 0
                ? 'Nenhum pagamento atende aos filtros aplicados.'
                : 'Importe a planilha de pagamentos do Jurídico para alimentar esta tela.'
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
                  onClick={() => navigate('fin-import')}
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
          {/* KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
            <Kpi
              icon={Banknote}
              titulo="Total lançado"
              valor={moedaCompacta(dados.total_geral.valor)}
              detalhe={`${numero(dados.total_geral.quantidade)} lançamentos`}
              cor={BRAND}
            />
            <Kpi
              icon={CheckCircle2}
              titulo="Pago"
              valor={moedaCompacta(dados.total_pago.valor)}
              detalhe={`${numero(dados.total_pago.quantidade)} liquidados`}
              cor="#16A34A"
            />
            <Kpi
              icon={Clock}
              titulo="Em processamento"
              valor={moedaCompacta(dados.em_processamento.valor)}
              detalhe={`${numero(dados.em_processamento.quantidade)} em aberto`}
              cor="#D97706"
            />
            <Kpi
              icon={Receipt}
              titulo="Ticket médio"
              valor={moedaCompacta(dados.ticket_medio.valor)}
              detalhe="por lançamento"
              cor="#7C3AED"
            />
            <Kpi
              icon={Wallet}
              titulo="Adiantamentos em aberto"
              valor={moedaCompacta(dados.adiantamentos_em_aberto.valor)}
              detalhe={`${numero(dados.adiantamentos_em_aberto.quantidade)} sem baixa`}
              cor="#EA580C"
            />
            <Kpi
              icon={ArrowDownLeft}
              titulo="Devoluções"
              valor={moedaCompacta(dados.devolucoes.valor)}
              detalhe={`${numero(dados.devolucoes.quantidade)} estornos`}
              cor="#0891B2"
            />
          </div>

          {/* Alertas */}
          {dados.alertas.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
              {dados.alertas.map((alerta, i) => (
                <div
                  key={i}
                  className="flex items-start gap-3 p-3.5 rounded-xl border border-amber-100 bg-amber-50"
                >
                  <AlertTriangle size={16} className="text-amber-600 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-slate-700 leading-relaxed">{alerta}</p>
                </div>
              ))}
            </div>
          )}

          {/* Evolução mensal */}
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h3 className="font-semibold text-slate-900 text-sm font-display">Pagamentos por mês</h3>
                <p className="text-xs text-slate-400 mt-0.5">Mês de referência · pago vs. em processamento</p>
              </div>
            </div>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={dados.por_mes}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
                <XAxis
                  dataKey="nome"
                  tick={{ fontSize: 11, fill: '#94A3B8' }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v: string) => v.slice(0, 3)}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: '#94A3B8' }}
                  axisLine={false}
                  tickLine={false}
                  width={70}
                  tickFormatter={(v: number) => moedaCompacta(v)}
                />
                <Tooltip
                  contentStyle={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '8px', fontSize: 12 }}
                  formatter={(v: number, nome: string) => [moeda(v), nome === 'pago' ? 'Pago' : 'Em processamento']}
                />
                <Legend
                  iconType="circle"
                  iconSize={8}
                  wrapperStyle={{ fontSize: 11 }}
                  formatter={(v: string) => (v === 'pago' ? 'Pago' : 'Em processamento')}
                />
                <Bar dataKey="pago" stackId="a" fill="#16A34A" radius={[0, 0, 0, 0]} name="pago" />
                <Bar
                  dataKey="em_processamento"
                  stackId="a"
                  fill="#D97706"
                  radius={[4, 4, 0, 0]}
                  name="em_processamento"
                />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Área e EDOA */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <h3 className="font-semibold text-slate-900 text-sm font-display mb-1">Gasto por área</h3>
              <p className="text-xs text-slate-400 mb-4">Participação no total do período</p>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={dados.por_area.slice(0, 8)} layout="vertical" margin={{ left: 10 }}>
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
                    width={120}
                  />
                  <Tooltip
                    contentStyle={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '8px', fontSize: 12 }}
                    formatter={(v: number) => [moeda(v), 'Total']}
                  />
                  <Bar dataKey="valor" fill={BRAND} radius={[0, 4, 4, 0]} name="Total" />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <h3 className="font-semibold text-slate-900 text-sm font-display mb-1">Gasto por EDOA</h3>
              <p className="text-xs text-slate-400 mb-4">Distribuição orçamentária</p>
              <ResponsiveContainer width="100%" height={240}>
                <PieChart>
                  <Pie
                    data={dados.por_edoa.slice(0, 8)}
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={90}
                    dataKey="valor"
                    nameKey="label"
                    paddingAngle={2}
                  >
                    {dados.por_edoa.slice(0, 8).map((_, i) => (
                      <Cell key={i} fill={CORES_AREA[i % CORES_AREA.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '8px', fontSize: 12 }}
                    formatter={(v: number, nome: string) => [moeda(v), nome]}
                  />
                  <Legend iconType="circle" iconSize={7} wrapperStyle={{ fontSize: 10 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Tabelas de composição */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <TabelaComposicao titulo="Por status" itens={dados.por_status} />
            <TabelaComposicao titulo="Por motivo" itens={dados.por_motivo.slice(0, 8)} />
            <TabelaComposicao titulo="Por centro de custo" itens={dados.por_centro_custo.slice(0, 8)} />
          </div>
        </>
      )}
    </div>
  );
}

function Kpi({
  icon: Icon,
  titulo,
  valor,
  detalhe,
  cor,
}: {
  icon: React.ElementType;
  titulo: string;
  valor: string;
  detalhe: string;
  cor: string;
}) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4">
      <div className="w-9 h-9 rounded-lg flex items-center justify-center mb-3" style={{ background: `${cor}14` }}>
        <Icon size={18} style={{ color: cor }} />
      </div>
      <div className="text-lg font-bold text-slate-900 font-display">{valor}</div>
      <div className="text-xs font-medium text-slate-600 mt-1">{titulo}</div>
      <div className="text-xs text-slate-400 mt-0.5">{detalhe}</div>
    </div>
  );
}

function TabelaComposicao({
  titulo,
  itens,
}: {
  titulo: string;
  itens: { label: string; valor: number; quantidade: number; percentual: number }[];
}) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="px-5 py-3.5 border-b border-slate-100">
        <h3 className="font-semibold text-slate-900 text-sm font-display">{titulo}</h3>
      </div>
      <div className="divide-y divide-slate-50">
        {itens.length === 0 ? (
          <p className="px-5 py-8 text-sm text-slate-400 text-center">Sem dados.</p>
        ) : (
          itens.map(item => (
            <div key={item.label} className="px-5 py-3">
              <div className="flex items-center justify-between gap-3 mb-1.5">
                <span className="text-xs text-slate-700 truncate">{item.label}</span>
                <span className="text-xs font-medium text-slate-800 font-mono whitespace-nowrap">
                  {moedaCompacta(item.valor)}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${Math.min(item.percentual, 100)}%`, background: BRAND }}
                  />
                </div>
                <span className="text-[10px] text-slate-400 w-10 text-right">{item.percentual}%</span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
