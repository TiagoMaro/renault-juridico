/** Cadastros do financeiro: listas da aba Base e plano de contas da aba RF MENSAL. */

import { useState } from 'react';
import { Plus, X } from 'lucide-react';

import { api } from '../api/client';
import type { ContaContabil } from '../api/types';
import { Carregando, ErroCarregamento, EstadoVazio } from '../components/Estados';
import ModalFormulario from '../components/financeiro/ModalFormulario';
import { BRAND, CaixaInfo } from '../components/financeiro/comum';
import { useAuth } from '../context/AuthContext';
import { useRequisicao } from '../hooks/useRequisicao';

export default function CadastrosFinanceirosPage() {
  const [aba, setAba] = useState<'listas' | 'contas'>('listas');
  return (
    <div className="p-6 space-y-5">
      <div>
        <h1 className="text-xl font-bold text-slate-900 font-display">Cadastros financeiros</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Listas usadas nos filtros e na padronização da importação (aba Base) e plano de contas (aba RF MENSAL)
        </p>
      </div>
      <div className="flex gap-1 border-b border-slate-200">
        {(
          [
            ['listas', 'Listas (Base)'],
            ['contas', 'Plano de contas (RF MENSAL)'],
          ] as const
        ).map(([chave, rotulo]) => (
          <button
            key={chave}
            onClick={() => setAba(chave)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px ${
              aba === chave ? 'text-slate-900' : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
            style={aba === chave ? { borderColor: BRAND } : {}}
          >
            {rotulo}
          </button>
        ))}
      </div>
      {aba === 'listas' ? <Listas /> : <Contas />}
    </div>
  );
}

function Listas() {
  const { podeAcessar } = useAuth();
  const podeEditar = podeAcessar('Gestor');
  const { dados, carregando, erro, recarregar } = useRequisicao(() => api.financeiro.dominios(), []);
  const [novos, setNovos] = useState<Record<string, string>>({});
  const [falha, setFalha] = useState<string | null>(null);

  if (carregando && !dados) return <Carregando />;
  if (erro) return <ErroCarregamento mensagem={erro} aoTentarNovamente={recarregar} />;
  if (!dados) return null;

  const adicionar = async (tipo: string) => {
    const valor = (novos[tipo] ?? '').trim();
    if (!valor) return;
    setFalha(null);
    try {
      await api.financeiro.criarDominio(tipo, valor);
      setNovos(n => ({ ...n, [tipo]: '' }));
      recarregar();
    } catch (problema) {
      setFalha(problema instanceof Error ? problema.message : 'Não foi possível adicionar.');
    }
  };

  const remover = async (id: number) => {
    await api.financeiro.excluirDominio(id);
    recarregar();
  };

  return (
    <div className="space-y-4">
      <CaixaInfo
        itens={[
          'Na importação, grafias diferentes do mesmo valor ("acordo", "Acordo ", "ACORDO") viram a grafia desta lista.',
          'O número ao lado de cada item é quantos lançamentos usam aquele valor.',
        ]}
      />
      {falha && <CaixaInfo tom="alerta" itens={[falha]} />}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {dados.tipos.map(grupo => (
          <div key={grupo.tipo} className="bg-white rounded-xl border border-slate-200 p-4 flex flex-col">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-slate-900 text-sm font-display">{grupo.rotulo}</h3>
              <span className="text-xs text-slate-400">{grupo.itens.length}</span>
            </div>
            <div className="flex flex-wrap gap-1.5 max-h-56 overflow-y-auto">
              {grupo.itens.length === 0 && <span className="text-xs text-slate-400">Nenhum item</span>}
              {grupo.itens.map(item => (
                <span
                  key={item.id}
                  className="inline-flex items-center gap-1 pl-2 pr-1 py-0.5 rounded-full bg-slate-100 text-xs text-slate-700"
                >
                  {item.valor}
                  {item.uso ? <span className="text-[10px] text-slate-400">{item.uso}</span> : null}
                  {podeEditar && (
                    <button
                      onClick={() => remover(item.id)}
                      className="text-slate-300 hover:text-red-600"
                      aria-label={`Remover ${item.valor}`}
                      title={item.uso ? 'Remove só da lista — os lançamentos continuam com o valor' : 'Remover'}
                    >
                      <X size={11} />
                    </button>
                  )}
                </span>
              ))}
            </div>
            {podeEditar && (
              <form
                className="flex gap-2 mt-3 pt-3 border-t border-slate-100"
                onSubmit={e => {
                  e.preventDefault();
                  adicionar(grupo.tipo);
                }}
              >
                <input
                  value={novos[grupo.tipo] ?? ''}
                  onChange={e => setNovos(n => ({ ...n, [grupo.tipo]: e.target.value }))}
                  placeholder="Novo item"
                  className="flex-1 px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none"
                />
                <button type="submit" className="px-2.5 py-1.5 rounded-lg text-white" style={{ background: BRAND }}>
                  <Plus size={13} />
                </button>
              </form>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function Contas() {
  const { podeAcessar } = useAuth();
  const podeEditar = podeAcessar('Gestor');
  const { dados, carregando, erro, recarregar } = useRequisicao(() => api.financeiro.contas(), []);
  const [editando, setEditando] = useState<ContaContabil | 'nova' | null>(null);

  if (carregando && !dados) return <Carregando />;
  if (erro) return <ErroCarregamento mensagem={erro} aoTentarNovamente={recarregar} />;
  if (!dados) return null;

  const atual = editando === 'nova' ? null : editando;

  return (
    <div className="space-y-4">
      {podeEditar && (
        <button
          onClick={() => setEditando('nova')}
          className="flex items-center gap-2 px-3 py-2 text-sm rounded-lg text-white font-medium"
          style={{ background: BRAND }}
        >
          <Plus size={15} /> Nova conta
        </button>
      )}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {dados.length === 0 ? (
          <EstadoVazio titulo="Nenhuma conta" descricao="Importe a aba RF MENSAL ou cadastre manualmente." />
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-slate-500 bg-slate-50/60 border-b border-slate-100">
                <th className="text-left font-medium px-4 py-3">Diretoria</th>
                <th className="text-left font-medium px-3 py-3">Grupo</th>
                <th className="text-left font-medium px-3 py-3">Centro de custo</th>
                <th className="text-left font-medium px-3 py-3">Conta</th>
                <th className="text-left font-medium px-3 py-3">Descrição</th>
              </tr>
            </thead>
            <tbody>
              {dados.map(conta => (
                <tr
                  key={conta.id}
                  onClick={podeEditar ? () => setEditando(conta) : undefined}
                  className={`border-b border-slate-50 ${podeEditar ? 'cursor-pointer hover:bg-slate-50' : ''}`}
                >
                  <td className="px-4 py-2.5 text-slate-600">{conta.diretoria ?? '—'}</td>
                  <td className="px-3 py-2.5 text-slate-600">{conta.grupo ?? '—'}</td>
                  <td className="px-3 py-2.5 font-mono text-xs">{conta.centro_custo}</td>
                  <td className="px-3 py-2.5 font-mono text-xs">{conta.conta}</td>
                  <td className="px-3 py-2.5 text-slate-700">{conta.descricao ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {editando && (
        <ModalFormulario
          titulo={atual ? 'Editar conta' : 'Nova conta'}
          campos={[
            { nome: 'diretoria', rotulo: 'Diretoria' },
            { nome: 'grupo', rotulo: 'Grupo' },
            { nome: 'centro_custo', rotulo: 'Centro de custo', obrigatorio: true },
            { nome: 'conta', rotulo: 'Conta contábil', obrigatorio: true },
            { nome: 'descricao', rotulo: 'Descrição', largo: true },
          ]}
          inicial={atual ? { ...atual } : { diretoria: 'Jurídico', grupo: 'FADM' }}
          aoFechar={() => setEditando(null)}
          aoSalvar={async valores => {
            await api.financeiro.salvarConta(valores as unknown as Omit<ContaContabil, 'id'>, atual?.id);
            setEditando(null);
            recarregar();
          }}
          aoExcluir={
            atual
              ? async () => {
                  await api.financeiro.excluirConta(atual.id);
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
