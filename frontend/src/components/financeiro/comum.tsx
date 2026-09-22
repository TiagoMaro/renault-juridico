/** Peças compartilhadas pelas telas financeiras: ano do exercício, cartões, avisos. */

import { useEffect, useState } from 'react';
import { AlertTriangle, Info } from 'lucide-react';

import { api } from '../../api/client';
import type { AnosFinanceiros } from '../../api/types';
import { useRequisicao } from '../../hooks/useRequisicao';

export const BRAND = '#0035AD';

export const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];
export const MESES_CURTOS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

/**
 * Ano do exercício escolhido na tela. Começa no ano mais recente com dados
 * (e não no ano corrente, que costuma estar vazio quando a planilha é de outro ano).
 */
export function useAnoFinanceiro() {
  const { dados, recarregar } = useRequisicao<AnosFinanceiros>(() => api.financeiro.anos(), []);
  const [ano, setAno] = useState<number | null>(null);

  useEffect(() => {
    if (ano === null && dados) setAno(dados.padrao);
  }, [dados, ano]);

  const info = dados?.anos.find(a => a.ano === ano) ?? null;
  const anos = dados?.anos.length ? dados.anos.map(a => a.ano) : ano ? [ano] : [];
  return { ano, setAno, anos, info, recarregarAnos: recarregar };
}

export function SeletorAno({
  ano,
  anos,
  aoAlterar,
}: {
  ano: number | null;
  anos: number[];
  aoAlterar: (ano: number) => void;
}) {
  return (
    <select
      value={ano ?? ''}
      onChange={e => aoAlterar(Number(e.target.value))}
      className="px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white text-slate-700 focus:outline-none"
      aria-label="Ano do exercício"
    >
      {anos.map(a => (
        <option key={a} value={a}>
          Exercício {a}
        </option>
      ))}
    </select>
  );
}

export function SeletorMes({
  valor,
  aoAlterar,
  rotulo,
  permitirVazio,
}: {
  valor: number | null;
  aoAlterar: (mes: number | null) => void;
  rotulo?: string;
  permitirVazio?: string;
}) {
  return (
    <label className="flex items-center gap-2 text-sm text-slate-600">
      {rotulo && <span className="whitespace-nowrap">{rotulo}</span>}
      <select
        value={valor ?? ''}
        onChange={e => aoAlterar(e.target.value ? Number(e.target.value) : null)}
        className="px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white text-slate-700 focus:outline-none"
      >
        {permitirVazio && <option value="">{permitirVazio}</option>}
        {MESES.map((nome, i) => (
          <option key={nome} value={i + 1}>
            {nome}
          </option>
        ))}
      </select>
    </label>
  );
}

export function Cartao({
  titulo,
  valor,
  cor = BRAND,
  detalhe,
}: {
  titulo: string;
  valor: string;
  cor?: string;
  detalhe?: string;
}) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4">
      <p className="text-xs text-slate-500">{titulo}</p>
      <p className="text-lg font-bold mt-1 tabular-nums font-display" style={{ color: cor }}>
        {valor}
      </p>
      {detalhe && <p className="text-[11px] text-slate-400 mt-0.5">{detalhe}</p>}
    </div>
  );
}

export function CaixaInfo({ itens, tom = 'info' }: { itens: string[]; tom?: 'info' | 'alerta' }) {
  if (!itens.length) return null;
  const alerta = tom === 'alerta';
  return (
    <div
      className={`flex items-start gap-2 px-4 py-3 rounded-lg border text-xs text-slate-600 ${
        alerta ? 'border-amber-200 bg-amber-50' : 'border-blue-100 bg-blue-50'
      }`}
    >
      {alerta ? (
        <AlertTriangle size={15} className="text-amber-600 flex-shrink-0 mt-0.5" />
      ) : (
        <Info size={15} className="text-blue-600 flex-shrink-0 mt-0.5" />
      )}
      <ul className="space-y-1">
        {itens.map(item => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

/** Cor do % consumido: verde até 90, âmbar até 100, vermelho acima. */
export function corConsumo(percentual: number): string {
  if (percentual > 100) return '#DC2626';
  if (percentual > 90) return '#D97706';
  return '#16A34A';
}

export function BarraConsumo({ percentual }: { percentual: number }) {
  return (
    <div className="flex items-center gap-2 min-w-[110px]">
      <div className="flex-1 h-1.5 rounded-full bg-slate-100 overflow-hidden">
        <div
          className="h-full rounded-full"
          style={{ width: `${Math.min(percentual, 100)}%`, background: corConsumo(percentual) }}
        />
      </div>
      <span className="text-xs tabular-nums w-12 text-right" style={{ color: corConsumo(percentual) }}>
        {percentual.toFixed(1).replace('.', ',')}%
      </span>
    </div>
  );
}
