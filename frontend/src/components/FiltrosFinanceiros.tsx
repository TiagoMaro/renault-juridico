/** Filtros compartilhados pelas telas financeiras.
 *
 * As opções vêm do banco (/financeiro/lancamentos/opcoes-filtro), combinando os
 * valores realmente usados nos lançamentos com as listas da aba "Base".
 */

import { Filter, X } from 'lucide-react';

import { api } from '../api/client';
import type { FiltrosFinanceiro } from '../api/types';
import { useRequisicao } from '../hooks/useRequisicao';

const BRAND = '#0035AD';

const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

export function BotaoFiltrosFinanceiros({
  aberto,
  aoAlternar,
  quantidade,
}: {
  aberto: boolean;
  aoAlternar: () => void;
  quantidade: number;
}) {
  return (
    <button
      onClick={aoAlternar}
      className="flex items-center gap-2 px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white text-slate-600 hover:bg-slate-50 transition-colors whitespace-nowrap"
    >
      <Filter size={15} />
      Filtros
      {quantidade > 0 && (
        <span
          className="px-1.5 py-0.5 rounded-full text-[10px] font-semibold text-white"
          style={{ background: BRAND }}
        >
          {quantidade}
        </span>
      )}
      {aberto && <X size={14} className="text-slate-400" />}
    </button>
  );
}

interface Props {
  filtros: FiltrosFinanceiro;
  aoAlterar: (filtros: FiltrosFinanceiro) => void;
  aberto: boolean;
}

export default function FiltrosFinanceiros({ filtros, aoAlterar, aberto }: Props) {
  const { dados: opcoes } = useRequisicao(() => api.financeiro.opcoesFiltro(), []);

  if (!aberto) return null;

  const alterar = (campo: keyof FiltrosFinanceiro, valor: string) =>
    aoAlterar({ ...filtros, [campo]: valor === '' ? undefined : valor });

  const alterarNumero = (campo: keyof FiltrosFinanceiro, valor: string) =>
    aoAlterar({ ...filtros, [campo]: valor === '' ? undefined : Number(valor) });

  const ativos = Object.values(filtros).filter(v => v !== undefined && v !== '').length;

  const selects: { campo: keyof FiltrosFinanceiro; label: string; lista: string[] }[] = [
    { campo: 'status', label: 'Status', lista: opcoes?.status ?? [] },
    { campo: 'area', label: 'Área', lista: opcoes?.areas ?? [] },
    { campo: 'edoa', label: 'EDOA', lista: opcoes?.edoas ?? [] },
    { campo: 'categoria', label: 'Categoria', lista: opcoes?.categorias ?? [] },
    { campo: 'motivo', label: 'Motivo', lista: opcoes?.motivos ?? [] },
    { campo: 'recorrencia', label: 'Recorrência', lista: opcoes?.recorrencias ?? [] },
    { campo: 'tipo_pagamento', label: 'Tipo de pagamento', lista: opcoes?.tipos_pagamento ?? [] },
    { campo: 'centro_custo', label: 'Centro de custo', lista: opcoes?.centros_custo ?? [] },
    { campo: 'conta_contabil', label: 'Conta contábil', lista: opcoes?.contas_contabeis ?? [] },
  ];

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {selects.map(({ campo, label, lista }) => (
          <div key={campo}>
            <label className="text-xs font-medium text-slate-500 block mb-1">{label}</label>
            <select
              value={(filtros[campo] as string) ?? ''}
              onChange={e => alterar(campo, e.target.value)}
              className={campoClass}
            >
              <option value="">Todos</option>
              {lista.map(opcao => (
                <option key={opcao} value={opcao}>
                  {opcao}
                </option>
              ))}
            </select>
          </div>
        ))}

        <div>
          <label className="text-xs font-medium text-slate-500 block mb-1">Mês de referência</label>
          <select
            value={filtros.mes ?? ''}
            onChange={e => alterarNumero('mes', e.target.value)}
            className={campoClass}
          >
            <option value="">Todos</option>
            {MESES.map((nome, i) => (
              <option key={nome} value={i + 1}>
                {nome}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-xs font-medium text-slate-500 block mb-1">Ano</label>
          <select
            value={filtros.ano ?? ''}
            onChange={e => alterarNumero('ano', e.target.value)}
            className={campoClass}
          >
            <option value="">Todos</option>
            {(opcoes?.anos ?? []).map(ano => (
              <option key={ano} value={ano}>
                {ano}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-xs font-medium text-slate-500 block mb-1">Pagamento a partir de</label>
          <input
            type="date"
            value={filtros.data_de ?? ''}
            onChange={e => alterar('data_de', e.target.value)}
            className={campoClass}
          />
        </div>

        <div>
          <label className="text-xs font-medium text-slate-500 block mb-1">Pagamento até</label>
          <input
            type="date"
            value={filtros.data_ate ?? ''}
            onChange={e => alterar('data_ate', e.target.value)}
            className={campoClass}
          />
        </div>

        <div>
          <label className="text-xs font-medium text-slate-500 block mb-1">Valor mínimo (R$)</label>
          <input
            type="number"
            min="0"
            step="100"
            value={filtros.valor_min ?? ''}
            onChange={e => alterarNumero('valor_min', e.target.value)}
            className={campoClass}
          />
        </div>

        <div>
          <label className="text-xs font-medium text-slate-500 block mb-1">Valor máximo (R$)</label>
          <input
            type="number"
            min="0"
            step="100"
            value={filtros.valor_max ?? ''}
            onChange={e => alterarNumero('valor_max', e.target.value)}
            className={campoClass}
          />
        </div>
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

const campoClass =
  'w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:border-transparent';
