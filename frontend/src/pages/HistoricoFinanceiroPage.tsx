import { useState } from 'react';

import { api } from '../api/client';
import type { AcaoHistorico, EntidadeFinanceira } from '../api/types';
import { Carregando, ErroCarregamento } from '../components/Estados';
import { useRequisicao } from '../hooks/useRequisicao';
import { numero } from '../utils/formato';

const ENTIDADES: Record<EntidadeFinanceira, string> = {
  lancamento: 'Lançamento',
  adiantamento: 'Adiantamento',
  devolucao: 'Devolução',
};

const ACOES: Record<AcaoHistorico, { texto: string; classe: string }> = {
  criacao: { texto: 'Criação', classe: 'bg-green-50 text-green-700' },
  alteracao: { texto: 'Alteração', classe: 'bg-blue-50 text-blue-700' },
  exclusao: { texto: 'Exclusão', classe: 'bg-red-50 text-red-700' },
};

const CAMPO =
  'px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white text-slate-600 focus:outline-none';

function formatarData(iso: string) {
  return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

export default function HistoricoFinanceiroPage() {
  const [entidade, setEntidade] = useState('');
  const [acao, setAcao] = useState('');
  const [dataDe, setDataDe] = useState('');
  const [dataAte, setDataAte] = useState('');
  const [pagina, setPagina] = useState(1);

  const { dados, carregando, erro, recarregar } = useRequisicao(
    () =>
      api.financeiro.historico({
        entidade: entidade || undefined,
        acao: acao || undefined,
        data_de: dataDe || undefined,
        data_ate: dataAte || undefined,
        pagina,
        por_pagina: 25,
      }),
    [entidade, acao, dataDe, dataAte, pagina],
  );

  const temFiltro = Boolean(entidade || acao || dataDe || dataAte);

  const limpar = () => {
    setEntidade('');
    setAcao('');
    setDataDe('');
    setDataAte('');
    setPagina(1);
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900 font-display">Histórico de alterações</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Quem criou, alterou ou excluiu pagamentos, adiantamentos e devoluções
        </p>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-xs text-slate-500 space-y-1">
          <span className="block">Tipo</span>
          <select
            value={entidade}
            onChange={e => {
              setEntidade(e.target.value);
              setPagina(1);
            }}
            className={CAMPO}
          >
            <option value="">Todos</option>
            <option value="lancamento">Lançamentos</option>
            <option value="adiantamento">Adiantamentos</option>
            <option value="devolucao">Devoluções</option>
          </select>
        </label>

        <label className="text-xs text-slate-500 space-y-1">
          <span className="block">Ação</span>
          <select
            value={acao}
            onChange={e => {
              setAcao(e.target.value);
              setPagina(1);
            }}
            className={CAMPO}
          >
            <option value="">Todas</option>
            <option value="criacao">Criação</option>
            <option value="alteracao">Alteração</option>
            <option value="exclusao">Exclusão</option>
          </select>
        </label>

        <label className="text-xs text-slate-500 space-y-1">
          <span className="block">De</span>
          <input
            type="date"
            value={dataDe}
            onChange={e => {
              setDataDe(e.target.value);
              setPagina(1);
            }}
            className={CAMPO}
          />
        </label>

        <label className="text-xs text-slate-500 space-y-1">
          <span className="block">Até</span>
          <input
            type="date"
            value={dataAte}
            onChange={e => {
              setDataAte(e.target.value);
              setPagina(1);
            }}
            className={CAMPO}
          />
        </label>

        {temFiltro && (
          <button onClick={limpar} className={`${CAMPO} hover:bg-slate-50`}>
            Limpar filtros
          </button>
        )}
      </div>

      {/* Resultado */}
      {erro ? (
        <ErroCarregamento mensagem={erro} aoTentarNovamente={recarregar} />
      ) : carregando && !dados ? (
        <Carregando mensagem="Carregando histórico..." />
      ) : !dados || dados.itens.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200">
          <p className="text-sm text-slate-400 text-center py-12">
            {temFiltro
              ? 'Nenhuma alteração encontrada com esses filtros.'
              : 'Ainda não há alterações registradas. Elas aparecem aqui assim que alguém editar um pagamento.'}
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-medium">Data</th>
                  <th className="px-4 py-3 font-medium">Usuário</th>
                  <th className="px-4 py-3 font-medium">Ação</th>
                  <th className="px-4 py-3 font-medium">Item</th>
                  <th className="px-4 py-3 font-medium">Campo</th>
                  <th className="px-4 py-3 font-medium">Valor anterior</th>
                  <th className="px-4 py-3 font-medium">Valor novo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {dados.itens.map(h => {
                  const info = ACOES[h.acao] ?? { texto: h.acao, classe: 'bg-slate-100 text-slate-600' };
                  return (
                    <tr key={h.id} className="align-top">
                      <td className="px-4 py-3 whitespace-nowrap text-slate-600">{formatarData(h.data)}</td>
                      <td className="px-4 py-3 text-slate-800">{h.usuario_nome ?? '—'}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${info.classe}`}>
                          {info.texto}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        <div className="font-medium">
                          {ENTIDADES[h.entidade] ?? h.entidade} #{h.entidade_id}
                        </div>
                        {h.resumo && <div className="text-slate-400 mt-0.5">{h.resumo}</div>}
                      </td>
                      <td className="px-4 py-3 text-slate-600">{h.campo ?? '—'}</td>
                      <td
                        className="px-4 py-3 text-slate-500 max-w-[220px] truncate"
                        title={h.valor_anterior ?? undefined}
                      >
                        {h.valor_anterior ?? '—'}
                      </td>
                      <td
                        className="px-4 py-3 text-slate-800 max-w-[220px] truncate"
                        title={h.valor_novo ?? undefined}
                      >
                        {h.valor_novo ?? '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 text-xs text-slate-500">
            <span>
              {numero(dados.total)} registros · página {dados.pagina} de {dados.total_paginas}
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => setPagina(p => Math.max(1, p - 1))}
                disabled={dados.pagina <= 1}
                className={`${CAMPO} py-1 disabled:opacity-40`}
              >
                Anterior
              </button>
              <button
                onClick={() => setPagina(p => p + 1)}
                disabled={dados.pagina >= dados.total_paginas}
                className={`${CAMPO} py-1 disabled:opacity-40`}
              >
                Próxima
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}