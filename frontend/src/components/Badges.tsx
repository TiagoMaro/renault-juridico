/** Badges reutilizados nas tabelas de processos. */

import { CLASSES_RISCO } from '../utils/formato';

const CORES_NATUREZA: Record<string, string> = {
  Trabalhista: 'bg-blue-100 text-blue-700',
  'Cível': 'bg-purple-100 text-purple-700',
  Consumidor: 'bg-green-100 text-green-700',
  'Tributário': 'bg-amber-100 text-amber-700',
  Contratual: 'bg-cyan-100 text-cyan-700',
  Administrativo: 'bg-orange-100 text-orange-700',
  Outros: 'bg-slate-100 text-slate-600',
};

export function NaturezaBadge({ natureza }: { natureza: string }) {
  return (
    <span
      className={`px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${
        CORES_NATUREZA[natureza] || 'bg-slate-100 text-slate-600'
      }`}
    >
      {natureza}
    </span>
  );
}

export function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`px-2 py-0.5 rounded-full text-xs font-medium ${
        status === 'Ativo' ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'
      }`}
    >
      {status}
    </span>
  );
}

export function RiscoBadge({ risco }: { risco: string }) {
  return (
    <span
      className={`px-2 py-0.5 rounded-full text-xs font-medium border whitespace-nowrap ${
        CLASSES_RISCO[risco] ?? 'bg-slate-50 text-slate-600 border-slate-200'
      }`}
    >
      {risco}
    </span>
  );
}

export function DefesaBadge({ realizada }: { realizada: boolean }) {
  return (
    <span
      className={`px-2 py-0.5 rounded-full text-xs font-medium ${
        realizada ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
      }`}
    >
      {realizada ? 'Realizada' : 'Pendente'}
    </span>
  );
}
