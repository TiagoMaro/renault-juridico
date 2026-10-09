/** Funções que montam o texto do selo "Período de Análise" (components/SeloPeriodo). */

const MESES = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
];

const nomeMes = (mes: number) => MESES[mes - 1] ?? `mês ${mes}`;

/** Páginas com filtros de ano e/ou mês (ex.: Lançamentos). */
export function periodoDosFiltros({ ano, mes }: { ano?: number; mes?: number }): string {
  if (mes && ano) return `${nomeMes(mes)} de ${ano}`;
  if (mes) return nomeMes(mes);
  if (ano) return `Ano de ${ano}`;
  return '';
}

/** Páginas com série mensal (por_mes): do primeiro ao último mês com lançamentos. */
export function periodoDosMeses(
  meses: { mes: number; nome: string; quantidade: number }[],
  ano?: number,
): string {
  const usados = meses.filter(m => m.quantidade > 0).sort((a, b) => a.mes - b.mes);
  if (!usados.length) return '';
  const primeiro = usados[0].nome;
  const ultimo = usados[usados.length - 1].nome;
  const intervalo = primeiro === ultimo ? primeiro : `${primeiro} a ${ultimo}`;
  return ano ? `${intervalo} de ${ano}` : intervalo;
}

/** Páginas com ano + intervalo de meses (de/até), onde vazio significa "sem limite". */
export function periodoDoIntervalo(
  ano: number | null | undefined,
  de?: number | null,
  ate?: number | null,
): string {
  const sufixo = ano ? ` de ${ano}` : '';
  if (!de && !ate) return ano ? `Ano de ${ano}` : '';
  if (de && ate) {
    return de === ate ? `${nomeMes(de)}${sufixo}` : `${nomeMes(de)} a ${nomeMes(ate)}${sufixo}`;
  }
  if (de) return `A partir de ${nomeMes(de)}${sufixo}`;
  return `Até ${nomeMes(ate as number)}${sufixo}`;
}

/** Páginas sem filtro de período, mas cujos registros têm ano de referência. */
export function periodoDosAnos(anos: (number | null | undefined)[]): string {
  const validos = anos.filter((a): a is number => typeof a === 'number');
  if (!validos.length) return '';
  const menor = Math.min(...validos);
  const maior = Math.max(...validos);
  return menor === maior ? String(menor) : `${menor} a ${maior}`;
}
