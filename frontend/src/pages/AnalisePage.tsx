/**
 * Análise por EDOA — a tabela dinâmica da aba "LGPD", para qualquer EDOA e
 * qualquer combinação de linhas/colunas.
 */

import { Fragment, useState } from 'react';
import { ChevronDown, ChevronRight, Download } from 'lucide-react';

import { api } from '../api/client';
import type { AnaliseResponse, LinhaAnalise } from '../api/types';
import { Carregando, ErroCarregamento, EstadoVazio } from '../components/Estados';
import { Cartao, SeletorAno, SeletorMes, useAnoFinanceiro } from '../components/financeiro/comum';
import { useRequisicao } from '../hooks/useRequisicao';
import { moeda, moedaCompacta, numero } from '../utils/formato';

const DIMENSOES: Record<string, string> = {
  area: 'Área',
  motivo: 'Motivo',
  recorrencia: 'Recorrência',
  categoria: 'Categoria',
  status: 'Status',
  edoa: 'EDOA',
  tipo_pagamento: 'Pagamento',
  centro_custo: 'Centro de custo',
  conta_contabil: 'Conta contábil',
  mes: 'Mês',
};

const PADRAO_EDOA = 'LGPD GERAL & TERCEIROS';

export default function AnalisePage() {
  const { ano, setAno, anos } = useAnoFinanceiro();
  const [edoa, setEdoa] = useState(PADRAO_EDOA);
  const [linha1, setLinha1] = useState('area');
  const [linha2, setLinha2] = useState('motivo');
  const [coluna, setColuna] = useState('recorrencia');
  const [mesDe, setMesDe] = useState<number | null>(null);
  const [mesAte, setMesAte] = useState<number | null>(null);
  const [abertos, setAbertos] = useState<Set<string>>(new Set());

  const { dados: opcoes } = useRequisicao(() => api.financeiro.opcoesFiltro(), []);
  const { dados, carregando, erro, recarregar } = useRequisicao(
    () =>
      ano === null
        ? Promise.resolve(null)
        : api.financeiro.analise({
            ano,
            edoa,
            linha1,
            linha2: linha2 || '',
            coluna,
            mes_de: mesDe ?? undefined,
            mes_ate: mesAte ?? undefined,
          }),
    [ano, edoa, linha1, linha2, coluna, mesDe, mesAte],
  );

  const alternar = (rotulo: string) =>
    setAbertos(atual => {
      const novo = new Set(atual);
      if (novo.has(rotulo)) novo.delete(rotulo);
      else novo.add(rotulo);
      return novo;
    });

  const edoas = opcoes?.edoas ?? [PADRAO_EDOA];

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-slate-900 font-display">Análise por EDOA</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Tabela dinâmica dos lançamentos — a aba LGPD da planilha é esta análise com o EDOA "{PADRAO_EDOA}"
          </p>
        </div>
        <div className="flex items-center gap-2">
          <SeletorAno ano={ano} anos={anos} aoAlterar={setAno} />
          {dados && dados.linhas.length > 0 && (
            <button
              onClick={() => exportarCsv(dados)}
              className="flex items-center gap-2 px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white text-slate-600 hover:bg-slate-50"
            >
              <Download size={15} /> CSV
            </button>
          )}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-4 grid grid-cols-2 lg:grid-cols-6 gap-3 text-sm">
        <Seletor rotulo="EDOA" valor={edoa} aoAlterar={setEdoa}>
          <option value="">Todos os EDOAs</option>
          {edoas.map(e => (
            <option key={e} value={e}>
              {e}
            </option>
          ))}
        </Seletor>
        <Seletor rotulo="Linhas" valor={linha1} aoAlterar={setLinha1}>
          {Object.entries(DIMENSOES).map(([chave, rotulo]) => (
            <option key={chave} value={chave}>
              {rotulo}
            </option>
          ))}
        </Seletor>
        <Seletor rotulo="Sub-linhas" valor={linha2} aoAlterar={setLinha2}>
          <option value="">(nenhuma)</option>
          {Object.entries(DIMENSOES)
            .filter(([chave]) => chave !== linha1)
            .map(([chave, rotulo]) => (
              <option key={chave} value={chave}>
                {rotulo}
              </option>
            ))}
        </Seletor>
        <Seletor rotulo="Colunas" valor={coluna} aoAlterar={setColuna}>
          {Object.entries(DIMENSOES).map(([chave, rotulo]) => (
            <option key={chave} value={chave}>
              {rotulo}
            </option>
          ))}
        </Seletor>
        <div>
          <span className="block text-xs text-slate-500 mb-1">De</span>
          <SeletorMes valor={mesDe} aoAlterar={setMesDe} permitirVazio="Início" />
        </div>
        <div>
          <span className="block text-xs text-slate-500 mb-1">Até</span>
          <SeletorMes valor={mesAte} aoAlterar={setMesAte} permitirVazio="Fim" />
        </div>
      </div>

      {erro ? (
        <ErroCarregamento mensagem={erro} aoTentarNovamente={recarregar} />
      ) : !dados || (carregando && !dados) ? (
        <Carregando />
      ) : dados.linhas.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200">
          <EstadoVazio titulo="Nenhum lançamento" descricao="Não há lançamentos com esse EDOA e período." />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Cartao titulo="Total" valor={moedaCompacta(dados.total.total)} />
            <Cartao titulo="Lançamentos" valor={numero(dados.quantidade)} cor="#7C3AED" />
            {dados.colunas.slice(0, 2).map(c => (
              <Cartao key={c} titulo={c} valor={moedaCompacta(dados.total.valores[c])} cor="#0891B2" />
            ))}
          </div>

          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-slate-500 bg-slate-50/60 border-b border-slate-100">
                    <th className="text-left font-medium px-4 py-3 min-w-[220px]">
                      {DIMENSOES[linha1]}
                      {linha2 ? ` › ${DIMENSOES[linha2]}` : ''}
                    </th>
                    {dados.colunas.map(c => (
                      <th key={c} className="text-right font-medium px-3 py-3 whitespace-nowrap">
                        {c}
                      </th>
                    ))}
                    <th className="text-right font-medium px-4 py-3">Total geral</th>
                  </tr>
                </thead>
                <tbody>
                  {dados.linhas.map(linha => {
                    const aberto = abertos.has(linha.rotulo);
                    const temFilhos = (linha.filhos?.length ?? 0) > 0;
                    return (
                      <Fragment key={linha.rotulo}>
                        <tr
                          className={`border-b border-slate-50 font-medium text-slate-900 ${temFilhos ? 'cursor-pointer hover:bg-slate-50' : ''}`}
                          onClick={temFilhos ? () => alternar(linha.rotulo) : undefined}
                        >
                          <td className="px-4 py-2.5">
                            <span className="flex items-center gap-1.5">
                              {temFilhos ? (
                                aberto ? <ChevronDown size={14} className="text-slate-400" /> : <ChevronRight size={14} className="text-slate-400" />
                              ) : (
                                <span className="w-3.5" />
                              )}
                              {linha.rotulo}
                            </span>
                          </td>
                          <Celulas linha={linha} colunas={dados.colunas} />
                        </tr>
                        {aberto &&
                          linha.filhos?.map(filho => (
                            <tr key={`${linha.rotulo}-${filho.rotulo}`} className="border-b border-slate-50 text-slate-600">
                              <td className="px-4 py-2 pl-11">{filho.rotulo}</td>
                              <Celulas linha={filho} colunas={dados.colunas} />
                            </tr>
                          ))}
                      </Fragment>
                    );
                  })}
                  <tr className="bg-slate-50 font-semibold text-slate-900">
                    <td className="px-4 py-2.5">Total geral</td>
                    <Celulas linha={dados.total} colunas={dados.colunas} />
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function Celulas({ linha, colunas }: { linha: LinhaAnalise; colunas: string[] }) {
  return (
    <>
      {colunas.map(c => (
        <td key={c} className="px-3 py-2.5 text-right tabular-nums">
          {linha.valores[c] ? moeda(linha.valores[c]) : <span className="text-slate-300">—</span>}
        </td>
      ))}
      <td className="px-4 py-2.5 text-right tabular-nums font-semibold">{moeda(linha.total)}</td>
    </>
  );
}

function Seletor({
  rotulo,
  valor,
  aoAlterar,
  children,
}: {
  rotulo: string;
  valor: string;
  aoAlterar: (v: string) => void;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="block text-xs text-slate-500 mb-1">{rotulo}</span>
      <select
        value={valor}
        onChange={e => aoAlterar(e.target.value)}
        className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white text-slate-700 focus:outline-none"
      >
        {children}
      </select>
    </label>
  );
}

function exportarCsv(dados: AnaliseResponse) {
  const numeroCsv = (v: number | undefined) => (v ?? 0).toFixed(2).replace('.', ',');
  const linhas: string[][] = [['Linha', 'Sub-linha', ...dados.colunas, 'Total geral']];
  dados.linhas.forEach(l => {
    linhas.push([l.rotulo, '', ...dados.colunas.map(c => numeroCsv(l.valores[c])), numeroCsv(l.total)]);
    l.filhos?.forEach(f => linhas.push([l.rotulo, f.rotulo, ...dados.colunas.map(c => numeroCsv(f.valores[c])), numeroCsv(f.total)]));
  });
  linhas.push(['Total geral', '', ...dados.colunas.map(c => numeroCsv(dados.total.valores[c])), numeroCsv(dados.total.total)]);
  const csv = '﻿' + linhas.map(l => l.map(c => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `analise-${(dados.edoa || 'todos').toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${dados.ano}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}
