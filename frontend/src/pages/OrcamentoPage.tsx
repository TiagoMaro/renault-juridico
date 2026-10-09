/**
 * Orçamento × Realizado — equivale às abas RAP PAGAMENTOS, Honorarios Variaveis e Mensais.
 *
 * O budget vem da planilha; o realizado é sempre recalculado a partir dos
 * lançamentos, com o critério lido da fórmula de cada linha.
 */

import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, Loader2, Pencil, Save } from 'lucide-react';

import { api } from '../api/client';
import type { GrupoRap, LinhaRap, LinhaRapBloco2, ValoresRap } from '../api/types';
import { Carregando, ErroCarregamento, EstadoVazio } from '../components/Estados';
import ModalFormulario from '../components/financeiro/ModalFormulario';
import {
  BarraConsumo,
  BRAND,
  CaixaInfo,
  Cartao,
  MESES_CURTOS,
  SeletorAno,
  SeletorMes,
  corConsumo,
  useAnoFinanceiro,
} from '../components/financeiro/comum';
import { useAuth } from '../context/AuthContext';
import SeloPeriodo from '../components/SeloPeriodo';
import { useRequisicao } from '../hooks/useRequisicao';
import { moeda, moedaCompacta } from '../utils/formato';
import { periodoDoIntervalo } from '../utils/periodo';

type Aba = 'rap' | 'fixo-variavel' | 'plano' | 'contratos';

const ABAS: { chave: Aba; rotulo: string; origem: string }[] = [
  { chave: 'rap', rotulo: 'RAP — EDOA × Área', origem: 'RAP PAGAMENTOS (bloco 1)' },
  { chave: 'fixo-variavel', rotulo: 'Honorários fixo × variável', origem: 'RAP PAGAMENTOS (bloco 2)' },
  { chave: 'plano', rotulo: 'Plano de honorários', origem: 'Honorarios Variaveis' },
  { chave: 'contratos', rotulo: 'Contratos mensais', origem: 'Mensais' },
];

export default function OrcamentoPage() {
  const { ano, setAno, anos, info, recarregarAnos } = useAnoFinanceiro();
  const [aba, setAba] = useState<Aba>('rap');
  const [mes, setMes] = useState<number | null>(null);

  // O mês de fechamento começa no que está salvo para o exercício (célula C2 da aba RAP).
  useEffect(() => {
    if (info) setMes(info.mes_fechamento);
  }, [info?.ano, info?.mes_fechamento]); // eslint-disable-line react-hooks/exhaustive-deps

  if (ano === null) return <Carregando mensagem="Carregando exercícios..." />;

  // RAP e honorários fixo × variável vão até o mês de fechamento; plano e contratos cobrem o ano todo.
  const usaFechamento = aba === 'rap' || aba === 'fixo-variavel';
  const periodo = periodoDoIntervalo(ano, 1, usaFechamento ? (mes ?? 12) : 12);

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-slate-900 font-display">Orçamento × Realizado</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Budget da planilha contra os lançamentos — realizado recalculado com o critério de cada linha
          </p>
          <SeloPeriodo periodo={periodo} />
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <SeletorAno ano={ano} anos={anos} aoAlterar={setAno} />
          {(aba === 'rap' || aba === 'fixo-variavel') && (
            <SeletorMesFechamento
              ano={ano}
              mes={mes}
              salvo={info?.mes_fechamento ?? 12}
              aoAlterar={setMes}
              aoSalvar={recarregarAnos}
            />
          )}
        </div>
      </div>

      <div className="flex gap-1 border-b border-slate-200 overflow-x-auto">
        {ABAS.map(item => (
          <button
            key={item.chave}
            onClick={() => setAba(item.chave)}
            className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 -mb-px transition-colors ${
              aba === item.chave ? 'text-slate-900' : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
            style={aba === item.chave ? { borderColor: BRAND } : {}}
            title={`Aba de origem: ${item.origem}`}
          >
            {item.rotulo}
          </button>
        ))}
      </div>

      {(aba === 'rap' || aba === 'fixo-variavel') && mes !== null && <Rap ano={ano} mes={mes} aba={aba} />}
      {aba === 'plano' && <PlanoHonorarios ano={ano} />}
      {aba === 'contratos' && <Contratos ano={ano} />}
    </div>
  );
}

