import { useState } from 'react';
import { ArrowDownLeft, Plus, Search } from 'lucide-react';

import { api } from '../api/client';
import type { Devolucao } from '../api/types';
import { Carregando, ErroCarregamento, EstadoVazio } from '../components/Estados';
import ModalFormulario from '../components/financeiro/ModalFormulario';
import { useAuth } from '../context/AuthContext';
import { useRequisicao } from '../hooks/useRequisicao';
import { data as formatarData, moeda, numero } from '../utils/formato';
import SeloPeriodo from '../components/SeloPeriodo';
import { periodoDosAnos } from '../utils/periodo';

const BRAND = '#0035AD';

export default function DevolucoesPage() {
  const [fornecedor, setFornecedor] = useState('');
  const [area, setArea] = useState('');
  const [editando, setEditando] = useState<Devolucao | 'nova' | null>(null);
  const { podeAcessar } = useAuth();
  const podeEditar = podeAcessar('Analista');

  const { dados: opcoes } = useRequisicao(() => api.financeiro.opcoesFiltro(), []);
  const { dados, carregando, erro, recarregar } = useRequisicao(
    () => api.financeiro.devolucoes({ area: area || undefined, fornecedor: fornecedor || undefined }),
    [area, fornecedor],
  );

  const itens = dados ?? [];
  const total = itens.reduce((soma, i) => soma + i.valor_devolvido, 0);
  const periodo = periodoDosAnos(itens.map(i => i.ano_referencia));

  // Concentração por fornecedor, para ver de quem vem o dinheiro de volta.
  const porFornecedor = Object.entries(
    itens.reduce<Record<string, number>>((mapa, item) => {
      const chave = item.fornecedor ?? 'Não informado';
      mapa[chave] = (mapa[chave] ?? 0) + item.valor_devolvido;
      return mapa;
    }, {}),
  )
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-slate-900 font-display">Devoluções</h1>
          <p className="text-sm text-slate-500 mt-0.5">Valores estornados pelos escritórios</p>
          <SeloPeriodo periodo={carregando ? 'Carregando...' : periodo} />
        </div>
        {podeEditar && (
          <button
            onClick={() => setEditando('nova')}
            className="flex items-center gap-2 px-3 py-2 text-sm rounded-lg text-white font-medium"
            style={{ background: BRAND }}
          >
            <Plus size={15} /> Nova devolução
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div
            className="w-9 h-9 rounded-lg flex items-center justify-center mb-3"
            style={{ background: `${BRAND}14` }}
          >
            <ArrowDownLeft size={18} style={{ color: BRAND }} />
          </div>
          <p className="text-xl font-bold text-slate-900 font-display">{moeda(total)}</p>
          <p className="text-xs font-medium text-slate-600 mt-1">Total devolvido</p>
          <p className="text-xs text-slate-400 mt-0.5">{numero(itens.length)} estorno(s)</p>
        </div>

        <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 p-4">
          <h3 className="font-semibold text-slate-900 text-sm font-display mb-3">
            Maiores devoluções por fornecedor
          </h3>
          <div className="space-y-2.5">
            {porFornecedor.length === 0 ? (
              <p className="text-sm text-slate-400">Sem dados.</p>
            ) : (
              porFornecedor.map(([nome, valor]) => (
                <div key={nome} className="flex items-center gap-3">
                  <span className="text-xs text-slate-700 w-44 truncate">{nome}</span>
                  <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${(valor / (porFornecedor[0][1] || 1)) * 100}%`, background: BRAND }}
                    />
                  </div>
                  <span className="text-xs font-mono text-slate-700 w-28 text-right">{moeda(valor)}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[220px] max-w-sm">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={fornecedor}
              onChange={e => setFornecedor(e.target.value)}
              placeholder="Buscar fornecedor..."
              className="w-full pl-8 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:border-transparent bg-white"
              style={{ '--tw-ring-color': BRAND } as React.CSSProperties}
            />
          </div>
          <select
            value={area}
            onChange={e => setArea(e.target.value)}
            className="px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white text-slate-700 focus:outline-none"
          >
            <option value="">Todas as áreas</option>
            {(opcoes?.areas ?? []).map(a => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </div>

        {erro ? (
          <ErroCarregamento mensagem={erro} aoTentarNovamente={recarregar} />
        ) : carregando ? (
          <Carregando />
        ) : itens.length === 0 ? (
          <EstadoVazio titulo="Nenhuma devolução encontrada" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/60">
                  {['Área', 'Fornecedor', 'Data', 'Pasta Benner', 'Chamado', 'Documento', 'Observação', 'Valor'].map(
                    h => (
                      <th
                        key={h}
                        className={`text-xs font-medium text-slate-500 px-4 py-3 whitespace-nowrap ${
                          h === 'Valor' ? 'text-right' : 'text-left'
                        }`}
                      >
                        {h}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {itens.map(item => (
                  <tr
                    key={item.id}
                    onClick={podeEditar ? () => setEditando(item) : undefined}
                    className={`border-b border-slate-50 last:border-0 hover:bg-slate-50 ${podeEditar ? 'cursor-pointer' : ''}`}
                  >
                    <td className="px-4 py-3 text-xs text-slate-700 whitespace-nowrap">{item.area ?? '—'}</td>
                    <td className="px-4 py-3 text-xs text-slate-700 whitespace-nowrap">{item.fornecedor ?? '—'}</td>
                    <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">
                      {formatarData(item.data_transferencia)}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600 whitespace-nowrap">
                      {item.pasta_benner ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-xs font-mono text-slate-500 whitespace-nowrap">
                      {item.chamado ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-xs font-mono text-slate-500 whitespace-nowrap">
                      {item.documento ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500 max-w-[200px] truncate">
                      {item.observacao ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-xs font-mono font-medium text-slate-800 text-right whitespace-nowrap">
                      {moeda(item.valor_devolvido)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editando && (
        <ModalFormulario
          titulo={editando === 'nova' ? 'Nova devolução' : 'Editar devolução'}
          campos={[
            { nome: 'area', rotulo: 'Área', opcoes: opcoes?.areas },
            { nome: 'fornecedor', rotulo: 'Fornecedor' },
            { nome: 'valor_devolvido', rotulo: 'Valor devolvido (R$)', tipo: 'numero', obrigatorio: true },
            { nome: 'data_transferencia', rotulo: 'Data da transferência', tipo: 'data' },
            { nome: 'codigo_banco', rotulo: 'Código do banco' },
            { nome: 'pasta_benner', rotulo: 'Pasta Benner' },
            { nome: 'chamado', rotulo: 'Nº chamado' },
            { nome: 'documento', rotulo: 'Documento' },
            { nome: 'ano_referencia', rotulo: 'Ano (exercício)', tipo: 'numero' },
            { nome: 'observacao', rotulo: 'Observação', tipo: 'textarea', largo: true },
          ]}
          inicial={editando === 'nova' ? { ano_referencia: opcoes?.anos?.[0] ?? new Date().getFullYear() } : { ...editando }}
          aoFechar={() => setEditando(null)}
          aoSalvar={async valores => {
            if (editando === 'nova') await api.financeiro.criarDevolucao(valores);
            else await api.financeiro.atualizarDevolucao(editando.id, valores);
            setEditando(null);
            recarregar();
          }}
          aoExcluir={
            editando !== 'nova'
              ? async () => {
                  await api.financeiro.excluirDevolucao(editando.id);
                  setEditando(null);
                  recarregar();
                }
              : undefined
          }
        />
      )}
    </div>
  );
}
