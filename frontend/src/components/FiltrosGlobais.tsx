/** Painel de filtros globais compartilhado por Dashboard, Análises e Relatórios.
 *
 * As opções vêm do banco (/processos/opcoes-filtro), então os selects sempre
 * refletem o que existe de verdade nos processos importados.
 */

import { Filter, X } from 'lucide-react';

import { api } from '../api/client';
import type { FiltrosProcesso } from '../api/types';
import { useRequisicao } from '../hooks/useRequisicao';

interface Props {
  filtros: FiltrosProcesso;
  aoAlterar: (filtros: FiltrosProcesso) => void;
  aberto: boolean;
  aoAlternar: () => void;
  /** Campos exibidos; por padrão todos. */
  campos?: (keyof FiltrosProcesso)[];
}

const TODOS_OS_CAMPOS: (keyof FiltrosProcesso)[] = [
  'natureza',
  'status',
  'comarca',
  'risco',
  'fase',
  'escritorio',
  'posicao',
  'vara',
  'data_inicio',
  'data_fim',
];

const ROTULOS: Record<string, string> = {
  natureza: 'Natureza',
  status: 'Status',
  comarca: 'Comarca',
  risco: 'Faixa de risco',
  fase: 'Fase processual',
  escritorio: 'Escritório',
  posicao: 'Posição Renault',
  vara: 'Vara',
  data_inicio: 'Início a partir de',
  data_fim: 'Início até',
};

export function BotaoFiltros({ aberto, aoAlternar, quantidade }: { aberto: boolean; aoAlternar: () => void; quantidade: number }) {
  return (
    <button
      onClick={aoAlternar}
      className="flex items-center gap-2 px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white text-slate-600 hover:bg-slate-50 transition-colors"
    >
      <Filter size={15} />
      Filtros
      {quantidade > 0 && (
        <span
          className="px-1.5 py-0.5 rounded-full text-[10px] font-semibold text-white"
          style={{ background: '#0035AD' }}
        >
          {quantidade}
        </span>
      )}
      {aberto && <X size={14} className="text-slate-400" />}
    </button>
  );
}

export default function FiltrosGlobais({ filtros, aoAlterar, aberto, campos = TODOS_OS_CAMPOS }: Props) {
  const { dados: opcoes } = useRequisicao(() => api.processos.opcoesFiltro(), []);

  if (!aberto) return null;

  const listas: Record<string, string[]> = {
    natureza: opcoes?.naturezas ?? [],
    status: opcoes?.status ?? [],
    comarca: opcoes?.comarcas ?? [],
    risco: opcoes?.riscos ?? [],
    fase: opcoes?.fases ?? [],
    escritorio: opcoes?.escritorios ?? [],
    posicao: opcoes?.posicoes ?? [],
    vara: opcoes?.varas ?? [],
  };

  const alterar = (campo: keyof FiltrosProcesso, valor: string) =>
    aoAlterar({ ...filtros, [campo]: valor || undefined });

  const ativos = Object.values(filtros).filter(Boolean).length;

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {campos.map(campo => {
          const ehData = campo === 'data_inicio' || campo === 'data_fim';
          return (
            <div key={campo}>
              <label className="text-xs font-medium text-slate-500 block mb-1">{ROTULOS[campo]}</label>
              {ehData ? (
                <input
                  type="date"
                  value={(filtros[campo] as string) ?? ''}
                  onChange={e => alterar(campo, e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:border-transparent"
                  style={{ '--tw-ring-color': '#0035AD' } as React.CSSProperties}
                />
              ) : (
                <select
                  value={(filtros[campo] as string) ?? ''}
                  onChange={e => alterar(campo, e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:border-transparent"
                  style={{ '--tw-ring-color': '#0035AD' } as React.CSSProperties}
                >
                  <option value="">Todos</option>
                  {(listas[campo] ?? []).map(opcao => (
                    <option key={opcao} value={opcao}>
                      {opcao}
                    </option>
                  ))}
                </select>
              )}
            </div>
          );
        })}
      </div>
      <div className="mt-3 flex justify-end">
        <button
          onClick={() => aoAlterar({})}
          disabled={ativos === 0}
          className="text-sm text-slate-500 hover:text-slate-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Limpar filtros
        </button>
      </div>
    </div>
  );
}
