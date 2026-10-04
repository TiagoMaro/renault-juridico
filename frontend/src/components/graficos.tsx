import type { ElementType } from 'react';
import { Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

/** Porcentagem inteira de uma parte sobre o total, ex.: "38%". */
export function percentualInteiro(parte: number, total: number): string {
  if (total <= 0) return '0%';
  return `${Math.round((parte / total) * 100)}%`;
}

interface CabecalhoGraficoProps {
  icone: ElementType;
  titulo: string;
  subtitulo: string;
  /** Número em destaque no canto direito (ex.: "71"). */
  total?: string;
  /** Texto pequeno abaixo do total (ex.: "total de processos"). */
  legendaTotal?: string;
}

/** Cabeçalho padrão dos gráficos: ícone pequeno, título, subtítulo e selo com o total. */
export function CabecalhoGrafico({ icone: Icone, titulo, subtitulo, total, legendaTotal }: CabecalhoGraficoProps) {
  return (
    <div className="flex items-start justify-between gap-3 mb-4">
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-9 h-9 rounded-full bg-indigo-50 flex items-center justify-center flex-shrink-0">
          <Icone size={16} className="text-slate-800" />
        </div>
        <div className="min-w-0">
          <h3 className="font-semibold text-slate-900 text-sm font-display">{titulo}</h3>
          <p className="text-xs text-slate-400 mt-0.5">{subtitulo}</p>
        </div>
      </div>
      {total && (
        <div className="text-right bg-slate-50 rounded-lg px-3 py-1.5 flex-shrink-0">
          <div className="text-base font-bold text-slate-900 leading-tight">{total}</div>
          {legendaTotal && <div className="text-[10px] text-slate-400">{legendaTotal}</div>}
        </div>
      )}
    </div>
  );
}

const RADIANOS = Math.PI / 180;

interface PropsRotuloPizza {
  cx?: number;
  cy?: number;
  midAngle?: number;
  innerRadius?: number;
  outerRadius?: number;
  percent?: number;
}

/** Escreve a porcentagem dentro de cada fatia da pizza. Fatias menores que 3% ficam sem texto. */
export function rotuloPercentual({
  cx = 0,
  cy = 0,
  midAngle = 0,
  innerRadius = 0,
  outerRadius = 0,
  percent = 0,
}: PropsRotuloPizza) {
  if (percent < 0.03) return <g />;
  const raio = innerRadius + (outerRadius - innerRadius) * 0.55;
  const x = cx + raio * Math.cos(-midAngle * RADIANOS);
  const y = cy + raio * Math.sin(-midAngle * RADIANOS);
  return (
    <text x={x} y={y} fill="#fff" fontSize={11} fontWeight={600} textAnchor="middle" dominantBaseline="central">
      {`${Math.round(percent * 100)}%`}
    </text>
  );
}

interface PropsRotuloBarra {
  x?: number | string;
  y?: number | string;
  width?: number | string;
  height?: number | string;
  value?: number | string;
}

/**
 * Rótulo para barras horizontais: escreve o valor à direita do fim da barra, SEM quebra de linha.
 *
 * O rótulo padrão do gráfico limita a largura do texto à largura da barra; em barras curtas
 * isso faz o texto quebrar em várias linhas e sobrepor as barras vizinhas.
 */
export function criarRotuloBarraHorizontal(formatar: (valor: number) => string, cor = '#0F172A') {
  return function RotuloBarraHorizontal({ x = 0, y = 0, width = 0, height = 0, value = 0 }: PropsRotuloBarra) {
    return (
      <text
        x={Number(x) + Number(width) + 6}
        y={Number(y) + Number(height) / 2}
        fill={cor}
        fontSize={12}
        fontWeight={700}
        dominantBaseline="central"
      >
        {formatar(Number(value))}
      </text>
    );
  };
}

// ---------------------------------------------------------------------------
// Gráfico de barras horizontais com o valor escrito no fim de cada barra
// ---------------------------------------------------------------------------

const ESTILO_TOOLTIP = {
  background: '#fff',
  border: '1px solid #E2E8F0',
  borderRadius: '8px',
  fontSize: 12,
};

interface GraficoBarrasHorizontaisProps<T extends object> {
  /** Lista de itens, um por barra. */
  dados: T[];
  /** Campo do item que vira o nome da barra (eixo vertical). */
  chaveRotulo: keyof T & string;
  /** Campo do item que vira o tamanho da barra e o número exibido. */
  chaveValor: keyof T & string;
  /** Nome da série, exibido no tooltip (ex.: "Processos"). */
  nome: string;
  /** Como escrever o valor no fim da barra e no eixo (ex.: numero, moedaCompacta). */
  formatar: (valor: number) => string;
  /** Como escrever o valor no tooltip. Se omitido, usa o mesmo de `formatar`. */
  formatarTooltip?: (valor: number) => string;
  cor: string;
  /** Cor do número no fim da barra. */
  corRotulo?: string;
  /** Largura reservada para os nomes das barras. */
  larguraRotulos?: number;
  /** Altura de cada linha. A altura total do gráfico cresce com a quantidade de itens. */
  alturaPorItem?: number;
}

/**
 * Barras horizontais com o número ao lado de cada barra, sem sobreposição.
 *
 * Os problemas que ela evita:
 * 1. Texto quebrando em várias linhas: o rótulo é desenhado à mão e nunca quebra.
 * 2. Rótulo cortado na direita: a margem direita é calculada pelo texto mais longo.
 * 3. Números um sobre o outro: a altura do gráfico cresce com a quantidade de barras,
 *    então cada linha sempre tem espaço (com altura fixa, muitas barras se apertam).
 */
export function GraficoBarrasHorizontais<T extends object>({
  dados,
  chaveRotulo,
  chaveValor,
  nome,
  formatar,
  formatarTooltip,
  cor,
  corRotulo = '#0F172A',
  larguraRotulos = 90,
  alturaPorItem = 34,
}: GraficoBarrasHorizontaisProps<T>) {
  const textos = dados.map(item => formatar(Number(item[chaveValor])));
  const maiorTexto = Math.max(1, ...textos.map(texto => texto.length));
  // ~8 px por caractere (negrito, 12 px) + folga
  const margemDireita = maiorTexto * 8 + 16;
  const altura = Math.max(120, dados.length * alturaPorItem + 40);
  const textoTooltip = formatarTooltip ?? formatar;

  return (
    <ResponsiveContainer width="100%" height={altura}>
      <BarChart data={dados} layout="vertical" margin={{ left: 10, right: margemDireita }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" horizontal={false} />
        <XAxis
          type="number"
          tick={{ fontSize: 11, fill: '#94A3B8' }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(valor: number) => formatar(valor)}
        />
        <YAxis
          type="category"
          dataKey={chaveRotulo}
          tick={{ fontSize: 11, fill: '#64748B' }}
          axisLine={false}
          tickLine={false}
          width={larguraRotulos}
        />
        <Tooltip contentStyle={ESTILO_TOOLTIP} formatter={(valor: number) => [textoTooltip(valor), nome]} />
        <Bar dataKey={chaveValor} fill={cor} radius={[0, 4, 4, 0]} name={nome}>
          <LabelList dataKey={chaveValor} content={criarRotuloBarraHorizontal(formatar, corRotulo)} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}