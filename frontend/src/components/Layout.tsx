import { useEffect, useState } from 'react';
import {
  ArrowDownLeft,
  BarChart3,
  Bell,
  ChevronDown,
  ChevronRight,
  FileBarChart,
  History,
  LayoutDashboard,
  LogOut,
  Menu,
  PiggyBank,
  PieChart,
  Receipt,
  Table2,
  ListChecks,
  Wallet,
  Scale,
  Search,
  Settings,
  Upload,
  Users,
  X,
} from 'lucide-react';

import { api } from '../api/client';
import type { PerfilAcesso } from '../api/types';
import { useAuth } from '../context/AuthContext';
import { useRequisicao } from '../hooks/useRequisicao';
import type { NavigateFn, Page } from '../types';
import { EVENTO_PREFERENCIAS, lerPreferencias, type Preferencias } from '../utils/preferencias';

interface ItemNav {
  icon: React.ElementType;
  label: string;
  page: Page;
  perfilMinimo?: PerfilAcesso;
}

interface GrupoNav {
  titulo: string;
  itens: ItemNav[];
}

// O menu tem dois módulos: a gestão de processos e o controle de pagamentos.
const grupos: GrupoNav[] = [
  {
    titulo: 'Jurídico',
    itens: [
      { icon: LayoutDashboard, label: 'Dashboard', page: 'dashboard' },
      { icon: Scale, label: 'Processos', page: 'processes' },
      { icon: Upload, label: 'Importação', page: 'import', perfilMinimo: 'Analista' },
      { icon: BarChart3, label: 'Análises', page: 'analytics' },
      { icon: FileBarChart, label: 'Relatórios', page: 'reports' },
    ],
  },
  {
    titulo: 'Financeiro',
    itens: [
      { icon: PiggyBank, label: 'Dashboard', page: 'fin-dashboard' },
      { icon: Receipt, label: 'Lançamentos', page: 'fin-lancamentos' },
      { icon: BarChart3, label: 'Orçamento (RAP)', page: 'fin-orcamento' },
      { icon: Table2, label: 'Resultado', page: 'fin-resultado' },
      { icon: PieChart, label: 'Análise por EDOA', page: 'fin-analise' },
      { icon: Wallet, label: 'Adiantamentos', page: 'fin-adiantamentos' },
      { icon: ArrowDownLeft, label: 'Devoluções', page: 'fin-devolucoes' },
      { icon: ListChecks, label: 'Cadastros', page: 'fin-cadastros' },
      { icon: Upload, label: 'Importar pagamentos', page: 'fin-import', perfilMinimo: 'Analista' },
    ],
  },
  {
    titulo: 'Administração',
    itens: [
      { icon: History, label: 'Hist. de Importações', page: 'import-history' },
      { icon: Users, label: 'Usuários', page: 'users', perfilMinimo: 'Gestor' },
      { icon: Settings, label: 'Configurações', page: 'settings' },
    ],
  },
];

const pageTitles: Record<Page, string[]> = {
  dashboard: ['Dashboard'],
  processes: ['Processos'],
  'process-detail': ['Processos', 'Detalhes do Processo'],
  import: ['Importação', 'Importar Planilha'],
  'import-history': ['Importação', 'Histórico'],
  analytics: ['Análises'],
  reports: ['Relatórios'],
  users: ['Usuários'],
  settings: ['Configurações'],
  'fin-dashboard': ['Financeiro', 'Dashboard'],
  'fin-lancamentos': ['Financeiro', 'Lançamentos'],
  'fin-orcamento': ['Financeiro', 'Orçamento × Realizado'],
  'fin-resultado': ['Financeiro', 'Resultado'],
  'fin-analise': ['Financeiro', 'Análise por EDOA'],
  'fin-cadastros': ['Financeiro', 'Cadastros'],
  'fin-adiantamentos': ['Financeiro', 'Adiantamentos'],
  'fin-devolucoes': ['Financeiro', 'Devoluções'],
  'fin-import': ['Financeiro', 'Importar pagamentos'],
};

const CORES_SEVERIDADE: Record<string, string> = {
  critico: 'bg-red-500',
  alerta: 'bg-amber-500',
  info: 'bg-green-500',
};

