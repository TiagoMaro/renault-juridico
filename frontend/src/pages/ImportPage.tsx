import { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Eye,
  File,
  Upload,
  X,
  XCircle,
} from 'lucide-react';

import { api } from '../api/client';
import type { ImportacaoResultado, Inconsistencia, PreviewPlanilha } from '../api/types';
import { Aviso } from '../components/Estados';
import type { NavigateFn } from '../types';
import { moedaCompacta, numero } from '../utils/formato';

const BRAND = '#0035AD';

type Step = 'upload' | 'preview' | 'processing' | 'results';

const COLUNAS_ESPERADAS = [
  'Status',
  'Autor/Réu',
  'Número Autos',
  'Natureza da ação',
  'Vara',
  'Comarca',
  'Data de início',
  'Posição da Renault',
  'Resumo do caso',
  'Defesa',
  'Fase processual',
  'Movimentações',
  'Valor da causa',
  'Valor do risco',
];

const ETAPAS_PADRAO = [
  'Arquivo recebido',
  'Validação das colunas',
  'Leitura dos processos',
  'Padronização dos dados',
  'Identificação de inconsistências',
  'Consolidação dos indicadores',
  'Dashboard atualizado',
];

interface Props {
  navigate: NavigateFn;
}

export default function ImportPage({ navigate }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<Step>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [escritorio, setEscritorio] = useState('');
  const [dragging, setDragging] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const [preview, setPreview] = useState<PreviewPlanilha | null>(null);
  const [carregandoPreview, setCarregandoPreview] = useState(false);

  const [etapaAtual, setEtapaAtual] = useState(0);
  const [resultado, setResultado] = useState<ImportacaoResultado | null>(null);
  const [inconsistencias, setInconsistencias] = useState<Inconsistencia[]>([]);

  // Animação das etapas enquanto o backend processa de verdade.
  useEffect(() => {
    if (step !== 'processing') return;
    setEtapaAtual(0);
    const intervalo = setInterval(() => {
      setEtapaAtual(anterior => Math.min(anterior + 1, ETAPAS_PADRAO.length - 2));
    }, 450);
    return () => clearInterval(intervalo);
  }, [step]);

  const selecionarArquivo = (f: File | undefined) => {
    if (!f) return;
    setErro(null);
    setPreview(null);
    setFile(f);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    selecionarArquivo(e.dataTransfer.files[0]);
  };

  const irParaPreview = async () => {
    if (!file) return;
    setErro(null);
    setCarregandoPreview(true);
    try {
      const dados = await api.importacoes.preview(file);
      setPreview(dados);
      setStep('preview');
    } catch (problema) {
      setErro(problema instanceof Error ? problema.message : 'Não foi possível ler a planilha.');
    } finally {
      setCarregandoPreview(false);
    }
  };

  const importar = async () => {
    if (!file) return;
    setErro(null);
    setStep('processing');
    try {
      const dados = await api.importacoes.importar(file, escritorio.trim() || undefined);
      setResultado(dados);
      setInconsistencias(dados.inconsistencias);
      setEtapaAtual(ETAPAS_PADRAO.length);
      setStep('results');
    } catch (problema) {
      setErro(problema instanceof Error ? problema.message : 'Falha ao importar a planilha.');
      setStep('preview');
    }
  };

  const tratarInconsistencia = async (id: number, status: string) => {
    try {
      const atualizada = await api.importacoes.atualizarInconsistencia(id, status);
      setInconsistencias(lista => lista.map(i => (i.id === id ? atualizada : i)));
    } catch {
      /* mantém o estado anterior em caso de falha */
    }
  };

  const reiniciar = () => {
    setStep('upload');
    setFile(null);
    setPreview(null);
    setResultado(null);
    setInconsistencias([]);
    setErro(null);
  };

  const etapasExibidas = resultado?.etapas.map(e => e.nome) ?? ETAPAS_PADRAO;
  const progresso = Math.round((Math.min(etapaAtual, etapasExibidas.length) / etapasExibidas.length) * 100);

  return (
    <div className="p-6 max-w-4xl">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-xl font-bold text-slate-900 font-display">Importar Planilha Jurídica</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Envie a planilha dos escritórios para atualizar o dashboard automaticamente
        </p>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-2 mb-6">
        {(['upload', 'preview', 'processing', 'results'] as Step[]).map((s, i) => {
          const labels = ['Upload', 'Pré-visualização', 'Processamento', 'Resultado'];
          const done = ['upload', 'preview', 'processing', 'results'].indexOf(step) > i;
          const active = step === s;
          return (
            <div key={s} className="flex items-center gap-2">
              <div
                className={`flex items-center gap-2 text-sm ${
                  active ? 'font-medium' : done ? 'text-green-600' : 'text-slate-400'
                }`}
              >
                <div
                  className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                    active ? 'text-white' : done ? 'bg-green-100 text-green-600' : 'bg-slate-100 text-slate-400'
                  }`}
                  style={active ? { background: BRAND } : {}}
                >
                  {done ? '✓' : i + 1}
                </div>
                <span className="hidden md:block">{labels[i]}</span>
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

      {/* Step: Upload */}
      {step === 'upload' && (
        <div className="space-y-4">
          <div
            onDragOver={e => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            onClick={() => inputRef.current?.click()}
            className={`border-2 border-dashed rounded-2xl p-16 text-center cursor-pointer transition-all ${
              dragging
                ? 'border-blue-400 bg-blue-50'
                : file
                  ? 'border-green-300 bg-green-50'
                  : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
            }`}
          >
            <input
              ref={inputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={e => selecionarArquivo(e.target.files?.[0])}
            />
            {file ? (
              <div>
                <div className="w-14 h-14 rounded-2xl bg-green-100 flex items-center justify-center mx-auto mb-4">
                  <CheckCircle2 size={28} className="text-green-600" />
                </div>
                <p className="font-semibold text-slate-900">{file.name}</p>
                <p className="text-sm text-slate-500 mt-1">
                  {(file.size / 1024).toFixed(1)} KB · Pronto para importar
                </p>
                <button
                  onClick={e => {
                    e.stopPropagation();
                    setFile(null);
                    setPreview(null);
                  }}
                  className="mt-3 inline-flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600 transition-colors"
                >
                  <X size={12} /> Remover arquivo
                </button>
              </div>
            ) : (
              <div>
                <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-4">
                  <Upload size={28} className="text-slate-400" />
                </div>
                <p className="font-semibold text-slate-800">Arraste sua planilha aqui ou selecione um arquivo</p>
                <p className="text-sm text-slate-500 mt-2">Formatos aceitos: XLSX, XLS, CSV</p>
                <button
                  type="button"
                  className="mt-5 px-5 py-2.5 rounded-lg text-sm font-medium text-white transition-colors hover:opacity-90"
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

          {file && (
            <div className="bg-white rounded-xl border border-slate-200 p-4 flex flex-col sm:flex-row sm:items-end gap-3">
              <div className="flex-1">
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  Escritório responsável <span className="text-slate-400 font-normal">(opcional)</span>
                </label>
                <input
                  value={escritorio}
                  onChange={e => setEscritorio(e.target.value)}
                  placeholder="Ex: Souza & Rodrigues Advogados"
                  className="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:border-transparent"
                  style={{ '--tw-ring-color': BRAND } as React.CSSProperties}
                />
              </div>
              <button
                onClick={irParaPreview}
                disabled={carregandoPreview}
                className="px-5 py-2.5 rounded-lg text-sm font-medium text-white transition-colors hover:opacity-90 disabled:opacity-60 whitespace-nowrap"
                style={{ background: BRAND }}
              >
                {carregandoPreview ? 'Lendo planilha...' : 'Pré-visualizar dados →'}
              </button>
            </div>
          )}

          {/* Format info */}
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <h3 className="text-sm font-semibold text-slate-800 mb-3">Colunas esperadas na planilha</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {COLUNAS_ESPERADAS.map(col => (
                <div key={col} className="flex items-center gap-1.5 text-xs text-slate-600">
                  <span className="w-1.5 h-1.5 rounded-full bg-slate-300 flex-shrink-0" />
                  {col}
                </div>
              ))}
            </div>
            <p className="text-xs text-slate-400 mt-3">
              Variações de escrita são reconhecidas automaticamente (maiúsculas, acentos, "Nº Autos", "Valor da causa
              (R$)"). Apenas <strong>Número Autos</strong> e <strong>Autor/Réu</strong> são obrigatórias.
            </p>
          </div>
        </div>
      )}

      {/* Step: Preview */}
      {step === 'preview' && preview && (
        <div className="space-y-4">
          {preview.colunas_obrigatorias_ausentes.length > 0 && (
            <Aviso
              texto={`Colunas obrigatórias não encontradas: ${preview.colunas_obrigatorias_ausentes.join(', ')}. A importação será recusada.`}
              tom="erro"
            />
          )}

          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-blue-50 rounded-lg flex items-center justify-center">
                  <File size={18} style={{ color: BRAND }} />
                </div>
                <div>
                  <p className="font-medium text-slate-900 text-sm">{preview.arquivo}</p>
                  <p className="text-xs text-slate-500">
                    Mostrando as primeiras {preview.amostra.length} linhas de {numero(preview.total_linhas)}
                  </p>
                </div>
              </div>
              <span className="px-2 py-1 bg-green-100 text-green-700 text-xs font-medium rounded-full">
                Pré-visualização
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/60">
                    {preview.colunas.map(coluna => (
                      <th
                        key={coluna.coluna_planilha}
                        className="text-left text-xs font-medium px-4 py-3 whitespace-nowrap"
                      >
                        <span className={coluna.reconhecida ? 'text-slate-600' : 'text-amber-600'}>
                          {coluna.coluna_planilha}
                        </span>
                        <span className="block text-[10px] font-normal mt-0.5 text-slate-400">
                          {coluna.reconhecida ? `→ ${coluna.campo_sistema}` : 'não reconhecida'}
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.amostra.map((linha, i) => (
                    <tr key={i} className="border-b border-slate-50 last:border-0">
                      {preview.colunas.map(coluna => (
                        <td
                          key={coluna.coluna_planilha}
                          className="px-4 py-3 text-xs text-slate-600 max-w-[200px] truncate"
                          title={linha[coluna.coluna_planilha] ?? ''}
                        >
                          {linha[coluna.coluna_planilha] ?? '—'}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: 'Total de linhas', value: numero(preview.total_linhas), color: 'text-slate-800' },
              {
                label: 'Colunas reconhecidas',
                value: `${preview.colunas.filter(c => c.reconhecida).length}/${preview.colunas.length}`,
                color: 'text-green-700',
              },
              {
                label: 'Colunas obrigatórias',
                value: preview.colunas_obrigatorias_ausentes.length === 0 ? 'OK' : 'Faltando',
                color: preview.colunas_obrigatorias_ausentes.length === 0 ? 'text-green-700' : 'text-red-600',
              },
              {
                label: 'Tamanho do arquivo',
                value: `${file ? (file.size / 1024).toFixed(1) : '—'} KB`,
                color: 'text-slate-800',
              },
            ].map(({ label, value, color }) => (
              <div key={label} className="bg-white rounded-xl border border-slate-200 p-4 text-center">
                <p className={`text-xl font-bold font-display ${color}`}>{value}</p>
                <p className="text-xs text-slate-500 mt-1">{label}</p>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between">
            <button
              onClick={() => setStep('upload')}
              className="text-sm text-slate-500 hover:text-slate-700 transition-colors"
            >
              ← Voltar
            </button>
            <button
              onClick={importar}
              disabled={preview.colunas_obrigatorias_ausentes.length > 0}
              className="px-5 py-2.5 rounded-lg text-sm font-medium text-white transition-colors hover:opacity-90 disabled:opacity-50"
              style={{ background: BRAND }}
            >
              Confirmar e importar
            </button>
          </div>
        </div>
      )}

      {/* Step: Processing */}
      {step === 'processing' && (
        <div className="bg-white rounded-xl border border-slate-200 p-10">
          <div className="text-center mb-8">
            <div
              className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4"
              style={{ background: '#EEF3FF' }}
            >
              <div
                className="w-8 h-8 border-t-transparent rounded-full animate-spin"
                style={{ borderColor: '#E2E8F0', borderTopColor: BRAND, borderWidth: '3px' }}
              />
            </div>
            <h2 className="text-lg font-bold text-slate-900 font-display">Analisando planilha</h2>
            <p className="text-sm text-slate-500 mt-1">Aguarde enquanto processamos os dados...</p>
          </div>

          <div className="mb-8">
            <div className="flex items-center justify-between text-xs text-slate-500 mb-2">
              <span>Progresso</span>
              <span>{progresso}%</span>
            </div>
            <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{ width: `${progresso}%`, background: BRAND }}
              />
            </div>
          </div>

          <div className="space-y-3">
            {ETAPAS_PADRAO.map((label, i) => {
              const done = i < etapaAtual;
              const active = i === etapaAtual;
              return (
                <div
                  key={label}
                  className={`flex items-center gap-3 p-3 rounded-lg transition-all ${active ? 'bg-blue-50' : ''}`}
                >
                  <div
                    className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 text-xs ${
                      done ? 'bg-green-100 text-green-600' : active ? 'text-white' : 'bg-slate-100 text-slate-400'
                    }`}
                    style={active ? { background: BRAND } : {}}
                  >
                    {done ? (
                      '✓'
                    ) : active ? (
                      <span className="w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin block" />
                    ) : (
                      i + 1
                    )}
                  </div>
                  <span
                    className={`text-sm ${done ? 'text-green-700' : active ? 'text-slate-900 font-medium' : 'text-slate-400'}`}
                  >
                    {label}
                  </span>
                  {done && <span className="ml-auto text-xs text-green-600 font-medium">✓ Concluído</span>}
                  {active && (
                    <span className="ml-auto text-xs font-medium" style={{ color: BRAND }}>
                      Em andamento...
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Step: Results */}
      {step === 'results' && resultado && (
        <div className="space-y-5">
          <div className="bg-white rounded-xl border border-slate-200 p-6">
            <div className="flex items-start gap-4">
              <div
                className={`w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0 ${
                  resultado.importacao.status === 'Erro' ? 'bg-red-100' : 'bg-green-100'
                }`}
              >
                {resultado.importacao.status === 'Erro' ? (
                  <XCircle size={28} className="text-red-600" />
                ) : (
                  <CheckCircle2 size={28} className="text-green-600" />
                )}
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-900 font-display">
                  {resultado.importacao.status === 'Erro' ? 'Importação com erro' : 'Importação concluída'}
                </h2>
                <p className="text-sm text-slate-500 mt-1">
                  {resultado.importacao.criados === 0 && resultado.importacao.atualizados === 0
                    ? 'Nenhuma mudança: todos os processos da planilha já estavam atualizados no sistema.'
                    : `${resultado.importacao.criados} processo(s) criado(s) e ${resultado.importacao.atualizados} atualizado(s).`}{' '}
                  Processado em {((resultado.importacao.duracao_ms ?? 0) / 1000).toFixed(1)}s — o dashboard já reflete
                  estes dados.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mt-6">
              {[
                {
                  label: 'Processos encontrados',
                  value: numero(resultado.importacao.total_processos),
                  color: '#0035AD',
                  bg: '#EEF3FF',
                },
                {
                  label: 'Registros válidos',
                  value: numero(resultado.importacao.registros_validos),
                  color: '#16A34A',
                  bg: '#F0FDF4',
                },
                {
                  label: 'Inconsistências',
                  value: numero(resultado.importacao.total_inconsistencias),
                  color: '#D97706',
                  bg: '#FFFBEB',
                },
                {
                  label: 'Processos ativos',
                  value: numero(resultado.processos_ativos),
                  color: '#0891B2',
                  bg: '#ECFEFF',
                },
                {
                  label: 'Valor em risco',
                  value: moedaCompacta(resultado.valor_risco_total),
                  color: '#EA580C',
                  bg: '#FFF7ED',
                },
              ].map(({ label, value, color, bg }) => (
                <div
                  key={label}
                  className="text-center p-4 rounded-xl border"
                  style={{ background: bg, borderColor: `${color}22` }}
                >
                  <p className="text-2xl font-bold font-display" style={{ color }}>
                    {value}
                  </p>
                  <p className="text-xs mt-1" style={{ color: '#64748B' }}>
                    {label}
                  </p>
                </div>
              ))}
            </div>

            {/* Etapas reais reportadas pelo backend */}
            <div className="mt-6 pt-5 border-t border-slate-100 grid grid-cols-1 md:grid-cols-2 gap-2">
              {resultado.etapas.map(etapa => (
                <div key={etapa.nome} className="flex items-center gap-2 text-xs text-slate-600">
                  <CheckCircle2 size={14} className="text-green-600 flex-shrink-0" />
                  <span className="font-medium">{etapa.nome}</span>
                  {etapa.detalhe && <span className="text-slate-400">· {etapa.detalhe}</span>}
                </div>
              ))}
            </div>
          </div>

          {/* Inconsistências */}
          {inconsistencias.length > 0 && (
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-3">
                <AlertTriangle size={16} className="text-amber-500" />
                <h3 className="font-semibold text-slate-900 text-sm">Inconsistências encontradas</h3>
                <span className="px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full text-xs font-medium">
                  {inconsistencias.length} registro(s)
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50/60">
                      {['Linha', 'Campo', 'Problema', 'Valor original', 'Status', 'Ações'].map(h => (
                        <th key={h} className="text-left text-xs font-medium text-slate-500 px-4 py-3">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {inconsistencias.map(inc => (
                      <tr key={inc.id} className="border-b border-slate-50 last:border-0">
                        <td className="px-4 py-3 text-xs font-mono text-slate-500 whitespace-nowrap">
                          Linha {inc.linha}
                        </td>
                        <td className="px-4 py-3 text-xs font-medium text-slate-700 whitespace-nowrap">
                          {inc.campo}
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-600">
                          {inc.problema}
                          {inc.bloqueante && (
                            <span className="ml-2 px-1.5 py-0.5 bg-red-100 text-red-700 rounded text-[10px] font-medium">
                              linha descartada
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-xs font-mono text-slate-500 max-w-[160px] truncate">
                          {inc.valor_original ?? '—'}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${
                              inc.status === 'Corrigido'
                                ? 'bg-green-100 text-green-700'
                                : inc.status === 'Ignorado'
                                  ? 'bg-slate-100 text-slate-500'
                                  : inc.status === 'Revisar depois'
                                    ? 'bg-blue-100 text-blue-700'
                                    : 'bg-amber-100 text-amber-700'
                            }`}
                          >
                            {inc.status}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          {inc.status === 'Pendente' && (
                            <div className="flex items-center gap-2 whitespace-nowrap">
                              <button
                                onClick={() => tratarInconsistencia(inc.id, 'Corrigido')}
                                className="text-xs text-blue-600 hover:text-blue-800 font-medium transition-colors"
                              >
                                Corrigir
                              </button>
                              <button
                                onClick={() => tratarInconsistencia(inc.id, 'Revisar depois')}
                                className="text-xs text-slate-500 hover:text-slate-700 transition-colors"
                              >
                                Revisar depois
                              </button>
                              <button
                                onClick={() => tratarInconsistencia(inc.id, 'Ignorado')}
                                className="text-xs text-slate-400 hover:text-slate-600 transition-colors"
                              >
                                Ignorar
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between">
            <button onClick={reiniciar} className="text-sm text-slate-500 hover:text-slate-700 transition-colors">
              Importar outra planilha
            </button>
            <button
              onClick={() => navigate('dashboard')}
              className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium text-white transition-colors hover:opacity-90"
              style={{ background: BRAND }}
            >
              <Eye size={15} /> Visualizar dashboard
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
