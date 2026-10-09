/**
 * Painéis do RAP — gráficos da apresentação "PAGAMENTOS_APRESENTAÇÃO_RAP":
 *  1. Honorários: budget × realizado por área
 *  2. Orçamento × realizado por grupo do RAP
 *  3. Acordos × condenações por área
 *  4. Depósito judicial × seguro garantia por área
 *  5. Honorários por ano e área (total / fixo / variável)
 *  6. Devoluções por ano
 *
 * Os painéis consomem os mesmos endpoints das telas Orçamento, Análise e
 * Devoluções, então não exigem mudança no backend.
 */

import { useState } from 'react';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

import { api } from '../../api/client';
import type { FiltrosFinanceiro, RapResponse } from '../../api/types';
import { useRequisicao } from '../../hooks/useRequisicao';
import { moeda, moedaCompacta } from '../../utils/formato';
import { Carregando, ErroCarregamento } from '../Estados';
import { useAnoFinanceiro } from './comum';

const BRAND = '#0035AD';
const CORES = ['#0035AD', '#7C3AED', '#0891B2', '#059669', '#EA580C', '#DC2626', '#F59E0B', '#94A3B8'];
const EIXO = { fontSize: 11, fill: '#94A3B8' };
const ESTILO_TOOLTIP = { background: '#fff', border: '1px solid #E2E8F0', borderRadius: '8px', fontSize: 12 };
const RAIO_VERTICAL: [number, number, number, number] = [4, 4, 0, 0];
const RAIO_HORIZONTAL: [number, number, number, number] = [0, 4, 4, 0];

interface Requisicao<T> {
  dados?: T | null;
  carregando: boolean;
  erro?: string | null;
  recarregar: () => void;
}

const rotuloPeriodo = (ano: number, mes?: number) => (mes ? `${String(mes).padStart(2, '0')}/${ano}` : `ano ${ano}`);

// --------------------------------------------------------------------------
// Peças comuns
// --------------------------------------------------------------------------

function Secao({
  titulo,
  subtitulo,
  carregando,
  erro,
  aoTentarNovamente,
  vazio,
  textoVazio,
  acao,
  className = '',
  children,
}: {
  titulo: string;
  subtitulo: string;
  carregando?: boolean;
  erro?: string | null;
  aoTentarNovamente?: () => void;
  vazio?: boolean;
  textoVazio?: string;
  acao?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`bg-white rounded-xl border border-slate-200 p-5 ${className}`}>
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <h3 className="font-semibold text-slate-900 text-sm font-display">{titulo}</h3>
          <p className="text-xs text-slate-400 mt-0.5">{subtitulo}</p>
        </div>
        {acao}
      </div>
      {erro ? (
        <ErroCarregamento mensagem={erro} aoTentarNovamente={aoTentarNovamente ?? (() => undefined)} />
      ) : carregando ? (
        <Carregando />
      ) : vazio ? (
        <p className="text-sm text-slate-400 text-center py-10">{textoVazio ?? 'Sem dados.'}</p>
      ) : (
        children
      )}
    </div>
  );
}