function SeletorMesFechamento({
  ano,
  mes,
  salvo,
  aoAlterar,
  aoSalvar,
}: {
  ano: number;
  mes: number | null;
  salvo: number;
  aoAlterar: (mes: number | null) => void;
  aoSalvar: () => void;
}) {
  const { podeAcessar } = useAuth();
  const [salvando, setSalvando] = useState(false);
  const alterado = mes !== null && mes !== salvo;

  const salvar = async () => {
    if (mes === null) return;
    setSalvando(true);
    try {
      await api.financeiro.definirMesFechamento(ano, mes);
      aoSalvar();
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <SeletorMes rotulo="Mês de fechamento" valor={mes} aoAlterar={aoAlterar} />
      {alterado && podeAcessar('Gestor') && (
        <button
          onClick={salvar}
          disabled={salvando}
          className="flex items-center gap-1.5 px-3 py-2 text-xs rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
          title="Grava este mês como o fechamento do exercício (vale para todos os usuários)"
        >
          {salvando ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
          Salvar fechamento
        </button>
      )}
    </div>
  );
}

// --------------------------------------------------------------------------
// RAP
// --------------------------------------------------------------------------

function Rap({ ano, mes, aba }: { ano: number; mes: number; aba: Aba }) {
  const { podeAcessar } = useAuth();
  const podeEditar = podeAcessar('Gestor');
  const { dados, carregando, erro, recarregar } = useRequisicao(() => api.financeiro.rap(ano, mes), [ano, mes]);
  const [editando, setEditando] = useState<LinhaRap | null>(null);
  const [recolhidos, setRecolhidos] = useState<Set<string>>(new Set());

  if (carregando && !dados) return <Carregando mensagem="Calculando budget × realizado..." />;
  if (erro) return <ErroCarregamento mensagem={erro} aoTentarNovamente={recarregar} />;
  if (!dados) return null;

  if (dados.bloco1.length === 0 && dados.bloco2.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-slate-200">
        <EstadoVazio
          titulo={`Nenhum orçamento para ${ano}`}
          descricao="Importe a planilha de pagamentos: a aba RAP PAGAMENTOS traz o budget e o critério de cada linha."
        />
      </div>
    );
  }

  const { totais } = dados;
  const alertas = dados.bloco1.flatMap(g => g.linhas).filter(l => l.alertas.length > 0);
  const alternar = (grupo: string) =>
    setRecolhidos(atual => {
      const novo = new Set(atual);
      if (novo.has(grupo)) novo.delete(grupo);
      else novo.add(grupo);
      return novo;
    });

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <Cartao titulo="Budget anual" valor={moedaCompacta(totais.budget)} />
        <Cartao
          titulo={`Previsto até ${dados.mes_fechamento_nome}`}
          valor={moedaCompacta(totais.previsto)}
          cor="#0891B2"
          detalhe={`budget ÷ 12 × ${dados.mes_fechamento}`}
        />
        <Cartao
          titulo={`Realizado até ${dados.mes_fechamento_nome}`}
          valor={moedaCompacta(totais.realizado)}
          cor="#16A34A"
          detalhe={`GAP ${moedaCompacta(totais.gap)}`}
        />
        <Cartao titulo="Realizado no ano" valor={moedaCompacta(totais.realizado_ano)} cor="#7C3AED" />
        <Cartao
          titulo="Budget restante"
          valor={moedaCompacta(totais.restante)}
          cor={corConsumo(totais.consumido_percentual)}
          detalhe={`${totais.consumido_percentual.toFixed(1).replace('.', ',')}% consumido`}
        />
      </div>

      {aba === 'rap' && (
        <>
          {alertas.length > 0 && (
            <CaixaInfo
              tom="alerta"
              itens={[
                `${alertas.length} linha(s) do RAP com critério suspeito na planilha — veja o ícone ⚠ na tabela. ` +
                  (podeEditar ? 'Clique na linha para corrigir o critério.' : 'Um gestor pode corrigir o critério.'),
              ]}
            />
          )}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/60 text-xs text-slate-500">
                    <th className="text-left font-medium px-4 py-3">EDOA / Área</th>
                    <th className="text-right font-medium px-3 py-3">Budget anual</th>
                    <th className="text-right font-medium px-3 py-3">Previsto</th>
                    <th className="text-right font-medium px-3 py-3">Realizado</th>
                    <th className="text-right font-medium px-3 py-3">GAP</th>
                    <th className="text-right font-medium px-3 py-3">Realizado no ano</th>
                    <th className="text-right font-medium px-3 py-3">Restante</th>
                    <th className="text-left font-medium px-3 py-3">Consumo</th>
                    <th className="text-left font-medium px-3 py-3">Critério</th>
                  </tr>
                </thead>
                <tbody>
                  {dados.bloco1.map(grupo => (
                    <GrupoLinhas
                      key={grupo.grupo}
                      grupo={grupo}
                      recolhido={recolhidos.has(grupo.grupo)}
                      aoAlternar={() => alternar(grupo.grupo)}
                      aoEditar={podeEditar ? setEditando : undefined}
                    />
                  ))}
                  <tr className="bg-slate-50 font-semibold text-slate-900 border-t border-slate-200">
                    <td className="px-4 py-3">Total geral</td>
                    <Valores valores={totais} />
                    <td colSpan={2} />
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {dados.sem_orcamento.length > 0 && (
            <div className="bg-white rounded-xl border border-amber-200 overflow-hidden">
              <div className="px-5 py-3.5 border-b border-slate-100 flex items-center gap-2">
                <AlertTriangle size={15} className="text-amber-600" />
                <h3 className="font-semibold text-slate-900 text-sm font-display">
                  Gasto em EDOA sem linha no RAP ({dados.sem_orcamento.length})
                </h3>
              </div>
              <div className="divide-y divide-slate-50">
                {dados.sem_orcamento.map(item => (
                  <div key={item.edoa} className="px-5 py-2.5 flex items-center justify-between text-sm">
                    <span className="text-slate-700">{item.edoa}</span>
                    <span className="tabular-nums font-medium text-slate-900">{moeda(item.realizado_ano)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {aba === 'fixo-variavel' && <Bloco2 linhas={dados.bloco2} />}

      <CaixaInfo itens={dados.observacoes} />

      {editando && (
        <ModalFormulario
          titulo="Ajustar linha do orçamento"
          subtitulo={`${editando.rotulo ?? 'Total do EDOA'} · linha ${editando.linha_planilha ?? '—'} da aba RAP`}
          campos={[
            { nome: 'budget_anual', rotulo: 'Budget anual (R$)', tipo: 'numero', grupo: 'Budget' },
            {
              nome: 'filtro_edoa',
              rotulo: 'Somar lançamentos do EDOA',
              dica: 'Vários separados por | — ex.: ACORDOS CONSUMIDOR|ACORDOS SAC',
              grupo: 'Critério do realizado',
            },
            { nome: 'filtro_area', rotulo: 'e da área', dica: 'Vazio = todas as áreas', grupo: 'Critério do realizado' },
            {
              nome: 'filtro_recorrencia',
              rotulo: 'e da recorrência',
              tipo: 'select',
              opcoes: ['Fixo', 'Variável pontual', 'Fixo valor variável'],
              grupo: 'Critério do realizado',
            },
            {
              nome: 'realizado_manual',
              rotulo: 'Realizado fixo (R$)',
              tipo: 'numero',
              dica: 'Preencha só quando o valor não vem dos lançamentos. Vazio = calcular.',
              grupo: 'Critério do realizado',
            },
          ]}
          inicial={{
            budget_anual: editando.budget,
            filtro_edoa: editando.regra.edoa,
            filtro_area: editando.regra.area,
            filtro_recorrencia: editando.regra.recorrencia,
            realizado_manual: editando.regra.realizado_manual,
          }}
          rodape={
            editando.alertas.length > 0 ? <CaixaInfo tom="alerta" itens={editando.alertas} /> : undefined
          }
          aoFechar={() => setEditando(null)}
          aoSalvar={async valores => {
            await api.financeiro.atualizarItemOrcamento(editando.id, {
              budget_anual: valores.budget_anual ?? 0,
              filtro_edoa: valores.filtro_edoa ?? '',
              filtro_area: valores.filtro_area ?? '',
              filtro_recorrencia: valores.filtro_recorrencia ?? '',
              realizado_manual: valores.realizado_manual,
              limpar_realizado_manual: valores.realizado_manual === null,
            });
            setEditando(null);
            recarregar();
          }}
        />
      )}
    </div>
  );
}

function Valores({ valores }: { valores: ValoresRap }) {
  return (
    <>
      <td className="px-3 py-2.5 text-right tabular-nums">{moeda(valores.budget)}</td>
      <td className="px-3 py-2.5 text-right tabular-nums text-slate-500">{moeda(valores.previsto)}</td>
      <td className="px-3 py-2.5 text-right tabular-nums">{moeda(valores.realizado)}</td>
      <td className={`px-3 py-2.5 text-right tabular-nums ${valores.gap < 0 ? 'text-red-600' : 'text-slate-500'}`}>
        {moeda(valores.gap)}
      </td>
      <td className="px-3 py-2.5 text-right tabular-nums">{moeda(valores.realizado_ano)}</td>
      <td className={`px-3 py-2.5 text-right tabular-nums ${valores.restante < 0 ? 'text-red-600' : ''}`}>
        {moeda(valores.restante)}
      </td>
      <td className="px-3 py-2.5">{valores.budget ? <BarraConsumo percentual={valores.consumido_percentual} /> : null}</td>
    </>
  );
}

const ROTULO_REGRA: Record<string, { texto: string; classe: string; dica: string }> = {
  formula: { texto: 'Fórmula', classe: 'bg-green-50 text-green-700', dica: 'Critério lido da fórmula SUMIF/SUMIFS da planilha' },
  inferida: { texto: 'Inferido', classe: 'bg-amber-50 text-amber-700', dica: 'A planilha não tem fórmula válida — critério deduzido do rótulo' },
  manual: { texto: 'Ajustado', classe: 'bg-blue-50 text-blue-700', dica: 'Critério ou valor ajustado no sistema' },
  sem_regra: { texto: 'Sem regra', classe: 'bg-slate-100 text-slate-500', dica: 'Sem critério de soma' },
};

function GrupoLinhas({
  grupo,
  recolhido,
  aoAlternar,
  aoEditar,
}: {
  grupo: GrupoRap;
  recolhido: boolean;
  aoAlternar: () => void;
  aoEditar?: (linha: LinhaRap) => void;
}) {
  const linhaEdoa = grupo.linhas.find(l => l.nivel === 'edoa');
  const filhos = grupo.linhas.filter(l => l !== linhaEdoa);
  const temAlerta = grupo.linhas.some(l => l.alertas.length > 0);

  return (
    <>
      <tr
        className="border-t border-slate-100 bg-slate-50/40 font-medium text-slate-900 hover:bg-slate-50 cursor-pointer"
        onClick={filhos.length ? aoAlternar : linhaEdoa && aoEditar ? () => aoEditar(linhaEdoa) : undefined}
      >
        <td className="px-4 py-2.5">
          <span className="flex items-center gap-1.5">
            {filhos.length > 0 ? (
              recolhido ? <ChevronRight size={14} className="text-slate-400" /> : <ChevronDown size={14} className="text-slate-400" />
            ) : (
              <span className="w-3.5" />
            )}
            {grupo.grupo}
            {temAlerta && <AlertTriangle size={13} className="text-amber-500" />}
            {grupo.total.origem === 'soma das áreas' && (
              <span className="text-[10px] font-normal text-slate-400">(soma das áreas)</span>
            )}
          </span>
        </td>
        <Valores valores={grupo.total} />
        <td className="px-3 py-2.5">{linhaEdoa && <SeloRegra linha={linhaEdoa} aoEditar={aoEditar} />}</td>
      </tr>
      {!recolhido &&
        filhos.map(linha => (
          <tr
            key={linha.id}
            className={`border-t border-slate-50 text-slate-700 ${aoEditar ? 'hover:bg-blue-50/40 cursor-pointer' : ''}`}
            onClick={aoEditar ? () => aoEditar(linha) : undefined}
          >
            <td className="px-4 py-2 pl-10">
              <span className="flex items-center gap-1.5">
                {linha.rotulo ?? '(sem área)'}
                {linha.alertas.length > 0 && (
                  <span title={linha.alertas.join('\n')}>
                    <AlertTriangle size={13} className="text-amber-500" />
                  </span>
                )}
              </span>
            </td>
            <Valores valores={linha} />
            <td className="px-3 py-2">
              <SeloRegra linha={linha} aoEditar={aoEditar} />
            </td>
          </tr>
        ))}
    </>
  );
}

function SeloRegra({ linha, aoEditar }: { linha: LinhaRap; aoEditar?: (linha: LinhaRap) => void }) {
  const regra = ROTULO_REGRA[linha.regra.origem] ?? ROTULO_REGRA.sem_regra;
  const criterio = [
    linha.regra.realizado_manual !== null ? `valor fixo ${moeda(linha.regra.realizado_manual)}` : null,
    linha.regra.edoa && `EDOA = ${linha.regra.edoa}`,
    linha.regra.area && `Área = ${linha.regra.area}`,
    linha.regra.recorrencia && `Recorrência = ${linha.regra.recorrencia}`,
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <span className="flex items-center gap-1.5 whitespace-nowrap">
      <span
        className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${regra.classe}`}
        title={`${regra.dica}${criterio ? `\n${criterio}` : ''}${linha.alertas.length ? `\n\n${linha.alertas.join('\n')}` : ''}`}
      >
        {regra.texto}
      </span>
      {aoEditar && (
        <button
          onClick={e => {
            e.stopPropagation();
            aoEditar(linha);
          }}
          className="text-slate-300 hover:text-slate-600"
          aria-label="Ajustar linha"
        >
          <Pencil size={12} />
        </button>
      )}
    </span>
  );
}

function Bloco2({ linhas }: { linhas: LinhaRapBloco2[] }) {
  if (!linhas.length) {
    return (
      <div className="bg-white rounded-xl border border-slate-200">
        <EstadoVazio titulo="Sem o detalhamento de honorários" descricao="A aba RAP deste exercício não tem o bloco por área." />
      </div>
    );
  }
  const soma = (campo: 'total' | 'fixo' | 'variavel', chave: keyof ValoresRap) =>
    linhas.reduce((acc, l) => acc + l[campo][chave], 0);

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-slate-500 bg-slate-50/60">
              <th rowSpan={2} className="text-left font-medium px-4 py-2 border-b border-slate-100">Área</th>
              <th colSpan={3} className="font-medium px-3 py-2 text-center border-l border-slate-100">Total</th>
              <th colSpan={3} className="font-medium px-3 py-2 text-center border-l border-slate-100">Fixo</th>
              <th colSpan={3} className="font-medium px-3 py-2 text-center border-l border-slate-100">Variável</th>
              <th rowSpan={2} className="font-medium px-3 py-2 text-right border-l border-b border-slate-100">Outros*</th>
            </tr>
            <tr className="text-[11px] text-slate-400 border-b border-slate-100 bg-slate-50/60">
              {['total', 'fixo', 'variavel'].flatMap(g => [
                <th key={`${g}b`} className="font-medium px-3 py-1.5 text-right border-l border-slate-100">Budget</th>,
                <th key={`${g}r`} className="font-medium px-3 py-1.5 text-right">Realizado ano</th>,
                <th key={`${g}s`} className="font-medium px-3 py-1.5 text-right">Restante</th>,
              ])}
            </tr>
          </thead>
          <tbody>
            {linhas.map(linha => (
              <tr key={linha.id} className="border-b border-slate-50">
                <td className="px-4 py-2.5 font-medium text-slate-800">{linha.area}</td>
                {(['total', 'fixo', 'variavel'] as const).map(g => (
                  <CelulasBloco2 key={g} valores={linha[g]} />
                ))}
                <td className="px-3 py-2.5 text-right tabular-nums text-slate-500 border-l border-slate-50">
                  {moeda(linha.sem_classificacao_ano)}
                </td>
              </tr>
            ))}
            <tr className="bg-slate-50 font-semibold">
              <td className="px-4 py-2.5">Total</td>
              {(['total', 'fixo', 'variavel'] as const).map(g => (
                <CelulasBloco2
                  key={g}
                  valores={{
                    budget: soma(g, 'budget'),
                    realizado_ano: soma(g, 'realizado_ano'),
                    restante: soma(g, 'restante'),
                  } as ValoresRap}
                />
              ))}
              <td className="px-3 py-2.5 text-right tabular-nums border-l border-slate-100">
                {moeda(linhas.reduce((a, l) => a + l.sem_classificacao_ano, 0))}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="px-4 py-3 text-[11px] text-slate-400 border-t border-slate-100 flex items-center gap-1.5">
        <CheckCircle2 size={12} className="text-green-600" />
        Na planilha, REAL VARIÁVEL sai sempre zero (a fórmula procura "Variável", os lançamentos dizem "Variável pontual").
        Aqui ele é calculado. *Outros = "Fixo valor variável" ou sem recorrência.
      </p>
    </div>
  );
}

function CelulasBloco2({ valores }: { valores: ValoresRap }) {
  return (
    <>
      <td className="px-3 py-2.5 text-right tabular-nums border-l border-slate-50">{moeda(valores.budget)}</td>
      <td className="px-3 py-2.5 text-right tabular-nums">{moeda(valores.realizado_ano)}</td>
      <td className={`px-3 py-2.5 text-right tabular-nums ${valores.restante < 0 ? 'text-red-600' : 'text-slate-500'}`}>
        {moeda(valores.restante)}
      </td>
    </>
  );
}

// --------------------------------------------------------------------------
// Plano de honorários e contratos
// --------------------------------------------------------------------------

function PlanoHonorarios({ ano }: { ano: number }) {
  const { dados, carregando, erro, recarregar } = useRequisicao(() => api.financeiro.planoHonorarios(ano), [ano]);
  const [visao, setVisao] = useState<'grupos' | 'itens'>('grupos');

  if (carregando && !dados) return <Carregando />;
  if (erro) return <ErroCarregamento mensagem={erro} aoTentarNovamente={recarregar} />;
  if (!dados) return null;
  if (!dados.itens.length) {
    return (
      <div className="bg-white rounded-xl border border-slate-200">
        <EstadoVazio titulo="Sem plano de honorários" descricao="Importe a aba Honorarios Variaveis da planilha." />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <Cartao titulo="Budget de honorários" valor={moedaCompacta(dados.budget_total)} />
        <Cartao titulo="Realizado" valor={moedaCompacta(dados.real_total)} cor="#16A34A" />
        <Cartao
          titulo="Saldo"
          valor={moedaCompacta(dados.budget_total - dados.real_total)}
          cor={dados.budget_total - dados.real_total < 0 ? '#DC2626' : '#0891B2'}
        />
      </div>

      <div className="flex rounded-lg overflow-hidden border border-slate-200 w-fit">
        {(['grupos', 'itens'] as const).map(chave => (
          <button
            key={chave}
            onClick={() => setVisao(chave)}
            className={`px-3 py-2 text-xs font-medium ${visao === chave ? 'text-white' : 'text-slate-500 hover:bg-slate-50'}`}
            style={visao === chave ? { background: BRAND } : {}}
          >
            {chave === 'grupos' ? 'Budget × real por área' : 'Plano mês a mês (itens)'}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          {visao === 'grupos' ? (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-slate-500 bg-slate-50/60 border-b border-slate-100">
                  <th className="text-left font-medium px-4 py-3">EDOA</th>
                  <th className="text-left font-medium px-3 py-3">Área</th>
                  <th className="text-left font-medium px-3 py-3">Recorrência</th>
                  <th className="text-right font-medium px-3 py-3">Budget</th>
                  <th className="text-right font-medium px-3 py-3">Real</th>
                  <th className="text-right font-medium px-3 py-3">Saldo</th>
                  <th className="text-left font-medium px-3 py-3">Consumo</th>
                </tr>
              </thead>
              <tbody>
                {dados.grupos.map(g => (
                  <tr key={`${g.edoa}-${g.area}-${g.recorrencia}`} className="border-b border-slate-50">
                    <td className="px-4 py-2.5 text-slate-500 text-xs">{g.edoa}</td>
                    <td className="px-3 py-2.5 font-medium text-slate-800">{g.area}</td>
                    <td className="px-3 py-2.5 text-slate-600">{g.recorrencia}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{moeda(g.budget)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums" title={`${g.quantidade_lancamentos} lançamento(s)`}>
                      {moeda(g.real)}
                    </td>
                    <td className={`px-3 py-2.5 text-right tabular-nums ${g.saldo < 0 ? 'text-red-600' : ''}`}>
                      {moeda(g.saldo)}
                    </td>
                    <td className="px-3 py-2.5">{g.budget ? <BarraConsumo percentual={g.consumido_percentual} /> : null}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="text-slate-500 bg-slate-50/60 border-b border-slate-100">
                  <th className="text-left font-medium px-4 py-3">Área</th>
                  <th className="text-left font-medium px-3 py-3 min-w-[200px]">Detalhamento</th>
                  <th className="text-left font-medium px-3 py-3">Rec.</th>
                  {MESES_CURTOS.map(m => (
                    <th key={m} className="text-right font-medium px-2 py-3">
                      {m}
                    </th>
                  ))}
                  <th className="text-right font-medium px-3 py-3">Budget</th>
                </tr>
              </thead>
              <tbody>
                {dados.itens.map(item => (
                  <tr key={item.id} className="border-b border-slate-50">
                    <td className="px-4 py-2 text-slate-700 whitespace-nowrap">{item.area}</td>
                    <td className="px-3 py-2 text-slate-600">{item.detalhamento}</td>
                    <td className="px-3 py-2 text-slate-500 whitespace-nowrap">{item.recorrencia}</td>
                    {item.meses.map((valor, i) => (
                      <td key={i} className="px-2 py-2 text-right tabular-nums text-slate-600">
                        {valor ? valor.toLocaleString('pt-BR', { maximumFractionDigits: 0 }) : '—'}
                      </td>
                    ))}
                    <td
                      className={`px-3 py-2 text-right tabular-nums font-medium ${
                        Math.abs(item.soma_meses - item.budget) >= 0.01 && item.soma_meses > 0 ? 'text-amber-600' : ''
                      }`}
                      title={
                        Math.abs(item.soma_meses - item.budget) >= 0.01 && item.soma_meses > 0
                          ? `Soma dos meses: ${moeda(item.soma_meses)}`
                          : undefined
                      }
                    >
                      {moeda(item.budget)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
      <CaixaInfo itens={[dados.observacao]} />
    </div>
  );
}

function Contratos({ ano }: { ano: number }) {
  const { dados, carregando, erro, recarregar } = useRequisicao(() => api.financeiro.contratos(ano), [ano]);
  if (carregando && !dados) return <Carregando />;
  if (erro) return <ErroCarregamento mensagem={erro} aoTentarNovamente={recarregar} />;
  if (!dados) return null;
  if (!dados.contratos.length) {
    return (
      <div className="bg-white rounded-xl border border-slate-200">
        <EstadoVazio titulo="Sem contratos mensais" descricao="Importe a aba Mensais da planilha." />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4 max-w-xl">
        <Cartao titulo="Total mensal contratado" valor={moeda(dados.total_mensal)} />
        <Cartao titulo="Total anual" valor={moeda(dados.total_anual)} cor="#7C3AED" />
      </div>
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-slate-500 bg-slate-50/60 border-b border-slate-100">
                <th className="text-left font-medium px-4 py-3">Tipo</th>
                <th className="text-left font-medium px-3 py-3">Área</th>
                <th className="text-left font-medium px-3 py-3">Descrição</th>
                <th className="text-right font-medium px-3 py-3">Mensal</th>
                <th className="text-right font-medium px-3 py-3">Anual</th>
                <th className="text-right font-medium px-3 py-3">Realizado fixo da área</th>
              </tr>
            </thead>
            <tbody>
              {dados.contratos.map(c => (
                <tr key={c.id} className="border-b border-slate-50">
                  <td className="px-4 py-2.5">
                    <span
                      className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        c.tipo === 'Sistema' ? 'bg-violet-50 text-violet-700' : 'bg-blue-50 text-blue-700'
                      }`}
                    >
                      {c.tipo}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-slate-700">{c.area ?? '—'}</td>
                  <td className="px-3 py-2.5 text-slate-600">{c.descricao}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{moeda(c.valor_mensal)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{moeda(c.valor_anual)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-slate-500">
                    {c.realizado_fixo_ano === null ? '—' : moeda(c.realizado_fixo_ano)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <CaixaInfo itens={[dados.observacao]} />
    </div>
  );
}
