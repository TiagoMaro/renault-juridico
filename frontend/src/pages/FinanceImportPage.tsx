import { useRef, useState } from 'react';
import { AlertTriangle, BarChart3, CheckCircle2, ChevronRight, Download, Eye, FileSpreadsheet, Upload, X } from 'lucide-react';

import { api } from '../api/client';
import type { ImportacaoFinanceira, PreviewFinanceiro } from '../api/types';
import { Aviso } from '../components/Estados';
import type { NavigateFn } from '../types';
import { moeda, numero } from '../utils/formato';

const BRAND = '#0035AD';

type Etapa = 'upload' | 'preview' | 'processando' | 'resultado';

const ROTULO_DESTINO: Record<string, string> = {
  lancamentos: 'Controle de lançamentos',
  adiantamentos: 'Adiantamentos',
  devolucoes: 'Devoluções',
  rap: 'Orçamento (RAP)',
  honorarios: 'Orçamento (honorários)',
  mensais: 'Orçamento (contratos mensais)',
  base: 'Listas de domínio',
  contas: 'Plano de contas',
  derivada: 'Resumo — recalculado',
  calculada: 'Resumo — recalculado',
  ignorada: 'Ignorada',
  resultado: 'Layout do Resultado',
};

const ROTULO_CAMPO: Record<string, string> = {
  area: 'Área',
  motivo: 'Motivo',
  recorrencia: 'Recorrência',
  tipo_pagamento: 'Pagamento',
  edoa: 'EDOA',
  categoria: 'Categoria',
  fornecedor: 'Fornecedor',
};

interface Props {
  navigate: NavigateFn;
}