function GraficoBarras({
  dados,
  chaveX,
  series,
  empilhado = false,
  horizontal = false,
  altura = 260,
}: {
  dados: Record<string, string | number>[];
  chaveX: string;
  series: { chave: string; nome: string; cor: string }[];
  empilhado?: boolean;
  /** true = barras deitadas (bom para rótulos longos). */
  horizontal?: boolean;
  altura?: number;
}) {
  return (
    <ResponsiveContainer width="100%" height={altura}>
      <BarChart data={dados} layout={horizontal ? 'vertical' : 'horizontal'}>
        <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={horizontal} horizontal={!horizontal} />
        {horizontal ? (
          <XAxis
            type="number"
            tick={EIXO}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v: number) => moedaCompacta(v)}
          />
        ) : (
          <XAxis dataKey={chaveX} tick={EIXO} axisLine={false} tickLine={false} />
        )}
        {horizontal ? (
          <YAxis type="category" dataKey={chaveX} tick={EIXO} axisLine={false} tickLine={false} width={120} />
        ) : (
          <YAxis
            tick={EIXO}
            axisLine={false}
            tickLine={false}
            width={70}
            tickFormatter={(v: number) => moedaCompacta(v)}
          />
        )}
        <Tooltip contentStyle={ESTILO_TOOLTIP} formatter={(v: number, nome: string) => [moeda(v), nome]} />
        {series.length > 1 && <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />}
        {series.map(s => (
          <Bar
            key={s.chave}
            dataKey={s.chave}
            name={s.nome}
            fill={s.cor}
            stackId={empilhado ? 'a' : undefined}
            radius={empilhado ? 0 : horizontal ? RAIO_HORIZONTAL : RAIO_VERTICAL}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

// --------------------------------------------------------------------------
// 1. Honorários: budget × realizado por área  (slide "Pagamentos G&A – Honorários")
// --------------------------------------------------------------------------

function HonorariosBudgetReal({ rap }: { rap: Requisicao<RapResponse> }) {
  const dados = rap.dados;
  const linhas = (dados?.bloco2 ?? [])
    .map(l => ({ nome: l.area, budget: l.total.budget, realizado: l.total.realizado }))
    .filter(l => l.budget || l.realizado);
  const budget = linhas.reduce((s, l) => s + l.budget, 0);
  const realizado = linhas.reduce((s, l) => s + l.realizado, 0);

  return (
    <Secao
      titulo="Honorários: budget × realizado"
      subtitulo={
        dados
          ? `Por área · budget anual vs. realizado até ${dados.mes_fechamento_nome} de ${dados.ano}`
          : 'Por área · budget anual vs. realizado'
      }
      carregando={rap.carregando && !dados}
      erro={rap.erro}
      aoTentarNovamente={rap.recarregar}
      vazio={linhas.length === 0}
      textoVazio="Sem orçamento de honorários para o período."
    >
      <p className="text-xs text-slate-500 mb-3">
        Total: budget {moedaCompacta(budget)} · realizado {moedaCompacta(realizado)}
        {budget > 0 && ` (${Math.round((realizado / budget) * 100)}%)`}
      </p>
      <GraficoBarras
        dados={linhas}
        chaveX="nome"
        horizontal
        altura={Math.max(220, linhas.length * 52)}
        series={[
          { chave: 'budget', nome: 'Budget', cor: '#CBD5E1' },
          { chave: 'realizado', nome: 'Realizado', cor: BRAND },
        ]}
      />
    </Secao>
  );
}

// --------------------------------------------------------------------------
// 2. Orçamento × realizado por grupo do RAP  (slide "Acordos e Condenações — budget × real")
// --------------------------------------------------------------------------

function GruposRap({ rap }: { rap: Requisicao<RapResponse> }) {
  const dados = rap.dados;
  const linhas = (dados?.bloco1 ?? [])
    .map(g => ({ nome: g.grupo, budget: g.total.budget, realizado: g.total.realizado }))
    .filter(l => l.budget || l.realizado);

  return (
    <Secao
      titulo="Orçamento × realizado por grupo"
      subtitulo={
        dados
          ? `Grupos do RAP · budget anual vs. realizado até ${dados.mes_fechamento_nome} de ${dados.ano}`
          : 'Grupos do RAP · budget anual vs. realizado'
      }
      carregando={rap.carregando && !dados}
      erro={rap.erro}
      aoTentarNovamente={rap.recarregar}
      vazio={linhas.length === 0}
      textoVazio="Sem orçamento importado para o período."
    >
      <GraficoBarras
        dados={linhas}
        chaveX="nome"
        horizontal
        altura={Math.max(220, linhas.length * 52)}
        series={[
          { chave: 'budget', nome: 'Budget', cor: '#CBD5E1' },
          { chave: 'realizado', nome: 'Realizado', cor: '#7C3AED' },
        ]}
      />
    </Secao>
  );
}

// --------------------------------------------------------------------------
// 3 e 4. Comparativos por área a partir da análise (acordo × condenação, seguro × depósito)
// --------------------------------------------------------------------------

function ComparativoAnalise({
  ano,
  mes,
  coluna,
  titulo,
  subtitulo,
  grupos,
  empilhado,
  textoVazio,
}: {
  ano: number;
  mes?: number;
  /** Dimensão da análise cujos valores formam as séries (ex.: 'motivo', 'tipo_pagamento'). */
  coluna: string;
  titulo: string;
  subtitulo: string;
  grupos: { nome: string; cor: string; padrao: RegExp }[];
  empilhado?: boolean;
  textoVazio: string;
}) {
  const { dados, carregando, erro, recarregar } = useRequisicao(
    () =>
      api.financeiro.analise({
        ano,
        edoa: '',
        linha1: 'area',
        linha2: '',
        coluna,
        mes_de: mes,
        mes_ate: mes,
      }),
    [ano, mes, coluna],
  );

  // Cada série soma as colunas da análise cujo nome casa com o padrão (ex.: /acordo/i).
  const colunasPorGrupo = grupos.map(g => (dados?.colunas ?? []).filter(c => g.padrao.test(c)));
  const somar = (valores: Record<string, number>, colunas: string[]) =>
    colunas.reduce((soma, c) => soma + (valores[c] ?? 0), 0);

  const linhas = (dados?.linhas ?? [])
    .map(l => {
      const linha: Record<string, string | number> = { nome: l.rotulo };
      grupos.forEach((_, i) => {
        linha[`g${i}`] = somar(l.valores, colunasPorGrupo[i]);
      });
      return linha;
    })
    .filter(l => grupos.some((_, i) => Number(l[`g${i}`]) !== 0));

  const totais = grupos.map((_, i) => linhas.reduce((soma, l) => soma + Number(l[`g${i}`]), 0));

  return (
    <Secao
      titulo={titulo}
      subtitulo={`${subtitulo} · ${rotuloPeriodo(ano, mes)}`}
      carregando={carregando && !dados}
      erro={erro}
      aoTentarNovamente={recarregar}
      vazio={linhas.length === 0}
      textoVazio={textoVazio}
    >
      <p className="text-xs text-slate-500 mb-3">
        {grupos.map((g, i) => `${g.nome}: ${moedaCompacta(totais[i])}`).join(' · ')}
      </p>
      <GraficoBarras
        dados={linhas}
        chaveX="nome"
        empilhado={empilhado}
        series={grupos.map((g, i) => ({ chave: `g${i}`, nome: g.nome, cor: g.cor }))}
      />
    </Secao>
  );
}

// --------------------------------------------------------------------------
// 5. Honorários por ano e área  (slides "Honorários variáveis anual" e "Histórico honorários anual")
// --------------------------------------------------------------------------

type VisaoHonorarios = 'total' | 'fixo' | 'variavel';

function HonorariosPorAno({ anos }: { anos: number[] }) {
  const [visao, setVisao] = useState<VisaoHonorarios>('total');
  const { dados, carregando, erro, recarregar } = useRequisicao(
    () => Promise.all(anos.map(a => api.financeiro.rap(a, 12))),
    [anos.join(',')],
  );

  const respostas = dados ?? [];
  const areas = Array.from(new Set(respostas.flatMap(r => r.bloco2.map(l => l.area))));
  const linhas = respostas.map(r => {
    const linha: Record<string, string | number> = { nome: String(r.ano) };
    areas.forEach((area, i) => {
      const item = r.bloco2.find(l => l.area === area);
      linha[`a${i}`] = item ? item[visao].realizado_ano : 0;
    });
    return linha;
  });
  const temValor = linhas.some(l => areas.some((_, i) => Number(l[`a${i}`]) > 0));

  return (
    <Secao
      titulo="Honorários por ano e área"
      subtitulo="Realizado no ano, comparando os últimos exercícios"
      className="lg:col-span-2"
      carregando={carregando && !dados}
      erro={erro}
      aoTentarNovamente={recarregar}
      vazio={!temValor}
      textoVazio="Sem honorários realizados nos exercícios importados."
      acao={
        <div className="flex rounded-lg overflow-hidden border border-slate-200">
          {(
            [
              ['total', 'Total'],
              ['fixo', 'Fixo'],
              ['variavel', 'Variável'],
            ] as const
          ).map(([opcao, rotulo]) => (
            <button
              key={opcao}
              onClick={() => setVisao(opcao)}
              className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                visao === opcao ? 'text-white' : 'text-slate-500 hover:bg-slate-50'
              }`}
              style={visao === opcao ? { background: BRAND } : {}}
            >
              {rotulo}
            </button>
          ))}
        </div>
      }
    >
      <GraficoBarras
        dados={linhas}
        chaveX="nome"
        series={areas.map((area, i) => ({ chave: `a${i}`, nome: area, cor: CORES[i % CORES.length] }))}
      />
    </Secao>
  );
}

// --------------------------------------------------------------------------
// 6. Devoluções por ano  (slide "Devoluções anuais")
// --------------------------------------------------------------------------

function DevolucoesPorAno({ area }: { area?: string }) {
  const { dados, carregando, erro, recarregar } = useRequisicao(
    () => api.financeiro.devolucoes({ area: area || undefined }),
    [area],
  );

  const porAno = new Map<number, number>();
  (dados ?? []).forEach(d => {
    const ano = d.ano_referencia ?? (d.data_transferencia ? Number(d.data_transferencia.slice(0, 4)) : NaN);
    if (!Number.isFinite(ano)) return;
    porAno.set(ano, (porAno.get(ano) ?? 0) + d.valor_devolvido);
  });
  const linhas = Array.from(porAno.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([ano, valor]) => ({ nome: String(ano), valor }));

  return (
    <Secao
      titulo="Devoluções por ano"
      subtitulo="Valores estornados · todos os exercícios"
      carregando={carregando && !dados}
      erro={erro}
      aoTentarNovamente={recarregar}
      vazio={linhas.length === 0}
      textoVazio="Nenhuma devolução registrada."
    >
      <GraficoBarras
        dados={linhas}
        chaveX="nome"
        series={[{ chave: 'valor', nome: 'Devolvido', cor: '#0891B2' }]}
      />
    </Secao>
  );
}

// --------------------------------------------------------------------------
// Conjunto
// --------------------------------------------------------------------------

export default function PainelRap({ filtros }: { filtros: FiltrosFinanceiro }) {
  const { ano: anoPadrao, info } = useAnoFinanceiro();
  const { dados: opcoes } = useRequisicao(() => api.financeiro.opcoesFiltro(), []);

  // Sem filtro de ano, usa o exercício padrão; sem filtro de mês, o mês de fechamento salvo (ou dezembro).
  const ano = filtros.ano ?? anoPadrao;
  const mesFechamento = filtros.mes ?? (info && info.ano === ano ? info.mes_fechamento : undefined) ?? 12;

  const rap = useRequisicao(
    () => (ano === null ? Promise.resolve(null) : api.financeiro.rap(ano, mesFechamento)),
    [ano, mesFechamento],
  );

  if (ano === null) return <Carregando mensagem="Carregando exercícios..." />;

  const anos = [...(opcoes?.anos ?? [])].sort((a, b) => a - b).slice(-4);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold text-slate-900 font-display">Painéis do RAP</h2>
        <p className="text-xs text-slate-400 mt-0.5">
          Estes painéis seguem os filtros de ano e mês (e área, nas devoluções); os demais filtros não se aplicam a eles.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <HonorariosBudgetReal rap={rap} />
        <GruposRap rap={rap} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ComparativoAnalise
          ano={ano}
          mes={filtros.mes}
          coluna="motivo"
          titulo="Acordos × condenações"
          subtitulo="Valor pago por área"
          empilhado
          grupos={[
            { nome: 'Acordo', cor: '#7C3AED', padrao: /acordo/i },
            { nome: 'Condenação', cor: '#0891B2', padrao: /condena/i },
          ]}
          textoVazio="Nenhum lançamento com motivo de acordo ou condenação no período."
        />
        <ComparativoAnalise
          ano={ano}
          mes={filtros.mes}
          coluna="tipo_pagamento"
          titulo="Depósito judicial × seguro garantia"
          subtitulo="Valor pago por área"
          grupos={[
            { nome: 'Seguro garantia', cor: '#0891B2', padrao: /seguro/i },
            { nome: 'Depósito judicial', cor: '#0035AD', padrao: /dep[oó]sito/i },
          ]}
          textoVazio="Nenhum lançamento de depósito judicial ou seguro garantia no período."
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {anos.length > 0 && <HonorariosPorAno anos={anos} />}
        <DevolucoesPorAno area={filtros.area} />
      </div>
    </div>
  );
}
