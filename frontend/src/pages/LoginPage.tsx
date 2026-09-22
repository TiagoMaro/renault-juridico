import { useState } from 'react';
import { AlertCircle, BarChart3, Eye, EyeOff, Scale, Shield, TrendingUp } from 'lucide-react';

import { useAuth } from '../context/AuthContext';

interface LoginPageProps {
  onRegister: () => void;
}

export default function LoginPage({ onRegister }: LoginPageProps) {
  const { entrar } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) {
      setErro('Informe e-mail e senha.');
      return;
    }

    setErro(null);
    setLoading(true);
    try {
      await entrar(email.trim().toLowerCase(), password);
    } catch (problema) {
      setErro(problema instanceof Error ? problema.message : 'Não foi possível entrar.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex">
      {/* Left — Form */}
      <div className="flex-1 flex flex-col justify-center px-8 py-12 bg-white max-w-xl">
        <div className="max-w-sm mx-auto w-full">
          {/* Brand */}
          <div className="flex items-center gap-3 mb-10">
            <div
              className="w-10 h-10 rounded-lg flex items-center justify-center font-bold text-sm"
              style={{ background: '#0035AD', color: 'white' }}
            >
              RG
            </div>
            <div>
              <div className="font-semibold text-slate-900 text-base leading-tight font-display">Renault Geely</div>
              <div className="text-xs text-slate-500 leading-tight">Brasil</div>
            </div>
          </div>

          <h1 className="text-2xl font-bold text-slate-900 mb-1 font-display">Gestão Jurídica</h1>
          <p className="text-slate-500 text-sm mb-8">
            Central de inteligência e acompanhamento de processos
          </p>

          <form onSubmit={handleLogin} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">E-mail corporativo</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                autoComplete="username"
                placeholder="seu@renaultgeely.com.br"
                className="w-full px-4 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:border-transparent bg-white transition-all"
                style={{ '--tw-ring-color': '#0035AD' } as React.CSSProperties}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Senha</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  autoComplete="current-password"
                  placeholder="••••••••"
                  className="w-full px-4 py-2.5 pr-11 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:border-transparent bg-white transition-all"
                  style={{ '--tw-ring-color': '#0035AD' } as React.CSSProperties}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(s => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {erro && (
              <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg border border-red-200 bg-red-50 text-sm text-red-700">
                <AlertCircle size={15} className="flex-shrink-0 mt-0.5" />
                <span>{erro}</span>
              </div>
            )}

            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={e => setRemember(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-300"
                  style={{ accentColor: '#0035AD' }}
                />
                <span className="text-sm text-slate-600">Lembrar acesso</span>
              </label>
              <button
                type="button"
                onClick={() => setErro('Recuperação de senha: solicite ao administrador do sistema.')}
                className="text-sm font-medium transition-colors hover:underline"
                style={{ color: '#0035AD' }}
              >
                Esqueci minha senha
              </button>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 rounded-lg font-medium text-sm text-white transition-all hover:opacity-90 active:scale-[0.99] disabled:opacity-60"
              style={{ background: '#0035AD' }}
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Entrando...
                </span>
              ) : (
                'Entrar'
              )}
            </button>
          </form>

          <div className="mt-6 text-center">
            <span className="text-sm text-slate-500">Não tem uma conta? </span>
            <button
              onClick={onRegister}
              className="text-sm font-medium transition-colors hover:underline"
              style={{ color: '#0035AD' }}
            >
              Criar uma conta
            </button>
          </div>

          <p className="text-xs text-slate-400 text-center mt-8">
            Acesso restrito a colaboradores autorizados da Renault Geely do Brasil.
          </p>
        </div>
      </div>

      {/* Right — Visual */}
      <div
        className="hidden lg:flex flex-1 flex-col justify-between p-12 relative overflow-hidden"
        style={{ background: '#0D1B3E' }}
      >
        <svg className="absolute inset-0 w-full h-full opacity-10" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
              <path d="M 40 0 L 0 0 0 40" fill="none" stroke="white" strokeWidth="0.5" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid)" />
        </svg>

        <div
          className="absolute top-1/3 right-1/4 w-72 h-72 rounded-full opacity-10 blur-3xl"
          style={{ background: '#0035AD' }}
        />

        <div className="relative z-10">
          <div
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium mb-8"
            style={{ background: 'rgba(0,53,173,0.4)', color: '#7BA3D4' }}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-green-400" />
            Sistema operacional
          </div>

          <h2 className="text-3xl font-bold text-white mb-4 font-display leading-snug">
            Inteligência jurídica
            <br />
            em tempo real
          </h2>
          <p className="text-slate-400 text-sm leading-relaxed max-w-xs">
            Consolide processos de múltiplos escritórios, analise exposição financeira e tome decisões
            baseadas em dados.
          </p>
        </div>

        {/* Capacidades do sistema */}
        <div className="relative z-10 space-y-3">
          {[
            {
              icon: Scale,
              titulo: 'Base única de processos',
              texto: 'Todos os escritórios em um só lugar',
              color: '#4D8FFF',
            },
            {
              icon: TrendingUp,
              titulo: 'Importação inteligente',
              texto: 'Planilhas lidas e padronizadas automaticamente',
              color: '#16A34A',
            },
            {
              icon: Shield,
              titulo: 'Gestão de risco',
              texto: 'Exposição financeira classificada por faixa',
              color: '#EA580C',
            },
            {
              icon: BarChart3,
              titulo: 'Relatórios executivos',
              texto: 'Exportação em Excel e PDF',
              color: '#A855F7',
            },
          ].map(({ icon: Icon, titulo, texto, color }) => (
            <div
              key={titulo}
              className="flex items-center gap-4 p-4 rounded-xl border"
              style={{ background: 'rgba(255,255,255,0.04)', borderColor: 'rgba(255,255,255,0.08)' }}
            >
              <div
                className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
                style={{ background: `${color}20` }}
              >
                <Icon size={18} style={{ color }} />
              </div>
              <div>
                <div className="text-white font-semibold text-sm font-display">{titulo}</div>
                <div className="text-xs" style={{ color: '#7BA3D4' }}>
                  {texto}
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="relative z-10 flex items-center gap-2">
          <div
            className="w-6 h-6 rounded flex items-center justify-center text-xs font-bold flex-shrink-0"
            style={{ background: '#0035AD', color: 'white' }}
          >
            RG
          </div>
          <span className="text-xs" style={{ color: '#4A6FA5' }}>
            Renault Geely do Brasil · Sistema de Gestão Jurídica
          </span>
        </div>
      </div>
    </div>
  );
}