export default function FinanceImportPage({ navigate }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);

  const [etapa, setEtapa] = useState<Etapa>('upload');
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [ano, setAno] = useState(new Date().getFullYear());
  const [arrastando, setArrastando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreviewFinanceiro | null>(null);
  const [resultado, setResultado] = useState<ImportacaoFinanceira | null>(null);
  const [carregando, setCarregando] = useState(false);

  const selecionar = (f: File | undefined) => {
    if (!f) return;
    setErro(null);
    setPreview(null);
    setArquivo(f);
  };

  const analisar = async () => {
    if (!arquivo) return;
    setErro(null);
    setCarregando(true);
    try {
      const analise = await api.financeiro.previewImportacao(arquivo);
      setPreview(analise);
      setAno(analise.ano_detectado);
      setEtapa('preview');
    } catch (problema) {
      setErro(problema instanceof Error ? problema.message : 'Não foi possível ler o arquivo.');
    } finally {
      setCarregando(false);
    }
  };

  const importar = async () => {
    if (!arquivo) return;
    setErro(null);
    setEtapa('processando');
    try {
      setResultado(await api.financeiro.importar(arquivo, ano));
      setEtapa('resultado');
    } catch (problema) {
      setErro(problema instanceof Error ? problema.message : 'Falha ao importar.');
      setEtapa('preview');
    }
  };

  const reiniciar = () => {
    setEtapa('upload');
    setArquivo(null);
    setPreview(null);
    setResultado(null);
    setErro(null);
  };

  const abasReconhecidas = preview?.abas.filter(a => a.destino && a.destino !== 'derivada').length ?? 0;

  return (
    <div className="p-6 max-w-5xl">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-slate-900 font-display">Importar Planilha de Pagamentos</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          O arquivo inteiro de uma vez — cada aba vai para o lugar certo do sistema
        </p>
      </div>

      {/* Passos */}
      <div className="flex items-center gap-2 mb-6">
        {(['upload', 'preview', 'processando', 'resultado'] as Etapa[]).map((s, i) => {
          const rotulos = ['Arquivo', 'Conferência das abas', 'Processamento', 'Resultado'];
          const concluida = ['upload', 'preview', 'processando', 'resultado'].indexOf(etapa) > i;
          const ativa = etapa === s;
          return (
            <div key={s} className="flex items-center gap-2">
              <div
                className={`flex items-center gap-2 text-sm ${
                  ativa ? 'font-medium' : concluida ? 'text-green-600' : 'text-slate-400'
                }`}
              >
                <div
                  className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                    ativa ? 'text-white' : concluida ? 'bg-green-100 text-green-600' : 'bg-slate-100 text-slate-400'
                  }`}
                  style={ativa ? { background: BRAND } : {}}
                >
                  {concluida ? '✓' : i + 1}
                </div>
                <span className="hidden md:block">{rotulos[i]}</span>
              </div>
              {i < 3 && <ChevronRight size={14} className="text-slate-300" />}
            </div>
          );
        })}
      </div>

      {erro && (
        <div className="mb-4">
          <Aviso texto={erro} tom="erro" />
        </div>
      )}

      {etapa === 'upload' && (
        <div className="space-y-4">
          <div
            onDragOver={e => {
              e.preventDefault();
              setArrastando(true);
            }}
            onDragLeave={() => setArrastando(false)}
            onDrop={e => {
              e.preventDefault();
              setArrastando(false);
              selecionar(e.dataTransfer.files[0]);
            }}
            onClick={() => inputRef.current?.click()}
            className={`border-2 border-dashed rounded-2xl p-16 text-center cursor-pointer transition-all ${
              arrastando
                ? 'border-blue-400 bg-blue-50'
                : arquivo
                  ? 'border-green-300 bg-green-50'
                  : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
            }`}
          >
            <input
              ref={inputRef}
              type="file"
              accept=".xlsx,.xlsm,.xls,.csv"
              className="hidden"
              onChange={e => selecionar(e.target.files?.[0])}
            />
            {arquivo ? (
              <div>
                <div className="w-14 h-14 rounded-2xl bg-green-100 flex items-center justify-center mx-auto mb-4">
                  <CheckCircle2 size={28} className="text-green-600" />
                </div>
                <p className="font-semibold text-slate-900">{arquivo.name}</p>
                <p className="text-sm text-slate-500 mt-1">{(arquivo.size / 1024).toFixed(1)} KB</p>
                <button
                  onClick={e => {
                    e.stopPropagation();
                    setArquivo(null);
                  }}
                  className="mt-3 inline-flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600"
                >
                  <X size={12} /> Remover
                </button>
              </div>
            ) : (
              <div>
                <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-4">
                  <Upload size={28} className="text-slate-400" />
                </div>
                <p className="font-semibold text-slate-800">
                  Arraste a planilha de pagamentos ou selecione o arquivo
                </p>
                <p className="text-sm text-slate-500 mt-2">XLSM, XLSX, XLS ou CSV — o arquivo com todas as abas</p>
                <button
                  type="button"
                  className="mt-5 px-5 py-2.5 rounded-lg text-sm font-medium text-white hover:opacity-90"
                  style={{ background: BRAND }}
                  onClick={e => {
                    e.stopPropagation();
                    inputRef.current?.click();
                  }}
                >
                  Selecionar arquivo
                </button>
              </div>
            )}
          </div>

          {arquivo && (
            <div className="flex justify-end">
              <button
                onClick={analisar}
                disabled={carregando}
                className="px-5 py-2.5 rounded-lg text-sm font-medium text-white hover:opacity-90 disabled:opacity-60 whitespace-nowrap"
                style={{ background: BRAND }}
              >
                {carregando ? 'Lendo abas...' : 'Conferir abas →'}
              </button>
            </div>
          )}

          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
              <h3 className="text-sm font-semibold text-slate-800">Abas que o sistema reconhece</h3>
              <button
                onClick={() => api.financeiro.baixarModelo()}
                className="flex items-center gap-1.5 text-xs font-medium hover:underline"
                style={{ color: BRAND }}
              >
                <Download size={13} /> Baixar planilha modelo (dados fictícios)
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {[
                ['Controle Lançamentos', 'Cada pagamento do Jurídico'],
                ['Adiantamentos', 'Adiantamentos e baixas'],
                ['Devoluções', 'Estornos dos escritórios'],
                ['RAP PAGAMENTOS', 'Budget, mês de fechamento e critério de cada linha'],
                ['Honorarios Variaveis', 'Plano de honorários mês a mês'],
                ['Mensais', 'Contratos recorrentes e sistemas'],
                ['Resultado', 'Layout do relatório (linhas e impacto)'],
                ['LGPD', 'Recalculada em Análise por EDOA'],
                ['Base', 'Listas de domínio'],
                ['RF MENSAL', 'Plano de contas'],
              ].map(([aba, descricao]) => (
                <div key={aba} className="flex items-start gap-2 text-xs">
                  <FileSpreadsheet size={13} className="text-slate-400 flex-shrink-0 mt-0.5" />
                  <span className="text-slate-700 font-medium">{aba}</span>
                  <span className="text-slate-400">— {descricao}</span>
                </div>
              ))}
            </div>
            <p className="text-xs text-slate-400 mt-3">
              Nenhum total é copiado da planilha: REALIZADO, GAP, Resultado e a tabela da LGPD são recalculados a
              partir dos lançamentos, com o critério lido das fórmulas SUMIF/SUMIFS. Reimportar o mesmo ano
              atualiza o que mudou e remove o que saiu da planilha — lançamentos feitos no sistema nunca são
              apagados. O cabeçalho pode estar em qualquer linha.
            </p>
          </div>
        </div>
      )}

      {etapa === 'preview' && preview && (
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-blue-50 rounded-lg flex items-center justify-center">
                  <FileSpreadsheet size={18} style={{ color: BRAND }} />
                </div>
                <div>
                  <p className="font-medium text-slate-900 text-sm">{preview.arquivo}</p>
                  <p className="text-xs text-slate-500">
                    {preview.abas.length} aba(s) · {abasReconhecidas} serão importadas
                  </p>
                </div>
              </div>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/60">
                  {['Aba', 'Destino no sistema', 'Linhas', 'Cabeçalho', 'O que acontece'].map(h => (
                    <th key={h} className="text-left text-xs font-medium text-slate-500 px-4 py-3">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.abas.map(aba => {
                  const importa = aba.destino && aba.destino !== 'derivada';
                  return (
                    <tr key={aba.aba} className="border-b border-slate-50 last:border-0">
                      <td className="px-4 py-3 text-xs font-medium text-slate-800">{aba.aba}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${
                            importa
                              ? 'bg-green-100 text-green-700'
                              : aba.destino === 'derivada'
                                ? 'bg-blue-100 text-blue-700'
                                : 'bg-slate-100 text-slate-500'
                          }`}
                        >
                          {ROTULO_DESTINO[aba.destino ?? 'ignorada'] ?? aba.destino}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-600">
                        {aba.linhas ? numero(aba.linhas) : '—'}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500">
                        {importa ? `linha ${aba.linha_cabecalho}` : '—'}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500 max-w-[320px]">
                        {aba.descricao ?? '—'}
                        {aba.observacao && <span className="block text-slate-400 mt-0.5">{aba.observacao}</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-4 flex flex-col sm:flex-row sm:items-end gap-3">
            <div className="max-w-xs">
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Exercício (ano)</label>
              <input
                type="number"
                min={2000}
                max={2100}
                value={ano}
                onChange={e => setAno(Number(e.target.value))}
                className="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none"
              />
            </div>
            <p className="text-xs text-slate-500 flex-1">
              Detectado: <strong>{preview.ano_detectado}</strong> ({preview.origem_ano}). A planilha é anual — este
              ano classifica lançamentos e orçamento, e a reimportação só reconcilia registros deste ano.
            </p>
          </div>

          <div className="flex items-center justify-between">
            <button onClick={() => setEtapa('upload')} className="text-sm text-slate-500 hover:text-slate-700">
              ← Voltar
            </button>
            <button
              onClick={importar}
              disabled={abasReconhecidas === 0}
              className="px-5 py-2.5 rounded-lg text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
              style={{ background: BRAND }}
            >
              Confirmar e importar
            </button>
          </div>
        </div>
      )}

      {etapa === 'processando' && (
        <div className="bg-white rounded-xl border border-slate-200 p-16 text-center">
          <div
            className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4"
            style={{ background: '#EEF3FF' }}
          >
            <div
              className="w-8 h-8 border-t-transparent rounded-full animate-spin"
              style={{ borderColor: '#E2E8F0', borderTopColor: BRAND, borderWidth: '3px' }}
            />
          </div>
          <h2 className="text-lg font-bold text-slate-900 font-display">Importando as abas</h2>
          <p className="text-sm text-slate-500 mt-1">
            Lendo, padronizando e consolidando os lançamentos — alguns segundos para milhares de linhas.
          </p>
        </div>
      )}

      {etapa === 'resultado' && resultado && (
        <div className="space-y-5">
          <div className="bg-white rounded-xl border border-slate-200 p-6">
            <div className="flex items-start gap-4">
              <div
                className={`w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0 ${
                  resultado.status === 'Erro' ? 'bg-red-100' : 'bg-green-100'
                }`}
              >
                <CheckCircle2 size={28} className={resultado.status === 'Erro' ? 'text-red-600' : 'text-green-600'} />
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-900 font-display">Importação concluída</h2>
                <p className="text-sm text-slate-500 mt-1">
                    Exercício <strong>{resultado.ano}</strong>
                  {resultado.mes_fechamento ? ` · mês de fechamento ${resultado.mes_fechamento}` : ''}.{' '}
                  {resultado.criados === 0 && resultado.atualizados === 0 && !resultado.removidos
                    ? 'Nenhuma mudança: os dados da planilha já estavam atualizados no sistema.'
                    : `${numero(resultado.criados)} criado(s), ${numero(resultado.atualizados)} atualizado(s)` +
                      (resultado.removidos ? ` e ${numero(resultado.removidos)} removido(s) (saíram da planilha).` : '.')}{' '}
                  Processado em {((resultado.duracao_ms ?? 0) / 1000).toFixed(1)}s.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-6">
              {[
                { label: 'Lançamentos no sistema', valor: numero(resultado.total_lancamentos), cor: '#0035AD', bg: '#EEF3FF' },
                { label: 'Valor total', valor: moeda(resultado.valor_total_lancamentos), cor: '#16A34A', bg: '#F0FDF4' },
                { label: 'Registros criados', valor: numero(resultado.criados), cor: '#0891B2', bg: '#ECFEFF' },
                {
                  label: 'Inconsistências',
                  valor: numero(resultado.total_inconsistencias),
                  cor: resultado.total_inconsistencias ? '#D97706' : '#94A3B8',
                  bg: resultado.total_inconsistencias ? '#FFFBEB' : '#F8FAFC',
                },
              ].map(({ label, valor, cor, bg }) => (
                <div
                  key={label}
                  className="text-center p-4 rounded-xl border"
                  style={{ background: bg, borderColor: `${cor}22` }}
                >
                  <p className="text-xl font-bold font-display" style={{ color: cor }}>
                    {valor}
                  </p>
                  <p className="text-xs mt-1 text-slate-500">{label}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100">
              <h3 className="font-semibold text-slate-900 text-sm font-display">O que entrou de cada aba</h3>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/60">
                  {['Aba', 'Destino', 'Lidas', 'Criados', 'Atualizados', 'Removidos', 'Ignoradas', 'Alertas'].map(h => (
                    <th key={h} className="text-left text-xs font-medium text-slate-500 px-4 py-3">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {resultado.abas.map(aba => (
                  <tr key={aba.aba} className="border-b border-slate-50 last:border-0">
                    <td className="px-4 py-3 text-xs font-medium text-slate-800">{aba.aba}</td>
                    <td className="px-4 py-3 text-xs text-slate-600">
                      {ROTULO_DESTINO[aba.destino] ?? aba.destino}
                      {aba.mensagem && <span className="block text-slate-400 mt-0.5">{aba.mensagem}</span>}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600">{aba.linhas_lidas || '—'}</td>
                    <td className="px-4 py-3 text-xs font-medium text-green-700">{aba.criados || '—'}</td>
                    <td className="px-4 py-3 text-xs text-slate-600">{aba.atualizados || '—'}</td>
                    <td className="px-4 py-3 text-xs text-red-600">{aba.removidos || '—'}</td>
                    <td className="px-4 py-3 text-xs text-slate-400">{aba.ignorados || '—'}</td>
                    <td className={`px-4 py-3 text-xs ${aba.problemas ? 'text-amber-600 font-medium' : 'text-slate-400'}`}>
                      {aba.problemas || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {resultado.padronizacoes.length > 0 && (
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100">
                <h3 className="font-semibold text-slate-900 text-sm font-display">Grafias padronizadas</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Variações do mesmo valor foram unificadas para os filtros e somas baterem.
                </p>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/60 text-xs text-slate-500">
                    <th className="text-left font-medium px-4 py-2.5">Campo</th>
                    <th className="text-left font-medium px-4 py-2.5">Como estava</th>
                    <th className="text-left font-medium px-4 py-2.5">Ficou</th>
                    <th className="text-right font-medium px-4 py-2.5">Registros</th>
                  </tr>
                </thead>
                <tbody>
                  {resultado.padronizacoes.slice(0, 15).map(p => (
                    <tr key={`${p.campo}-${p.para}`} className="border-b border-slate-50 last:border-0 text-xs">
                      <td className="px-4 py-2.5 text-slate-500">{ROTULO_CAMPO[p.campo] ?? p.campo}</td>
                      <td className="px-4 py-2.5 font-mono text-slate-500">{p.de.join(', ')}</td>
                      <td className="px-4 py-2.5 font-medium text-slate-800">{p.para}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{numero(p.quantidade)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {resultado.total_inconsistencias > 0 && (
            <div className="flex items-start gap-2 px-4 py-3 rounded-lg border border-amber-200 bg-amber-50 text-sm text-amber-800">
              <AlertTriangle size={16} className="flex-shrink-0 mt-0.5" />
              <span>
                {resultado.total_inconsistencias} alerta(s) registrado(s) — datas impossíveis, critérios de soma
                quebrados na planilha, budgets que não batem com a soma dos meses. Veja em
                &nbsp;<strong>Hist. de Importações</strong>.
              </span>
            </div>
          )}

          <div className="flex items-center justify-between">
            <button onClick={reiniciar} className="text-sm text-slate-500 hover:text-slate-700">
              Importar outra planilha
            </button>
            <div className="flex items-center gap-2">
              <button
                onClick={() => navigate('fin-orcamento')}
                className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium border border-slate-200 text-slate-700 hover:bg-slate-50"
              >
                <BarChart3 size={15} /> Orçamento × realizado
              </button>
              <button
                onClick={() => navigate('fin-dashboard')}
                className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium text-white hover:opacity-90"
                style={{ background: BRAND }}
              >
                <Eye size={15} /> Ver dashboard financeiro
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
