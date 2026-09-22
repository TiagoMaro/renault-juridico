import { useState } from 'react';
import { Bell, Loader2, Save, Settings2, Shield, Upload, User } from 'lucide-react';

import { api } from '../api/client';
import { Aviso } from '../components/Estados';
import { useAuth } from '../context/AuthContext';
import { dataHora } from '../utils/formato';
import {
  lerPreferencias,
  salvarPreferencias,
  TIPOS_ALERTA,
  type Preferencias,
} from '../utils/preferencias';

const BRAND = '#0035AD';

type Tab = 'perfil' | 'preferencias' | 'seguranca' | 'notificacoes' | 'importacao';

const tabs: { key: Tab; icon: React.ElementType; label: string }[] = [
  { key: 'perfil', icon: User, label: 'Perfil' },
  { key: 'preferencias', icon: Settings2, label: 'Preferências' },
  { key: 'seguranca', icon: Shield, label: 'Segurança' },
  { key: 'notificacoes', icon: Bell, label: 'Notificações' },
  { key: 'importacao', icon: Upload, label: 'Importação' },
];

export default function SettingsPage() {
  const { usuario } = useAuth();
  const [tab, setTab] = useState<Tab>('perfil');
  const [salvando, setSalvando] = useState(false);
  const [mensagem, setMensagem] = useState<{ texto: string; tom: 'sucesso' | 'erro' } | null>(null);

  const [perfil, setPerfil] = useState({ nome: usuario?.nome ?? '', cargo: usuario?.cargo ?? '' });
  const [senhas, setSenhas] = useState({ atual: '', nova: '', confirmar: '' });
  const [preferencias, setPreferencias] = useState<Preferencias>(() => lerPreferencias());

  const avisar = (texto: string, tom: 'sucesso' | 'erro') => {
    setMensagem({ texto, tom });
    setTimeout(() => setMensagem(null), 4000);
  };

  const salvar = async () => {
    setSalvando(true);
    try {
      if (tab === 'perfil') {
        await api.usuarios.atualizarProprioPerfil({ nome: perfil.nome, cargo: perfil.cargo || null });
        avisar('Perfil atualizado. A mudança aparece no próximo carregamento.', 'sucesso');
      } else if (tab === 'seguranca') {
        if (!senhas.atual || !senhas.nova) {
          avisar('Preencha a senha atual e a nova senha.', 'erro');
          return;
        }
        if (senhas.nova !== senhas.confirmar) {
          avisar('A confirmação não confere com a nova senha.', 'erro');
          return;
        }
        if (senhas.nova.length < 6) {
          avisar('A nova senha precisa ter pelo menos 6 caracteres.', 'erro');
          return;
        }
        await api.usuarios.alterarSenha(senhas.atual, senhas.nova);
        setSenhas({ atual: '', nova: '', confirmar: '' });
        avisar('Senha alterada com sucesso.', 'sucesso');
      } else {
        salvarPreferencias(preferencias);
        avisar('Preferências salvas neste navegador.', 'sucesso');
      }
    } catch (problema) {
      avisar(problema instanceof Error ? problema.message : 'Não foi possível salvar.', 'erro');
    } finally {
      setSalvando(false);
    }
  };

  const alternarAlerta = (tipo: string) =>
    setPreferencias(p => ({
      ...p,
      alertasVisiveis: p.alertasVisiveis.includes(tipo)
        ? p.alertasVisiveis.filter(t => t !== tipo)
        : [...p.alertasVisiveis, tipo],
    }));

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-slate-900 font-display">Configurações</h1>
        <p className="text-sm text-slate-500 mt-0.5">Gerencie suas preferências e configurações do sistema</p>
      </div>

      {mensagem && (
        <div className="mb-4 max-w-2xl">
          <Aviso texto={mensagem.texto} tom={mensagem.tom} />
        </div>
      )}

      <div className="flex flex-col md:flex-row gap-6">
        {/* Sidebar tabs */}
        <div className="md:w-52 flex-shrink-0">
          <nav className="flex md:block gap-1 overflow-x-auto md:space-y-0.5">
            {tabs.map(({ key, icon: Icon, label }) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors text-left whitespace-nowrap ${
                  tab === key ? 'font-medium text-white' : 'text-slate-600 hover:bg-slate-100'
                }`}
                style={tab === key ? { background: BRAND } : {}}
              >
                <Icon size={16} />
                {label}
              </button>
            ))}
          </nav>
        </div>

        {/* Content */}
        <div className="flex-1 bg-white rounded-xl border border-slate-200 overflow-hidden">
          {tab === 'perfil' && (
            <div className="p-6 space-y-6">
              <h2 className="font-semibold text-slate-900 font-display">Perfil do usuário</h2>
              <div className="flex items-center gap-4">
                <div
                  className="w-16 h-16 rounded-full flex items-center justify-center text-xl font-bold"
                  style={{ background: BRAND, color: 'white' }}
                >
                  {usuario?.iniciais ?? '--'}
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-800">{usuario?.nome}</p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {usuario?.perfil} · último acesso em {dataHora(usuario?.ultimo_acesso)}
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">Nome completo</label>
                  <input
                    value={perfil.nome}
                    onChange={e => setPerfil(p => ({ ...p, nome: e.target.value }))}
                    className={campoClass}
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">E-mail</label>
                  <input
                    value={usuario?.email ?? ''}
                    disabled
                    className={`${campoClass} bg-slate-50 text-slate-500`}
                  />
                  <p className="text-xs text-slate-400 mt-1">
                    O e-mail é o identificador de acesso e só pode ser alterado por um administrador.
                  </p>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">Cargo</label>
                  <input
                    value={perfil.cargo}
                    onChange={e => setPerfil(p => ({ ...p, cargo: e.target.value }))}
                    placeholder="Ex: Analista Jurídico"
                    className={campoClass}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">Perfil de acesso</label>
                  <input value={usuario?.perfil ?? ''} disabled className={`${campoClass} bg-slate-50 text-slate-500`} />
                </div>
              </div>
            </div>
          )}

          {tab === 'preferencias' && (
            <div className="p-6 space-y-6">
              <h2 className="font-semibold text-slate-900 font-display">Preferências do sistema</h2>
              <div className="space-y-4 max-w-xs">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">Processos por página</label>
                  <select
                    value={preferencias.itensPorPagina}
                    onChange={e =>
                      setPreferencias(p => ({ ...p, itensPorPagina: Number(e.target.value) }))
                    }
                    className={campoClass}
                  >
                    {[10, 20, 50, 100].map(n => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">Idioma</label>
                  <input value="Português (Brasil)" disabled className={`${campoClass} bg-slate-50 text-slate-500`} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">Formato de data</label>
                  <input value="DD/MM/AAAA" disabled className={`${campoClass} bg-slate-50 text-slate-500`} />
                </div>
              </div>
              <p className="text-xs text-slate-400">
                As preferências ficam salvas neste navegador e valem apenas para o seu acesso.
              </p>
            </div>
          )}

          {tab === 'seguranca' && (
            <div className="p-6 space-y-6">
              <h2 className="font-semibold text-slate-900 font-display">Segurança</h2>
              <div className="space-y-4 max-w-sm">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">Senha atual</label>
                  <input
                    type="password"
                    value={senhas.atual}
                    onChange={e => setSenhas(s => ({ ...s, atual: e.target.value }))}
                    placeholder="••••••••"
                    className={campoClass}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">Nova senha</label>
                  <input
                    type="password"
                    value={senhas.nova}
                    onChange={e => setSenhas(s => ({ ...s, nova: e.target.value }))}
                    placeholder="Mínimo de 6 caracteres"
                    className={campoClass}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">Confirmar nova senha</label>
                  <input
                    type="password"
                    value={senhas.confirmar}
                    onChange={e => setSenhas(s => ({ ...s, confirmar: e.target.value }))}
                    placeholder="••••••••"
                    className={campoClass}
                  />
                </div>
              </div>
              <div className="pt-4 border-t border-slate-100">
                <h3 className="font-medium text-slate-800 text-sm mb-2">Sessão</h3>
                <p className="text-xs text-slate-500">
                  A sessão expira automaticamente após 8 horas. Alterar a senha não encerra as sessões já abertas —
                  para isso, peça a um administrador que desative e reative o usuário.
                </p>
              </div>
            </div>
          )}

          {tab === 'notificacoes' && (
            <div className="p-6 space-y-6">
              <h2 className="font-semibold text-slate-900 font-display">Notificações</h2>
              <p className="text-sm text-slate-500">
                Escolha quais pontos de atenção aparecem no sino da barra superior.
              </p>
              <div className="space-y-1">
                {TIPOS_ALERTA.map(({ tipo, label, descricao }) => (
                  <div
                    key={tipo}
                    className="flex items-center justify-between py-3 border-b border-slate-50 last:border-0 gap-4"
                  >
                    <div>
                      <p className="text-sm font-medium text-slate-800">{label}</p>
                      <p className="text-xs text-slate-400 mt-0.5">{descricao}</p>
                    </div>
                    <Toggle
                      checked={preferencias.alertasVisiveis.includes(tipo)}
                      aoAlternar={() => alternarAlerta(tipo)}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {tab === 'importacao' && (
            <div className="p-6 space-y-6">
              <h2 className="font-semibold text-slate-900 font-display">Configurações de Importação</h2>

              <div className="space-y-4">
                <InfoLinha
                  titulo="Codificação de arquivos"
                  valor="Detectada automaticamente"
                  detalhe="O sistema tenta UTF-8 e, se falhar, Latin-1 (ISO-8859-1)."
                />
                <InfoLinha
                  titulo="Separador de CSV"
                  valor="Detectado automaticamente"
                  detalhe="Ponto e vírgula, vírgula e tabulação são reconhecidos sem configuração."
                />
                <InfoLinha
                  titulo="Formatos aceitos"
                  valor="XLSX, XLS e CSV"
                  detalhe="Tamanho máximo de 25 MB por arquivo."
                />
                <InfoLinha
                  titulo="Linhas com problema"
                  valor="Registradas como inconsistência"
                  detalhe="Linhas sem número de autos ou sem parte são descartadas; as demais entram com aviso."
                />
                <InfoLinha
                  titulo="Processo já existente"
                  valor="Atualizado, nunca duplicado"
                  detalhe="A chave é o número dos autos; mudanças de valor viram histórico no processo."
                />
              </div>

              <div className="p-4 rounded-xl border border-slate-200 bg-slate-50">
                <h3 className="text-sm font-medium text-slate-800 mb-2">Faixas de risco</h3>
                <p className="text-xs text-slate-500 leading-relaxed">
                  A classificação é calculada a partir do valor do risco (Crítico ≥ R$ 1 mi · Alto ≥ R$ 300 mil ·
                  Médio ≥ R$ 50 mil). Processos ativos sem defesa registrada sobem uma faixa. Os limites ficam em{' '}
                  <code className="px-1 py-0.5 bg-white rounded border border-slate-200 text-[11px]">
                    backend/app/core/config.py
                  </code>
                  .
                </p>
              </div>
            </div>
          )}

          {/* Save button */}
          <div className="px-6 py-4 border-t border-slate-100 flex justify-end">
            <button
              onClick={salvar}
              disabled={salvando}
              className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium text-white hover:opacity-90 transition-all disabled:opacity-60"
              style={{ background: BRAND }}
            >
              {salvando ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
              {tab === 'importacao' ? 'Fechar' : 'Salvar alterações'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function InfoLinha({ titulo, valor, detalhe }: { titulo: string; valor: string; detalhe: string }) {
  return (
    <div className="flex items-start justify-between gap-4 py-3 border-b border-slate-50 last:border-0">
      <div>
        <p className="text-sm font-medium text-slate-800">{titulo}</p>
        <p className="text-xs text-slate-400 mt-0.5">{detalhe}</p>
      </div>
      <span className="text-xs font-medium text-slate-600 whitespace-nowrap bg-slate-50 px-2 py-1 rounded-lg">
        {valor}
      </span>
    </div>
  );
}

function Toggle({ checked, aoAlternar }: { checked: boolean; aoAlternar: () => void }) {
  return (
    <button
      onClick={aoAlternar}
      className={`relative w-10 h-5 rounded-full transition-colors flex-shrink-0 ${checked ? '' : 'bg-slate-200'}`}
      style={checked ? { background: BRAND } : {}}
    >
      <span
        className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
          checked ? 'translate-x-5' : 'translate-x-0.5'
        }`}
      />
    </button>
  );
}

const campoClass =
  'w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:border-transparent bg-white';