interface LayoutProps {
  currentPage: Page;
  navigate: NavigateFn;
  onLogout: () => void;
  children: React.ReactNode;
}

export default function Layout({ currentPage, navigate, onLogout, children }: LayoutProps) {
  const { usuario, podeAcessar } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [notifOpen, setNotifOpen] = useState(false);
  const [busca, setBusca] = useState('');

  // Notificações = pontos de atenção calculados pelo backend, filtrados pelas
  // preferências do usuário (tela de Configurações → Notificações).
  const { dados: dashboard } = useRequisicao(() => api.dashboard.obter(), []);
  const [preferencias, setPreferencias] = useState(() => lerPreferencias());

  useEffect(() => {
    const aoMudar = (evento: Event) => setPreferencias((evento as CustomEvent<Preferencias>).detail);
    window.addEventListener(EVENTO_PREFERENCIAS, aoMudar);
    return () => window.removeEventListener(EVENTO_PREFERENCIAS, aoMudar);
  }, []);

  const alertas = (dashboard?.pontos_atencao ?? []).filter(alerta =>
    preferencias.alertasVisiveis.includes(alerta.tipo),
  );

  const breadcrumb = pageTitles[currentPage] || ['Dashboard'];
  const gruposVisiveis = grupos
    .map(grupo => ({
      ...grupo,
      itens: grupo.itens.filter(item => !item.perfilMinimo || podeAcessar(item.perfilMinimo)),
    }))
    .filter(grupo => grupo.itens.length > 0);

  const buscar = (e: React.FormEvent) => {
    e.preventDefault();
    if (!busca.trim()) return;
    navigate('processes');
    // A tela de processos lê o termo pendente e já aplica o filtro.
    window.sessionStorage.setItem('busca_pendente', busca.trim());
    window.dispatchEvent(new CustomEvent('renault:busca', { detail: busca.trim() }));
    setBusca('');
  };

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      {/* Sidebar */}
      <aside
        className={`flex flex-col flex-shrink-0 transition-all duration-300 ${sidebarOpen ? 'w-64' : 'w-16'}`}
        style={{ background: '#0D1B3E' }}
      >
        {/* Logo */}
        <div className="flex items-center gap-3 px-4 py-5 border-b border-white/10">
          <div
            className="w-9 h-9 flex-shrink-0 rounded-lg flex items-center justify-center font-bold text-sm"
            style={{ background: '#0035AD', color: 'white' }}
          >
            RG
          </div>
          {sidebarOpen && (
            <div className="overflow-hidden">
              <div className="text-white font-semibold text-sm leading-tight font-display">Renault Geely</div>
              <div className="text-xs leading-tight" style={{ color: '#7BA3D4' }}>
                Gestão Jurídica
              </div>
            </div>
          )}
        </div>

        {/* Nav */}
        <nav className="flex-1 px-2 py-4 space-y-4 overflow-y-auto">
          {gruposVisiveis.map(grupo => (
            <div key={grupo.titulo} className="space-y-0.5">
              {sidebarOpen && (
                <p
                  className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider"
                  style={{ color: '#4A6FA5' }}
                >
                  {grupo.titulo}
                </p>
              )}
              {grupo.itens.map(({ icon: Icon, label, page }) => {
                const active =
                  currentPage === page || (page === 'processes' && currentPage === 'process-detail');
                return (
                  <button
                    key={page}
                    onClick={() => navigate(page)}
                    title={!sidebarOpen ? `${grupo.titulo} · ${label}` : undefined}
                    className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all group relative ${
                      active ? 'text-white font-medium' : 'text-slate-400 hover:text-white hover:bg-white/5'
                    }`}
                    style={active ? { background: 'rgba(0,53,173,0.5)' } : {}}
                  >
                    {active && (
                      <span
                        className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 rounded-r-full"
                        style={{ background: '#4D8FFF' }}
                      />
                    )}
                    <Icon size={17} className="flex-shrink-0" />
                    {sidebarOpen && <span className="truncate">{label}</span>}
                  </button>
                );
              })}
            </div>
          ))}
        </nav>

        {/* User footer */}
        <div className="px-2 pb-4 border-t border-white/10 pt-4">
          {sidebarOpen ? (
            <div className="flex items-center gap-3 px-3 py-2 rounded-lg">
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                style={{ background: '#0035AD', color: 'white' }}
              >
                {usuario?.iniciais ?? '--'}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-white text-sm font-medium truncate">{usuario?.nome ?? 'Usuário'}</div>
                <div className="text-xs truncate" style={{ color: '#7BA3D4' }}>
                  {usuario?.perfil ?? '—'}
                </div>
              </div>
              <button
                onClick={onLogout}
                className="text-slate-400 hover:text-white transition-colors flex-shrink-0"
                title="Sair"
              >
                <LogOut size={16} />
              </button>
            </div>
          ) : (
            <button
              onClick={onLogout}
              className="w-full flex items-center justify-center py-2 text-slate-400 hover:text-white transition-colors"
              title="Sair"
            >
              <LogOut size={18} />
            </button>
          )}
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Topbar */}
        <header className="h-16 bg-white border-b border-slate-200 flex items-center px-6 gap-4 flex-shrink-0">
          <button
            onClick={() => setSidebarOpen(s => !s)}
            className="text-slate-500 hover:text-slate-800 transition-colors"
            title={sidebarOpen ? 'Recolher menu' : 'Expandir menu'}
          >
            <Menu size={20} />
          </button>

          {/* Breadcrumb */}
          <nav className="flex items-center gap-1.5 text-sm flex-1">
            <span className="text-slate-400 text-xs">Renault Geely</span>
            {breadcrumb.map((crumb, i) => (
              <span key={i} className="flex items-center gap-1.5">
                <ChevronRight size={14} className="text-slate-300" />
                <span className={i === breadcrumb.length - 1 ? 'text-slate-800 font-medium' : 'text-slate-500'}>
                  {crumb}
                </span>
              </span>
            ))}
          </nav>

          {/* Search */}
          <form onSubmit={buscar} className="relative hidden md:flex items-center">
            <Search size={15} className="absolute left-3 text-slate-400" />
            <input
              type="text"
              value={busca}
              onChange={e => setBusca(e.target.value)}
              placeholder="Buscar processos..."
              className="pl-9 pr-4 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg w-64 focus:outline-none focus:ring-2 focus:border-transparent transition-all"
              style={{ '--tw-ring-color': '#0035AD' } as React.CSSProperties}
            />
          </form>

          {/* Notifications */}
          <div className="relative">
            <button
              onClick={() => setNotifOpen(o => !o)}
              className="relative w-9 h-9 flex items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:text-slate-800 hover:bg-slate-50 transition-colors"
            >
              <Bell size={18} />
              {alertas.length > 0 && (
                <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-red-500" />
              )}
            </button>
            {notifOpen && (
              <div className="absolute right-0 top-11 w-80 bg-white rounded-xl border border-slate-200 shadow-xl z-50">
                <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
                  <span className="font-semibold text-slate-800 text-sm">Pontos de atenção</span>
                  <button onClick={() => setNotifOpen(false)}>
                    <X size={14} className="text-slate-400" />
                  </button>
                </div>
                {alertas.length === 0 ? (
                  <p className="px-4 py-6 text-sm text-slate-400 text-center">Nenhum alerta no momento.</p>
                ) : (
                  alertas.map((alerta, i) => (
                    <button
                      key={i}
                      onClick={() => {
                        setNotifOpen(false);
                        navigate('dashboard');
                      }}
                      className="w-full text-left flex items-start gap-3 px-4 py-3 hover:bg-slate-50 border-b border-slate-50 last:border-0"
                    >
                      <span
                        className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${
                          CORES_SEVERIDADE[alerta.severidade] ?? 'bg-slate-400'
                        }`}
                      />
                      <p className="text-sm text-slate-700 flex-1">{alerta.texto}</p>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>

          {/* Avatar */}
          <button
            onClick={() => navigate('settings')}
            className="flex items-center gap-2 text-sm text-slate-700 hover:text-slate-900 transition-colors"
          >
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold"
              style={{ background: '#0035AD', color: 'white' }}
            >
              {usuario?.iniciais ?? '--'}
            </div>
            <span className="hidden md:block font-medium">{usuario?.nome ?? 'Usuário'}</span>
            <ChevronDown size={14} className="text-slate-400" />
          </button>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
