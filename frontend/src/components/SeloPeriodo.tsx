import { Calendar } from 'lucide-react';

import { data as formatarData } from '../utils/formato';

interface Props {
  /** Texto do período (ex.: "Janeiro a Março de 2026"). Vazio mostra "Todo o histórico". */
  periodo?: string;
  /** Datas de um filtro de intervalo, se a página tiver (mostra o aviso "Filtrado ..."). */
  dataInicio?: string;
  dataFim?: string;
}

/** Selo "Período de Análise" exibido no cabeçalho das páginas, igual ao do DashboardPage. */
export default function SeloPeriodo({ periodo, dataInicio, dataFim }: Props) {
  return (
    <div className="flex items-center gap-2 mt-1.5">
      <span className="px-2.5 py-1 bg-blue-50 text-blue-700 border border-blue-100 rounded-md text-xs font-semibold flex items-center gap-1.5">
        <Calendar size={13} />
        Período de Análise: {periodo || 'Todo o histórico'}
      </span>
      {(dataInicio || dataFim) && (
        <span className="text-xs text-slate-500">
          (Filtrado
          {dataInicio && ` a partir de ${formatarData(dataInicio)}`}
          {dataFim && ` até ${formatarData(dataFim)}`})
        </span>
      )}
    </div>
  );
}
