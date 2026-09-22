/** Formatação de moeda, data e números no padrão brasileiro. */

export function moeda(valor: number | null | undefined): string {
  return (valor ?? 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
  });
}

/** Versão compacta para cards: R$ 42,8 mi / R$ 184,6 mi / R$ 950,0 mil */
export function moedaCompacta(valor: number | null | undefined): string {
  const numero = valor ?? 0;
  if (Math.abs(numero) >= 1_000_000) return `R$ ${(numero / 1_000_000).toFixed(1).replace('.', ',')} mi`;
  if (Math.abs(numero) >= 1_000) return `R$ ${(numero / 1_000).toFixed(1).replace('.', ',')} mil`;
  return moeda(numero);
}

export function numero(valor: number | null | undefined): string {
  return (valor ?? 0).toLocaleString('pt-BR');
}

export function percentual(valor: number | null | undefined, casas = 1): string {
  if (valor === null || valor === undefined) return '—';
  const sinal = valor > 0 ? '+' : '';
  return `${sinal}${valor.toFixed(casas).replace('.', ',')}%`;
}

/** '2024-12-15' -> '15/12/2024' */
export function data(valor: string | null | undefined): string {
  if (!valor) return '—';
  const apenasData = valor.split('T')[0];
  const [ano, mes, dia] = apenasData.split('-');
  if (!ano || !mes || !dia) return valor;
  return `${dia}/${mes}/${ano}`;
}

/** '2024-12-15T14:32:00Z' -> '15/12/2024 14:32' */
export function dataHora(valor: string | null | undefined): string {
  if (!valor) return '—';
  const objeto = new Date(valor);
  if (Number.isNaN(objeto.getTime())) return data(valor);
  return objeto.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Dias decorridos desde a data informada. */
export function diasDesde(valor: string | null | undefined): number | null {
  if (!valor) return null;
  const objeto = new Date(valor.split('T')[0]);
  if (Number.isNaN(objeto.getTime())) return null;
  return Math.floor((Date.now() - objeto.getTime()) / 86_400_000);
}

export const CORES_RISCO: Record<string, string> = {
  Baixo: '#16A34A',
  'Médio': '#D97706',
  Alto: '#EA580C',
  'Crítico': '#DC2626',
};

export const CLASSES_RISCO: Record<string, string> = {
  Baixo: 'bg-green-50 text-green-700 border-green-200',
  'Médio': 'bg-amber-50 text-amber-700 border-amber-200',
  Alto: 'bg-orange-50 text-orange-700 border-orange-200',
  'Crítico': 'bg-red-50 text-red-700 border-red-200',
};
