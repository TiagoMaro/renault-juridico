import { useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  Calendar,
  CheckCircle2,
  Clock,
  Download,
  Edit2,
  Scale,
  TrendingUp,
  XCircle,
} from 'lucide-react';

import { api } from '../api/client';
import type { Movimentacao } from '../api/types';
import { NaturezaBadge } from '../components/Badges';
import { Carregando, ErroCarregamento } from '../components/Estados';
import FormularioProcesso from '../components/FormularioProcesso';
import { useAuth } from '../context/AuthContext';
import { useRequisicao } from '../hooks/useRequisicao';
import type { NavigateFn } from '../types';
import { data as formatarData, dataHora, moeda, moedaCompacta } from '../utils/formato';

interface Props {
  processId: number | null;
  navigate: NavigateFn;
}

type Tab = 'resumo' | 'dados' | 'defesa' | 'movimentacoes' | 'historico';

const BRAND = '#0035AD';

export default function ProcessDetailPage({ processId, navigate }: Props) {
  const { podeAcessar } = useAuth();
  const [tab, setTab] = useState<Tab>('resumo');
  const [editando, setEditando] = useState(false);

  const {
    dados: processo,
    carregando,
    erro,
    recarregar,
  } = useRequisicao(
    () => (processId ? api.processos.obter(processId) : Promise.reject(new Error('Processo não informado.'))),
    [processId],
  );

  if (carregando) return <Carregando mensagem="Carregando processo..." />;

  if (erro || !processo) {
    return (
      <div className="p-6">
        <ErroCarregamento mensagem={erro ?? 'Processo não encontrado.'} aoTentarNovamente={recarregar} />
        <div className="text-center">
          <button onClick={() => navigate('processes')} className="text-sm font-medium" style={{ color: BRAND }}>
            Voltar à lista
          </button>
        </div>
      </div>
    );
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: 'resumo', label: 'Resumo' },
    { key: 'dados', label: 'Dados Processuais' },
    { key: 'defesa', label: 'Defesa' },
    { key: 'movimentacoes', label: `Movimentações (${processo.movimentacoes.length})` },
    { key: 'historico', label: `Histórico (${processo.historico.length})` },
  ];

  return (
    <div className="p-6 space-y-5 max-w-5xl">
      <button
        onClick={() => navigate('processes')}
        className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 transition-colors"
      >
        <ArrowLeft size={16} /> Voltar para Processos
      </button>

      {/* Header */}
      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2 mb-3 flex-wrap">
              <span
                className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                  processo.status === 'Ativo' ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'
                }`}
              >
                {processo.status}
              </span>
              <span
                className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                  processo.posicao_renault === 'Polo Ativo' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-600'
                }`}
              >
                {processo.posicao_renault}
              </span>
              <span
                className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                  {
                    Baixo: 'bg-green-100 text-green-700',
                    'Médio': 'bg-amber-100 text-amber-700',
                    Alto: 'bg-orange-100 text-orange-700',
                    'Crítico': 'bg-red-100 text-red-700',
                  }[processo.risco] ?? 'bg-slate-100 text-slate-600'
                }`}
              >
                Risco {processo.risco}
              </span>
            </div>
            <h1 className="text-lg font-bold text-slate-900 font-mono mb-1">Processo nº {processo.numero_autos}</h1>
            <p className="text-slate-600 text-sm">{processo.autor_reu}</p>
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <NaturezaBadge natureza={processo.natureza} />
              {processo.vara && (
                <>
                  <span className="text-slate-300">·</span>
                  <span className="text-xs text-slate-500">{processo.vara}</span>
                </>
              )}
              {processo.comarca && (
                <>
                  <span className="text-slate-300">·</span>
                  <span className="text-xs text-slate-500">{processo.comarca}</span>
                </>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={() => api.processos.exportar({ busca: processo.numero_autos })}
              className="flex items-center gap-2 px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white text-slate-600 hover:bg-slate-50 transition-colors"
            >
              <Download size={15} /> Exportar
            </button>
            {podeAcessar('Analista') && (
              <button
                onClick={() => setEditando(true)}
                className="flex items-center gap-2 px-3 py-2 text-sm rounded-lg text-white transition-colors hover:opacity-90"
                style={{ background: BRAND }}
              >
                <Edit2 size={15} /> Editar
              </button>
            )}
          </div>
        </div>

        {/* KPI mini cards */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mt-6">
          <MiniCard icon={TrendingUp} label="Valor da causa" value={moedaCompacta(processo.valor_causa)} color="#7C3AED" />
          <MiniCard icon={AlertTriangle} label="Valor em risco" value={moedaCompacta(processo.valor_risco)} color="#EA580C" />
          <MiniCard icon={Calendar} label="Data de início" value={formatarData(processo.data_inicio)} color={BRAND} />
          <MiniCard icon={Scale} label="Fase processual" value={processo.fase_processual} color="#0891B2" />
          <MiniCard
            icon={processo.defesa_realizada ? CheckCircle2 : XCircle}
            label="Defesa"
            value={processo.defesa_realizada ? 'Realizada' : 'Pendente'}
            color={processo.defesa_realizada ? '#16A34A' : '#DC2626'}
          />
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="flex border-b border-slate-100 overflow-x-auto">
          {tabs.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-5 py-3.5 text-sm font-medium whitespace-nowrap transition-colors border-b-2 -mb-px ${
                tab === t.key
                  ? 'border-[#0035AD] text-[#0035AD]'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="p-6">
          {tab === 'resumo' && (
            <div className="space-y-4">
              <h3 className="font-semibold text-slate-800 text-sm">Resumo do caso</h3>
              <p className="text-slate-600 text-sm leading-relaxed">
                {processo.resumo || 'A planilha de origem não trouxe resumo para este processo.'}
              </p>
              {processo.escritorio && (
                <div className="mt-4 pt-4 border-t border-slate-100">
                  <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">
                    Escritório responsável
                  </h4>
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-slate-100 flex items-center justify-center text-xs font-bold text-slate-600">
                      {processo.escritorio.slice(0, 2).toUpperCase()}
                    </div>
                    <span className="text-sm text-slate-800 font-medium">{processo.escritorio}</span>
                  </div>
                </div>
              )}
              <div className="pt-4 border-t border-slate-100 text-xs text-slate-400">
                Cadastrado em {dataHora(processo.criado_em)} · última atualização em {dataHora(processo.atualizado_em)}
              </div>
            </div>
          )}

          {tab === 'dados' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-5">
              {[
                { label: 'Número dos Autos', value: processo.numero_autos },
                { label: 'Autor/Réu', value: processo.autor_reu },
                { label: 'Natureza da Ação', value: processo.natureza },
                { label: 'Vara', value: processo.vara ?? 'Não informada' },
                { label: 'Comarca', value: processo.comarca ?? 'Não informada' },
                { label: 'Data de Início', value: formatarData(processo.data_inicio) },
                { label: 'Posição Renault', value: processo.posicao_renault },
                { label: 'Status', value: processo.status },
                { label: 'Fase Processual', value: processo.fase_processual },
                { label: 'Escritório', value: processo.escritorio ?? 'Não informado' },
                { label: 'Valor da Causa', value: processo.valor_causa ? moeda(processo.valor_causa) : 'Não informado' },
                { label: 'Valor em Risco', value: processo.valor_risco ? moeda(processo.valor_risco) : 'Não informado' },
                { label: 'Faixa de Risco', value: processo.risco },
                { label: 'Última Movimentação', value: formatarData(processo.ultima_movimentacao) },
              ].map(({ label, value }) => (
                <div key={label}>
                  <dt className="text-xs font-medium text-slate-500 mb-1">{label}</dt>
                  <dd className="text-sm text-slate-800">{value}</dd>
                </div>
              ))}
            </div>
          )}

          {tab === 'defesa' && (
            <div className="space-y-4">
              <div
                className={`flex items-center gap-3 p-4 rounded-xl border ${
                  processo.defesa_realizada ? 'bg-green-50 border-green-100' : 'bg-red-50 border-red-100'
                }`}
              >
                {processo.defesa_realizada ? (
                  <CheckCircle2 size={20} className="text-green-600 flex-shrink-0" />
                ) : (
                  <XCircle size={20} className="text-red-600 flex-shrink-0" />
                )}
                <div>
                  <p
                    className={`font-medium text-sm ${
                      processo.defesa_realizada ? 'text-green-800' : 'text-red-800'
                    }`}
                  >
                    {processo.defesa_realizada ? 'Defesa realizada' : 'Defesa pendente'}
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {processo.defesa_realizada
                      ? 'A planilha do escritório indica defesa apresentada.'
                      : 'Este processo ainda não possui defesa registrada. Ação necessária junto ao escritório.'}
                  </p>
                </div>
              </div>

              {!processo.defesa_realizada && processo.status === 'Ativo' && (
                <div className="flex items-start gap-2 px-4 py-3 rounded-lg border border-amber-200 bg-amber-50 text-sm text-amber-800">
                  <AlertTriangle size={16} className="flex-shrink-0 mt-0.5" />
                  <span>
                    Processos ativos sem defesa sobem automaticamente uma faixa de risco — este está classificado
                    como <strong>{processo.risco}</strong>.
                  </span>
                </div>
              )}

              {/* Movimentações relacionadas à defesa, extraídas da planilha. */}
              <div className="space-y-3">
                <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                  Movimentações relacionadas
                </h4>
                {(() => {
                  const relacionadas = processo.movimentacoes.filter(m =>
                    /defes|contesta|citaç|citac|prazo/i.test(m.descricao),
                  );
                  return relacionadas.length === 0 ? (
                    <p className="text-sm text-slate-400">
                      Nenhuma movimentação relacionada à defesa foi identificada na planilha.
                    </p>
                  ) : (
                    relacionadas.map(m => (
                      <div key={m.id} className="p-3 rounded-lg border border-slate-200">
                        <p className="text-xs text-slate-400 mb-1">{formatarData(m.data)}</p>
                        <p className="text-sm text-slate-700">{m.descricao}</p>
                      </div>
                    ))
                  );
                })()}
              </div>
            </div>
          )}

          {tab === 'movimentacoes' && (
            <div className="space-y-1">
              {processo.movimentacoes.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-8">Nenhuma movimentação registrada.</p>
              ) : (
                <div className="relative">
                  <div className="absolute left-4 top-0 bottom-0 w-px bg-slate-200" />
                  <div className="space-y-6">
                    {processo.movimentacoes.map(mov => (
                      <MovimentacaoItem key={mov.id} mov={mov} />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {tab === 'historico' && (
            <div>
              {processo.historico.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-8">
                  Nenhuma alteração registrada. O histórico é preenchido quando o processo é editado ou quando uma
                  nova importação traz valores diferentes.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-100">
                        {['Data', 'Usuário', 'Origem', 'Campo alterado', 'Valor anterior', 'Valor novo'].map(h => (
                          <th key={h} className="text-left text-xs font-medium text-slate-500 py-2 pr-4">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {processo.historico.map(h => (
                        <tr key={h.id} className="border-b border-slate-50 last:border-0">
                          <td className="py-3 pr-4 text-xs text-slate-500 whitespace-nowrap">{dataHora(h.data)}</td>
                          <td className="py-3 pr-4 text-slate-700">{h.usuario_nome ?? '—'}</td>
                          <td className="py-3 pr-4">
                            <span className="px-2 py-0.5 rounded-full text-xs bg-slate-100 text-slate-600">
                              {h.origem === 'importacao' ? 'Importação' : 'Edição'}
                            </span>
                          </td>
                          <td className="py-3 pr-4 font-medium text-slate-800">{h.campo}</td>
                          <td className="py-3 pr-4 text-slate-500 line-through">{h.valor_anterior ?? '—'}</td>
                          <td className="py-3 pr-4 text-green-700 font-medium">{h.valor_novo ?? '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {editando && (
        <FormularioProcesso
          processo={processo}
          aoFechar={() => setEditando(false)}
          aoSalvar={() => {
            setEditando(false);
            recarregar();
          }}
        />
      )}
    </div>
  );
}

function MovimentacaoItem({ mov }: { mov: Movimentacao }) {
  const typeConfig: Record<string, { label: string; color: string; bg: string }> = {
    audiencia: { label: 'Audiência', color: '#0035AD', bg: '#EEF3FF' },
    despacho: { label: 'Despacho', color: '#7C3AED', bg: '#F5F3FF' },
    recurso: { label: 'Recurso', color: '#EA580C', bg: '#FFF7ED' },
    sentenca: { label: 'Sentença', color: '#16A34A', bg: '#F0FDF4' },
    citacao: { label: 'Citação', color: '#0891B2', bg: '#ECFEFF' },
    outros: { label: 'Andamento', color: '#94A3B8', bg: '#F8FAFC' },
  };
  const cfg = typeConfig[mov.tipo] || typeConfig.outros;

  return (
    <div className="relative flex gap-4 pl-10">
      <div
        className="absolute left-0 w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
        style={{ background: cfg.bg }}
      >
        <Clock size={14} style={{ color: cfg.color }} />
      </div>
      <div className="flex-1 pb-2">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xs font-medium px-2 py-0.5 rounded-full" style={{ background: cfg.bg, color: cfg.color }}>
            {cfg.label}
          </span>
          <span className="text-xs text-slate-400">{formatarData(mov.data)}</span>
        </div>
        <p className="text-sm text-slate-700 leading-relaxed">{mov.descricao}</p>
      </div>
    </div>
  );
}

function MiniCard({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  color: string;
}) {
  return (
    <div className="p-3 rounded-xl border border-slate-100 bg-slate-50">
      <div className="flex items-center gap-2 mb-2">
        <Icon size={14} style={{ color }} />
        <span className="text-xs text-slate-500">{label}</span>
      </div>
      <p className="text-sm font-semibold text-slate-800 font-display">{value}</p>
    </div>
  );
}
