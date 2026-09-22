import { useState } from 'react';
import { CheckCircle2, Clock, Plus, Wallet } from 'lucide-react';

import { api } from '../api/client';
import type { Adiantamento } from '../api/types';
import { Carregando, ErroCarregamento, EstadoVazio } from '../components/Estados';
import ModalFormulario from '../components/financeiro/ModalFormulario';
import { useAuth } from '../context/AuthContext';
import { useRequisicao } from '../hooks/useRequisicao';
import { moeda, moedaCompacta, numero } from '../utils/formato';

const BRAND = '#0035AD';

type Aba = 'todos' | 'abertos' | 'baixados';

export default function AdiantamentosPage() {
  const [aba, setAba] = useState<Aba>('todos');
  const [editando, setEditando] = useState<Adiantamento | 'novo' | null>(null);
  const { podeAcessar } = useAuth();
  const podeEditar = podeAcessar('Analista');
  const { dados: opcoes } = useRequisicao(() => api.financeiro.opcoesFiltro(), []);

  const { dados, carregando, erro, recarregar } = useRequisicao(
    () =>
      api.financeiro.adiantamentos(
        aba === 'todos' ? {} : { em_aberto: aba === 'abertos' },
      ),
    [aba],
  );

  const itens = dados ?? [];
  const totalAdiantado = itens.reduce((soma, i) => soma + i.valor, 0);
  const totalExcedente = itens.reduce((soma, i) => soma + i.valor_excedente, 0);
  const emAberto = itens.filter(i => !i.baixado);

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-slate-900 font-display">Adiantamentos</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Valores adiantados aos escritórios e o controle das baixas
          </p>
        </div>
        <div className="flex items-center gap-2">
        {podeEditar && (
          <button
            onClick={() => setEditando('novo')}
            className="flex items-center gap-2 px-3 py-2 text-sm rounded-lg text-white font-medium"
            style={{ background: BRAND }}
          >
            <Plus size={15} /> Novo adiantamento
          </button>
        )}
        <div className="flex rounded-lg overflow-hidden border border-slate-200">
          {(
            [
              ['todos', 'Todos'],
              ['abertos', 'Sem baixa'],
              ['baixados', 'Baixados'],
            ] as const
          ).map(([chave, rotulo]) => (
            <button
              key={chave}
              onClick={() => setAba(chave)}
              className={`px-3 py-2 text-xs font-medium transition-colors ${
                aba === chave ? 'text-white' : 'text-slate-500 hover:bg-slate-50'
              }`}
              style={aba === chave ? { background: BRAND } : {}}
            >
              {rotulo}
            </button>
          ))}
        </div>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Cartao icon={Wallet} titulo="Total adiantado" valor={moeda(totalAdiantado)} cor={BRAND} />
        <Cartao
          icon={Clock}
          titulo="Sem baixa"
          valor={moeda(emAberto.reduce((s, i) => s + i.valor, 0))}
          detalhe={`${emAberto.length} adiantamento(s)`}
          cor="#EA580C"
        />
        <Cartao
          icon={CheckCircle2}
          titulo="Baixados"
          valor={numero(itens.length - emAberto.length)}
          detalhe="com baixa registrada"
          cor="#16A34A"
        />
        <Cartao
          icon={Wallet}
          titulo="Valor excedente"
          valor={moeda(totalExcedente)}
          detalhe="pago além do adiantado"
          cor="#7C3AED"
        />
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {erro ? (
          <ErroCarregamento mensagem={erro} aoTentarNovamente={recarregar} />
        ) : carregando ? (
          <Carregando />
        ) : itens.length === 0 ? (
          <EstadoVazio
            titulo="Nenhum adiantamento"
            descricao="Importe a planilha de pagamentos para trazer a aba Adiantamentos."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/60">
                  {[
                    'Status',
                    'Área',
                    'DOA',
                    'Escritório',
                    'Chamado',
                    'Chamado da baixa',
                    'Valor',
                    'Excedente',
                    'Total',
                  ].map(h => (
                    <th
                      key={h}
                      className={`text-xs font-medium text-slate-500 px-4 py-3 whitespace-nowrap ${
                        ['Valor', 'Excedente', 'Total'].includes(h) ? 'text-right' : 'text-left'
                      }`}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {itens.map(item => (
                  <tr
                    key={item.id}
                    onClick={podeEditar ? () => setEditando(item) : undefined}
                    className={`border-b border-slate-50 last:border-0 hover:bg-slate-50 ${podeEditar ? 'cursor-pointer' : ''}`}
                  >
                    <td className="px-4 py-3">
                      <span
                        className={`px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${
                          item.baixado ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
                        }`}
                      >
                        {item.status ?? (item.baixado ? 'Baixado' : 'Em aberto')}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-700 whitespace-nowrap">{item.area ?? '—'}</td>
                    <td className="px-4 py-3 text-xs text-slate-600 whitespace-nowrap">{item.doa ?? '—'}</td>
                    <td className="px-4 py-3 text-xs text-slate-600 max-w-[200px] truncate">
                      {item.escritorio ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-xs font-mono text-slate-500 whitespace-nowrap">
                      {item.chamado_adiantamento ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-xs font-mono text-slate-500 whitespace-nowrap">
                      {item.chamado_baixa ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-xs font-mono text-slate-700 text-right whitespace-nowrap">
                      {moeda(item.valor)}
                    </td>
                    <td
                      className={`px-4 py-3 text-xs font-mono text-right whitespace-nowrap ${
                        item.valor_excedente > 0 ? 'text-orange-600 font-medium' : 'text-slate-400'
                      }`}
                    >
                      {item.valor_excedente > 0 ? moeda(item.valor_excedente) : '—'}
                    </td>
                    <td className="px-4 py-3 text-xs font-mono font-medium text-slate-800 text-right whitespace-nowrap">
                      {moedaCompacta(item.valor_total)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p className="text-[11px] text-slate-400">
        O status segue a regra da planilha: chamado do adiantamento → "Adiantamento Lançado"; chamado da baixa →
        "Baixa lançada"; documento da baixa → "Adiantamento Baixado".
      </p>

      {editando && (
        <ModalFormulario
          titulo={editando === 'novo' ? 'Novo adiantamento' : 'Editar adiantamento'}
          subtitulo={
            editando !== 'novo' && !editando.manual
              ? 'Veio da planilha — uma nova importação do mesmo ano sobrescreve as alterações.'
              : undefined
          }
          campos={[
            { nome: 'area', rotulo: 'Área', opcoes: opcoes?.areas },
            { nome: 'doa', rotulo: 'DOA', opcoes: opcoes?.edoas },
            { nome: 'escritorio', rotulo: 'Escritório', largo: true },
            { nome: 'valor', rotulo: 'Valor (R$)', tipo: 'numero', obrigatorio: true },
            { nome: 'valor_excedente', rotulo: 'Valor excedente (R$)', tipo: 'numero' },
            { nome: 'chamado_adiantamento', rotulo: 'Chamado do adiantamento', grupo: 'Controle' },
            { nome: 'chamado_baixa', rotulo: 'Nº chamado da baixa', grupo: 'Controle' },
            { nome: 'documento_baixa', rotulo: 'Documento da baixa', grupo: 'Controle' },
            { nome: 'ano_referencia', rotulo: 'Ano (exercício)', tipo: 'numero', grupo: 'Controle' },
            { nome: 'conferido_planilha', rotulo: 'Ok na planilha de pagamentos', tipo: 'checkbox', grupo: 'Controle' },
            { nome: 'observacao', rotulo: 'Observação', tipo: 'textarea', largo: true, grupo: 'Controle' },
          ]}
          inicial={editando === 'novo' ? { ano_referencia: opcoes?.anos?.[0] ?? new Date().getFullYear() } : { ...editando }}
          aoFechar={() => setEditando(null)}
          aoSalvar={async valores => {
            if (editando === 'novo') await api.financeiro.criarAdiantamento(valores);
            else await api.financeiro.atualizarAdiantamento(editando.id, valores);
            setEditando(null);
            recarregar();
          }}
          aoExcluir={
            editando !== 'novo'
              ? async () => {
                  await api.financeiro.excluirAdiantamento(editando.id);
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

function Cartao({
  icon: Icon,
  titulo,
  valor,
  detalhe,
  cor,
}: {
  icon: React.ElementType;
  titulo: string;
  valor: string;
  detalhe?: string;
  cor: string;
}) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4">
      <div className="w-9 h-9 rounded-lg flex items-center justify-center mb-3" style={{ background: `${cor}14` }}>
        <Icon size={18} style={{ color: cor }} />
      </div>
      <p className="text-lg font-bold text-slate-900 font-display">{valor}</p>
      <p className="text-xs font-medium text-slate-600 mt-1">{titulo}</p>
      {detalhe && <p className="text-xs text-slate-400 mt-0.5">{detalhe}</p>}
    </div>
  );
}
