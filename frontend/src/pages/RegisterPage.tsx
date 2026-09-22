import { useState } from 'react';
import { AlertCircle, ArrowLeft, Eye, EyeOff } from 'lucide-react';

import { useAuth } from '../context/AuthContext';

interface RegisterPageProps {
  onBack: () => void;
}

export default function RegisterPage({ onBack }: RegisterPageProps) {
  const { registrar } = useAuth();
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [form, setForm] = useState({
    nome: '',
    email: '',
    senha: '',
    confirmar: '',
    cargo: '',
    perfil: '',
  });

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro(null);

    if (form.senha !== form.confirmar) {
      setErro('As senhas não conferem.');
      return;
    }
    if (form.senha.length < 6) {
      setErro('A senha precisa ter pelo menos 6 caracteres.');
      return;
    }

    setLoading(true);
    try {
      // O backend rebaixa automaticamente pedidos de perfil Administrador —
      // esse perfil só é concedido por um administrador já existente.
      await registrar({
        nome: form.nome.trim(),
        email: form.email.trim().toLowerCase(),
        senha: form.senha,
        cargo: form.cargo.trim() || undefined,
        perfil: form.perfil || 'Visualizador',
      });
      // O AuthProvider já autentica: o App troca para o dashboard sozinho.
    } catch (problema) {
      setErro(problema instanceof Error ? problema.message : 'Não foi possível criar a conta.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          {/* Header */}
          <div className="px-8 pt-8 pb-6 border-b border-slate-100">
            <button
              onClick={onBack}
              className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 transition-colors mb-6"
            >
              <ArrowLeft size={16} />
              Voltar ao login
            </button>
            <div className="flex items-center gap-3 mb-4">
              <div
                className="w-9 h-9 rounded-lg flex items-center justify-center font-bold text-sm"
                style={{ background: '#0035AD', color: 'white' }}
              >
                RG
              </div>
              <div>
                <div className="font-semibold text-slate-900 text-sm font-display">Renault Geely</div>
                <div className="text-xs text-slate-500">Gestão Jurídica</div>
              </div>
            </div>
            <h1 className="text-xl font-bold text-slate-900 font-display">Criar conta</h1>
            <p className="text-sm text-slate-500 mt-1">Preencha os dados para solicitar acesso ao sistema.</p>
          </div>

          <form onSubmit={handleSubmit} className="px-8 py-6 space-y-4">
            <div className="grid grid-cols-1 gap-4">
              <Field label="Nome completo">
                <input
                  type="text"
                  value={form.nome}
                  onChange={set('nome')}
                  placeholder="Nome e sobrenome"
                  required
                  minLength={3}
                  className={inputClass}
                />
              </Field>

              <Field label="E-mail corporativo">
                <input
                  type="email"
                  value={form.email}
                  onChange={set('email')}
                  placeholder="nome@renaultgeely.com.br"
                  required
                  className={inputClass}
                />
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Senha">
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={form.senha}
                      onChange={set('senha')}
                      placeholder="••••••••"
                      required
                      minLength={6}
                      className={`${inputClass} pr-10`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(s => !s)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    >
                      {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                </Field>
                <Field label="Confirmar senha">
                  <div className="relative">
                    <input
                      type={showConfirm ? 'text' : 'password'}
                      value={form.confirmar}
                      onChange={set('confirmar')}
                      placeholder="••••••••"
                      required
                      minLength={6}
                      className={`${inputClass} pr-10`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirm(s => !s)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    >
                      {showConfirm ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                </Field>
              </div>

              <Field label="Cargo">
                <input
                  type="text"
                  value={form.cargo}
                  onChange={set('cargo')}
                  placeholder="Ex: Analista Jurídico"
                  className={inputClass}
                />
              </Field>

              <Field label="Perfil de acesso">
                <select value={form.perfil} onChange={set('perfil')} required className={inputClass}>
                  <option value="">Selecionar perfil</option>
                  <option value="Gestor">Gestor</option>
                  <option value="Analista">Analista</option>
                  <option value="Visualizador">Visualizador</option>
                </select>
                <p className="text-xs text-slate-400 mt-1.5">
                  O perfil de Administrador é concedido apenas por um administrador do sistema.
                </p>
              </Field>
            </div>

            {erro && (
              <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg border border-red-200 bg-red-50 text-sm text-red-700">
                <AlertCircle size={15} className="flex-shrink-0 mt-0.5" />
                <span>{erro}</span>
              </div>
            )}

            <div className="pt-2">
              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 rounded-lg font-medium text-sm text-white transition-all hover:opacity-90 active:scale-[0.99] disabled:opacity-60"
                style={{ background: '#0035AD' }}
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Criando conta...
                  </span>
                ) : (
                  'Criar conta'
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700 mb-1.5">{label}</label>
      {children}
    </div>
  );
}

const inputClass =
  'w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 bg-white transition-all';
