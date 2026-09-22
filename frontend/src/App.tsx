import { useState } from 'react';
import { Loader2 } from 'lucide-react';

import { AuthProvider, useAuth } from './context/AuthContext';
import Layout from './components/Layout';
import type { Page } from './types';
import AdiantamentosPage from './pages/AdiantamentosPage';
import AnalisePage from './pages/AnalisePage';
import AnalyticsPage from './pages/AnalyticsPage';
import CadastrosFinanceirosPage from './pages/CadastrosFinanceirosPage';
import DashboardPage from './pages/DashboardPage';
import DevolucoesPage from './pages/DevolucoesPage';
import FinanceDashboardPage from './pages/FinanceDashboardPage';
import FinanceImportPage from './pages/FinanceImportPage';
import ImportHistoryPage from './pages/ImportHistoryPage';
import ImportPage from './pages/ImportPage';
import LancamentosPage from './pages/LancamentosPage';
import OrcamentoPage from './pages/OrcamentoPage';
import ResultadoPage from './pages/ResultadoPage';
import LoginPage from './pages/LoginPage';
import ProcessDetailPage from './pages/ProcessDetailPage';
import ProcessesPage from './pages/ProcessesPage';
import RegisterPage from './pages/RegisterPage';
import ReportsPage from './pages/ReportsPage';
import SettingsPage from './pages/SettingsPage';
import UsersPage from './pages/UsersPage';

function Sistema() {
  const { autenticado, carregando, sair } = useAuth();
  const [currentPage, setCurrentPage] = useState<Page>('dashboard');
  const [authPage, setAuthPage] = useState<'login' | 'register'>('login');
  const [selectedProcessId, setSelectedProcessId] = useState<number | null>(null);

  const navigate = (page: Page, params?: { processId?: number }) => {
    if (params?.processId) setSelectedProcessId(params.processId);
    setCurrentPage(page);
    window.scrollTo(0, 0);
  };

  if (carregando) {
    return (
      <div className="h-screen flex flex-col items-center justify-center gap-3 bg-slate-50 text-slate-400">
        <Loader2 size={28} className="animate-spin" />
        <span className="text-sm">Carregando sessão...</span>
      </div>
    );
  }

  if (!autenticado) {
    if (authPage === 'register') return <RegisterPage onBack={() => setAuthPage('login')} />;
    return <LoginPage onRegister={() => setAuthPage('register')} />;
  }

  return (
    <Layout
      currentPage={currentPage}
      navigate={navigate}
      onLogout={() => {
        sair();
        setAuthPage('login');
        setCurrentPage('dashboard');
      }}
    >
      {currentPage === 'dashboard' && <DashboardPage navigate={navigate} />}
      {currentPage === 'processes' && <ProcessesPage navigate={navigate} />}
      {currentPage === 'process-detail' && (
        <ProcessDetailPage processId={selectedProcessId} navigate={navigate} />
      )}
      {currentPage === 'import' && <ImportPage navigate={navigate} />}
      {currentPage === 'import-history' && <ImportHistoryPage />}
      {currentPage === 'analytics' && <AnalyticsPage />}
      {currentPage === 'reports' && <ReportsPage />}
      {currentPage === 'users' && <UsersPage />}
      {currentPage === 'settings' && <SettingsPage />}

      {/* Módulo financeiro */}
      {currentPage === 'fin-dashboard' && <FinanceDashboardPage navigate={navigate} />}
      {currentPage === 'fin-lancamentos' && <LancamentosPage />}
      {currentPage === 'fin-orcamento' && <OrcamentoPage />}
      {currentPage === 'fin-resultado' && <ResultadoPage />}
      {currentPage === 'fin-analise' && <AnalisePage />}
      {currentPage === 'fin-cadastros' && <CadastrosFinanceirosPage />}
      {currentPage === 'fin-adiantamentos' && <AdiantamentosPage />}
      {currentPage === 'fin-devolucoes' && <DevolucoesPage />}
      {currentPage === 'fin-import' && <FinanceImportPage navigate={navigate} />}
    </Layout>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Sistema />
    </AuthProvider>
  );
}
