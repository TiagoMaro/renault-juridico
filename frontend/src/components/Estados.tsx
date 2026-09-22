/** Estados de tela: carregando, erro, vazio e aviso. */

import { AlertCircle, Inbox, Loader2, RefreshCw } from 'lucide-react';

export function Carregando({ mensagem = 'Carregando dados...' }: { mensagem?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-slate-400 gap-3">
      <Loader2 size={26} className="animate-spin" />
      <span className="text-sm">{mensagem}</span>
    </div>
  );
}

export function ErroCarregamento({ mensagem, aoTentarNovamente }: { mensagem: string; aoTentarNovamente?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-3 text-center px-6">
      <div className="w-11 h-11 rounded-xl bg-red-50 border border-red-100 flex items-center justify-center">
        <AlertCircle size={20} className="text-red-600" />
      </div>
      <div>
        <p className="text-sm font-medium text-slate-800">Não foi possível carregar</p>
        <p className="text-sm text-slate-500 mt-1 max-w-md">{mensagem}</p>
      </div>
      {aoTentarNovamente && (
        <button
          onClick={aoTentarNovamente}
          className="mt-1 flex items-center gap-2 px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white text-slate-600 hover:bg-slate-50 transition-colors"
        >
          <RefreshCw size={14} /> Tentar novamente
        </button>
      )}
    </div>
  );
}

export function EstadoVazio({
  titulo,
  descricao,
  acao,
}: {
  titulo: string;
  descricao?: string;
  acao?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-3 text-center px-6">
      <div className="w-11 h-11 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-center">
        <Inbox size={20} className="text-slate-400" />
      </div>
      <div>
        <p className="text-sm font-medium text-slate-800">{titulo}</p>
        {descricao && <p className="text-sm text-slate-500 mt-1 max-w-md">{descricao}</p>}
      </div>
      {acao}
    </div>
  );
}

export function Aviso({ texto, tom = 'alerta' }: { texto: string; tom?: 'alerta' | 'erro' | 'sucesso' }) {
  const estilos = {
    alerta: 'bg-amber-50 border-amber-200 text-amber-800',
    erro: 'bg-red-50 border-red-200 text-red-700',
    sucesso: 'bg-green-50 border-green-200 text-green-700',
  }[tom];

  return (
    <div className={`flex items-start gap-2 px-4 py-3 rounded-lg border text-sm ${estilos}`}>
      <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
      <span>{texto}</span>
    </div>
  );
}
