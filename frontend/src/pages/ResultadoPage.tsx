/** Resultado — equivale à aba "Resultado": gasto por categoria × DOA, no mês e no ano. */

import { useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

import { api } from '../api/client';
import type { LinhaResultado } from '../api/types';
import { Carregando, ErroCarregamento, EstadoVazio } from '../components/Estados';
import { BRAND, CaixaInfo, Cartao, SeletorAno, SeletorMes, useAnoFinanceiro } from '../components/financeiro/comum';
import SeloPeriodo from '../components/SeloPeriodo';
import { useRequisicao } from '../hooks/useRequisicao';
import { moeda, moedaCompacta } from '../utils/formato';
import { periodoDoIntervalo } from '../utils/periodo';

const CORES_IMPACTO: Record<string, string> = {
  APCO: '#0035AD',
  MASSA: '#0891B2',
  APCE: '#7C3AED',
  'G&A': '#D97706',
};

export default function ResultadoPage() {
  const { ano, setAno, anos, info } = useAnoFinanceiro();
  const [mes, setMes] = useState<number | null>(null);

  useEffect(() => {
    if (info && mes === null) setMes(info.mes_fechamento);
  }, [info, mes]);

  const { dados, carregando, erro, recarregar } = useRequisicao(
    () => (ano === null ? Promise.resolve(null) : api.financeiro.resultado(ano, mes ?? undefined)),
    [ano, mes],
  );

  if (ano === null || (carregando && !dados)) return <Carregando mensagem="Montando o resultado..." />;
  if (erro) return <ErroCarregamento mensagem={erro} aoTentarNovamente={recarregar} />;
  if (!dados) return null;

  const semDados = dados.total_ano === 0 && dados.total_nao_mapeado_ano === 0;
  // O relatório acumula do início do ano até o mês escolhido.
  const periodo = periodoDoIntervalo(ano, 1, mes);

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-slate-900 font-display">Resultado</h1>
          <p className="text-sm text-slate-500 mt-0.5">Gasto por categoria contábil e DOA — mês escolhido e acumulado do ano</p>
          <SeloPeriodo periodo={periodo} />
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <SeletorAno ano={ano} anos={anos} aoAlterar={a => { setAno(a); setMes(null); }} />
          <SeletorMes rotulo="Mês" valor={mes} aoAlterar={setMes} />
        </div>
      </div>

      {semDados ? (
        <div className="bg-white rounded-xl border border-slate-200">
          <EstadoVazio titulo={`Sem lançamentos em ${ano}`} descricao="Importe a planilha de pagamentos para ver o resultado." />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Cartao titulo={`Gasto em ${dados.mes_nome ?? '—'}`} valor={moedaCompacta(dados.total_mes)} />
            <Cartao titulo="Gasto no ano (linhas do relatório)" valor={moedaCompacta(dados.total_ano)} cor="#7C3AED" />
            <Cartao
              titulo="Fora do relatório"
              valor={moedaCompacta(dados.total_nao_mapeado_ano)}
              cor={dados.total_nao_mapeado_ano > 0 ? '#D97706' : '#16A34A'}
              detalhe="categoria × EDOA sem linha no layout"
            />
            <Cartao
              titulo="Sem categoria"
              valor={moedaCompacta(dados.total_sem_categoria_ano)}
              cor={dados.total_sem_categoria_ano > 0 ? '#DC2626' : '#16A34A'}
            />
          </div>

          {dados.por_impacto.length > 0 && (
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <h3 className="font-semibold text-slate-900 text-sm font-display mb-3">Por impacto (ano)</h3>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={dados.por_impacto} layout="vertical" margin={{ left: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#F1F5F9" />
                  <XAxis type="number" tickFormatter={v => moedaCompacta(v)} fontSize={11} />
                  <YAxis type="category" dataKey="impacto" width={120} fontSize={11} />
                  <Tooltip formatter={(v: number) => moeda(v)} />
                  <Bar dataKey="valor_ano" name="Ano" fill={BRAND} radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {dados.tem_layout ? (
            <TabelaResultado titulo="Relatório (layout da aba Resultado)" linhas={dados.linhas} mesNome={dados.mes_nome} mostrarRegra />
          ) : (
            <CaixaInfo
              tom="alerta"
              itens={['Este exercício não tem o layout da aba Resultado importado — abaixo, todo o gasto por categoria × EDOA.']}
            />
          )}

          {dados.nao_mapeados.length > 0 && (
            <TabelaResultado
              titulo={`Gasto fora do relatório (${dados.nao_mapeados.length})`}
              linhas={dados.nao_mapeados}
              mesNome={dados.mes_nome}
              alerta={dados.tem_layout}
            />
          )}

          <CaixaInfo
            itens={[
              'Os valores são recalculados dos lançamentos. Do arquivo vem só o layout: quais linhas aparecem, a ordem e o IMPACTO.',
              'Linhas marcadas "inferida" não têm fórmula na planilha; o critério foi deduzido do rótulo do DOA.',
            ]}
          />
        </>
      )}
    </div>
  );
}

function TabelaResultado({
  titulo,
  linhas,
  mesNome,
  mostrarRegra,
  alerta,
}: {
  titulo: string;
  linhas: LinhaResultado[];
  mesNome: string | null;
  mostrarRegra?: boolean;
  alerta?: boolean;
}) {
  const totalMes = linhas.reduce((a, l) => a + l.valor_mes, 0);
  const totalAno = linhas.reduce((a, l) => a + l.valor_ano, 0);
  return (
    <div className={`bg-white rounded-xl border overflow-hidden ${alerta ? 'border-amber-200' : 'border-slate-200'}`}>
      <div className="px-5 py-3.5 border-b border-slate-100 flex items-center gap-2">
        {alerta && <AlertTriangle size={15} className="text-amber-600" />}
        <h3 className="font-semibold text-slate-900 text-sm font-display">{titulo}</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-slate-500 bg-slate-50/60 border-b border-slate-100">
              <th className="text-left font-medium px-4 py-3">Categoria</th>
              <th className="text-left font-medium px-3 py-3">DOA</th>
              <th className="text-left font-medium px-3 py-3">Impacto</th>
              <th className="text-right font-medium px-3 py-3">Gasto em {mesNome ?? '—'}</th>
              <th className="text-right font-medium px-3 py-3">Gasto no ano</th>
              <th className="text-right font-medium px-3 py-3">Lanç.</th>
              {mostrarRegra && <th className="text-left font-medium px-3 py-3">Critério</th>}
            </tr>
          </thead>
          <tbody>
            {linhas.map((linha, i) => (
              <tr key={`${linha.categoria}-${linha.doa}-${i}`} className="border-b border-slate-50">
                <td className="px-4 py-2.5 font-medium text-slate-800">{linha.categoria}</td>
                <td className="px-3 py-2.5 text-slate-600">{linha.doa ?? '—'}</td>
                <td className="px-3 py-2.5">
                  {linha.impacto ? (
                    <span
                      className="px-2 py-0.5 rounded-full text-[11px] font-medium text-white"
                      style={{ background: CORES_IMPACTO[linha.impacto] ?? '#64748B' }}
                    >
                      {linha.impacto}
                    </span>
                  ) : (
                    '—'
                  )}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums">{moeda(linha.valor_mes)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{moeda(linha.valor_ano)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums text-slate-400">{linha.quantidade}</td>
                {mostrarRegra && (
                  <td className="px-3 py-2.5">
                    <span
                      className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                        linha.regra_origem === 'inferida' ? 'bg-amber-50 text-amber-700' : 'bg-green-50 text-green-700'
                      }`}
                      title={linha.filtro_edoa ? `EDOA = ${linha.filtro_edoa.split('|').join(' ou ')}` : 'Todos os EDOAs'}
                    >
                      {linha.regra_origem === 'inferida' ? 'Inferida' : 'Fórmula'}
                    </span>
                  </td>
                )}
              </tr>
            ))}
            <tr className="bg-slate-50 font-semibold">
              <td className="px-4 py-2.5" colSpan={3}>
                Total
              </td>
              <td className="px-3 py-2.5 text-right tabular-nums">{moeda(totalMes)}</td>
              <td className="px-3 py-2.5 text-right tabular-nums">{moeda(totalAno)}</td>
              <td colSpan={mostrarRegra ? 2 : 1} />
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
