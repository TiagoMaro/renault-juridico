import { useState } from 'react';
import { AlertCircle, Edit2, Loader2, Plus, Search, ToggleLeft, ToggleRight } from 'lucide-react';

import { api } from '../api/client';
import type { PerfilAcesso, Usuario } from '../api/types';
import { Carregando, ErroCarregamento } from '../components/Estados';
import { useAuth } from '../context/AuthContext';
import { useRequisicao } from '../hooks/useRequisicao';
import { data as formatarData, dataHora } from '../utils/formato';

const BRAND = '#0035AD';
const PERFIS: PerfilAcesso[] = ['Visualizador', 'Analista', 'Gestor', 'Administrador'];

export default function UsersPage() {
  const { podeAcessar, usuario: usuarioLogado } = useAuth();
  const ehAdmin = podeAcessar('Administrador');

  const [search, setSearch] = useState('');
  const [modalAberto, setModalAberto] = useState(false);
  const [emEdicao, setEmEdicao] = useState<Usuario | null>(null);
  const [alternando, setAlternando] = useState<number | null>(null);
  const [erroAcao, setErroAcao] = useState<string | null>(null);

  const { dados, carregando, erro, recarregar } = useRequisicao(() => api.usuarios.listar(), []);
  const usuarios = dados ?? [];

  const filtrados = usuarios.filter(
    u =>
      u.nome.toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase()),
  );

  const alternarStatus = async (id: number) => {
    setErroAcao(null);
    setAlternando(id);
    try {
      await api.usuarios.alternarStatus(id);
      recarregar();
    } catch (problema) {
      setErroAcao(problema instanceof Error ? problema.message : 'Não foi possível alterar o status.');
    } finally {
      setAlternando(null);
    }
  };

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 font-display">Usuários</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {carregando
              ? 'Carregando...'
              : `${usuarios.filter(u => u.status === 'Ativo').length} usuário(s) ativo(s)`}
          </p>
        </div>
        {ehAdmin && (
          <button
            onClick={() => {
              setEmEdicao(null);
              setModalAberto(true);
            }}
            className="flex items-center gap-2 px-4 py-2 text-sm rounded-lg text-white hover:opacity-90 transition-colors"
            style={{ background: BRAND }}
          >
            <Plus size={15} /> Adicionar usuário
          </button>
        )}
      </div>

      {erroAcao && (
        <div className="flex items-start gap-2 px-4 py-3 rounded-lg border border-red-200 bg-red-50 text-sm text-red-700">
          <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
          <span>{erroAcao}</span>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Total', value: usuarios.length, color: '#0035AD' },
          { label: 'Ativos', value: usuarios.filter(u => u.status === 'Ativo').length, color: '#16A34A' },
          { label: 'Inativos', value: usuarios.filter(u => u.status === 'Inativo').length, color: '#94A3B8' },
          {
            label: 'Administradores',
            value: usuarios.filter(u => u.perfil === 'Administrador').length,
            color: '#7C3AED',
          },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-white rounded-xl border border-slate-200 p-4 text-center">
            <p className="text-2xl font-bold font-display" style={{ color }}>
              {value}
            </p>
            <p className="text-xs text-slate-500 mt-1">{label}</p>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-3">
          <div className="relative flex-1 max-w-xs">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar por nome ou e-mail..."
              className="w-full pl-8 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:border-transparent bg-white"
              style={{ '--tw-ring-color': BRAND } as React.CSSProperties}
            />
          </div>
        </div>

        {erro ? (
          <ErroCarregamento mensagem={erro} aoTentarNovamente={recarregar} />
        ) : carregando ? (
          <Carregando />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/60">
                  {['Usuário', 'E-mail', 'Perfil', 'Status', 'Último acesso', 'Cadastro', 'Ações'].map(h => (
                    <th
                      key={h}
                      className="text-left text-xs font-medium text-slate-500 px-5 py-3 whitespace-nowrap"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtrados.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center py-12 text-slate-400 text-sm">
                      Nenhum usuário encontrado.
                    </td>
                  </tr>
                ) : (
                  filtrados.map(u => (
                    <tr key={u.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50 transition-colors">
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-3">
                          <div
                            className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                            style={{
                              background: u.status === 'Ativo' ? BRAND : '#E2E8F0',
                              color: u.status === 'Ativo' ? 'white' : '#94A3B8',
                            }}
                          >
                            {u.iniciais}
                          </div>
                          <div>
                            <span className="font-medium text-slate-800 text-sm block">{u.nome}</span>
                            {u.cargo && <span className="text-xs text-slate-400">{u.cargo}</span>}
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-3.5 text-slate-600 text-sm">{u.email}</td>
                      <td className="px-5 py-3.5">
                        <PerfilBadge perfil={u.perfil} />
                      </td>
                      <td className="px-5 py-3.5">
                        <span
                          className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                            u.status === 'Ativo' ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'
                          }`}
                        >
                          {u.status}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-xs text-slate-500 whitespace-nowrap">
                        {u.ultimo_acesso ? dataHora(u.ultimo_acesso) : 'Nunca acessou'}
                      </td>
                      <td className="px-5 py-3.5 text-xs text-slate-500 whitespace-nowrap">
                        {formatarData(u.data_cadastro)}
                      </td>
                      <td className="px-5 py-3.5">
                        {ehAdmin && (
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => {
                                setEmEdicao(u);
                                setModalAberto(true);
                              }}
                              className="text-slate-400 hover:text-slate-700 transition-colors"
                              title="Editar"
                            >
                              <Edit2 size={15} />
                            </button>
                            <button
                              onClick={() => alternarStatus(u.id)}
                              disabled={alternando === u.id || u.id === usuarioLogado?.id}
                              className={`transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                                u.status === 'Ativo'
                                  ? 'text-green-500 hover:text-red-500'
                                  : 'text-slate-400 hover:text-green-500'
                              }`}
                              title={
                                u.id === usuarioLogado?.id
                                  ? 'Você não pode desativar seu próprio usuário'
                                  : u.status === 'Ativo'
                                    ? 'Desativar'
                                    : 'Ativar'
                              }
                            >
                              {alternando === u.id ? (
                                <Loader2 size={16} className="animate-spin" />
                              ) : u.status === 'Ativo' ? (
                                <ToggleRight size={18} />
                              ) : (
                                <ToggleLeft size={18} />
                              )}
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modalAberto && (
        <ModalUsuario
          usuario={emEdicao}
          aoFechar={() => setModalAberto(false)}
          aoSalvar={() => {
            setModalAberto(false);
            recarregar();
          }}
        />
      )}
    </div>
  );
}

function ModalUsuario({
  usuario,
  aoFechar,
  aoSalvar,
}: {
  usuario: Usuario | null;
  aoFechar: () => void;
  aoSalvar: () => void;
}) {
  const edicao = usuario !== null;
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [form, setForm] = useState({
    nome: usuario?.nome ?? '',
    email: usuario?.email ?? '',
    cargo: usuario?.cargo ?? '',
    perfil: (usuario?.perfil ?? 'Visualizador') as PerfilAcesso,
    senha: '',
  });

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro(null);
    setSalvando(true);
    try {
      if (edicao && usuario) {
        await api.usuarios.atualizar(usuario.id, {
          nome: form.nome,
          cargo: form.cargo || null,
          perfil: form.perfil,
          ...(form.senha ? { senha: form.senha } : {}),
        });
      } else {
        await api.usuarios.criar({
          nome: form.nome,
          email: form.email.toLowerCase(),
          cargo: form.cargo || null,
          perfil: form.perfil,
          senha: form.senha,
        });
      }
      aoSalvar();
    } catch (problema) {
      setErro(problema instanceof Error ? problema.message : 'Não foi possível salvar.');
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <form onSubmit={enviar} className="bg-white rounded-2xl border border-slate-200 shadow-xl w-full max-w-md">
        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between">
          <h3 className="font-bold text-slate-900 font-display">
            {edicao ? 'Editar usuário' : 'Adicionar usuário'}
          </h3>
          <button type="button" onClick={aoFechar} className="text-slate-400 hover:text-slate-600">
            ✕
          </button>
        </div>
        <div className="px-6 py-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">Nome completo</label>
            <input
              value={form.nome}
              onChange={e => setForm(f => ({ ...f, nome: e.target.value }))}
              required
              minLength={3}
              placeholder="Nome e sobrenome"
              className={inputClass}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">E-mail corporativo</label>
            <input
              type="email"
              value={form.email}
              onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
              required
              disabled={edicao}
              placeholder="nome@renaultgeely.com.br"
              className={`${inputClass} disabled:bg-slate-50 disabled:text-slate-500`}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">Cargo</label>
            <input
              value={form.cargo}
              onChange={e => setForm(f => ({ ...f, cargo: e.target.value }))}
              placeholder="Ex: Analista Jurídico"
              className={inputClass}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">Perfil de acesso</label>
            <select
              value={form.perfil}
              onChange={e => setForm(f => ({ ...f, perfil: e.target.value as PerfilAcesso }))}
              className={inputClass}
            >
              {PERFIS.map(p => (
                <option key={p}>{p}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">
              {edicao ? 'Nova senha (deixe em branco para manter)' : 'Senha inicial'}
            </label>
            <input
              type="password"
              value={form.senha}
              onChange={e => setForm(f => ({ ...f, senha: e.target.value }))}
              required={!edicao}
              minLength={edicao ? 0 : 6}
              placeholder="••••••••"
              className={inputClass}
            />
          </div>

          {erro && (
            <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg border border-red-200 bg-red-50 text-sm text-red-700">
              <AlertCircle size={15} className="flex-shrink-0 mt-0.5" />
              <span>{erro}</span>
            </div>
          )}
        </div>
        <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-3">
          <button
            type="button"
            onClick={aoFechar}
            className="px-4 py-2 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={salvando}
            className="flex items-center gap-2 px-4 py-2 text-sm text-white rounded-lg hover:opacity-90 transition-colors disabled:opacity-60"
            style={{ background: BRAND }}
          >
            {salvando && <Loader2 size={14} className="animate-spin" />}
            {edicao ? 'Salvar' : 'Criar usuário'}
          </button>
        </div>
      </form>
    </div>
  );
}

function PerfilBadge({ perfil }: { perfil: PerfilAcesso }) {
  const colors: Record<PerfilAcesso, string> = {
    Administrador: 'bg-purple-100 text-purple-700',
    Gestor: 'bg-blue-100 text-blue-700',
    Analista: 'bg-cyan-100 text-cyan-700',
    Visualizador: 'bg-slate-100 text-slate-600',
  };
  return <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${colors[perfil]}`}>{perfil}</span>;
}

const inputClass =
  'w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:border-transparent bg-white';
