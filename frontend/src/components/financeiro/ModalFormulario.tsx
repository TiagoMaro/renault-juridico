/**
 * Modal genérico de cadastro/edição usado pelas telas financeiras.
 *
 * Cada tela descreve seus campos; o modal cuida de estado, validação simples,
 * erro da API e confirmação de exclusão.
 */

import { useState } from 'react';
import { AlertCircle, Loader2, Trash2, X } from 'lucide-react';

const BRAND = '#0035AD';

export type TipoCampo = 'texto' | 'numero' | 'data' | 'select' | 'textarea' | 'checkbox';

export interface CampoFormulario {
  nome: string;
  rotulo: string;
  tipo?: TipoCampo;
  /** Para select: lista fixa. Para texto: sugestões (datalist). */
  opcoes?: (string | { valor: string | number; rotulo: string })[];
  obrigatorio?: boolean;
  dica?: string;
  /** Ocupa as duas colunas do grid. */
  largo?: boolean;
  grupo?: string;
}

type Valor = string | number | boolean | null | undefined;

interface Props {
  titulo: string;
  subtitulo?: string;
  campos: CampoFormulario[];
  inicial: Record<string, Valor>;
  aoFechar: () => void;
  aoSalvar: (dados: Record<string, Valor>) => Promise<unknown>;
  aoExcluir?: () => Promise<unknown>;
  rodape?: React.ReactNode;
}

const inputClass =
  'w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-600/30 focus:border-blue-600';

function normalizar(campo: CampoFormulario, bruto: Valor): Valor {
  if (campo.tipo === 'checkbox') return Boolean(bruto);
  if (bruto === '' || bruto === undefined) return null;
  if (campo.tipo === 'numero') {
    const numero = Number(String(bruto).replace(',', '.'));
    return Number.isFinite(numero) ? numero : null;
  }
  if (typeof bruto === 'string') return bruto.trim() || null;
  return bruto;
}

export default function ModalFormulario({
  titulo,
  subtitulo,
  campos,
  inicial,
  aoFechar,
  aoSalvar,
  aoExcluir,
  rodape,
}: Props) {
  const [form, setForm] = useState<Record<string, Valor>>(() =>
    Object.fromEntries(campos.map(c => [c.nome, inicial[c.nome] ?? (c.tipo === 'checkbox' ? false : '')])),
  );
  const [salvando, setSalvando] = useState(false);
  const [confirmarExclusao, setConfirmarExclusao] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const alterar = (nome: string, valor: Valor) => setForm(f => ({ ...f, [nome]: valor }));

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro(null);
    const faltando = campos.filter(c => c.obrigatorio && normalizar(c, form[c.nome]) === null);
    if (faltando.length) {
      setErro(`Preencha: ${faltando.map(c => c.rotulo).join(', ')}.`);
      return;
    }
    setSalvando(true);
    try {
      await aoSalvar(Object.fromEntries(campos.map(c => [c.nome, normalizar(c, form[c.nome])])));
    } catch (problema) {
      setErro(problema instanceof Error ? problema.message : 'Não foi possível salvar.');
      setSalvando(false);
    }
  };

  const excluir = async () => {
    if (!aoExcluir) return;
    setSalvando(true);
    try {
      await aoExcluir();
    } catch (problema) {
      setErro(problema instanceof Error ? problema.message : 'Não foi possível excluir.');
      setSalvando(false);
    }
  };

  const grupos = Array.from(new Set(campos.map(c => c.grupo ?? '')));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xl w-full max-w-2xl max-h-[92vh] overflow-y-auto">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between sticky top-0 bg-white z-10">
          <div>
            <h2 className="font-semibold text-slate-900 font-display">{titulo}</h2>
            {subtitulo && <p className="text-xs text-slate-400 mt-0.5">{subtitulo}</p>}
          </div>
          <button type="button" onClick={aoFechar} className="text-slate-400 hover:text-slate-700" aria-label="Fechar">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={enviar} className="px-6 py-5 space-y-5">
          {grupos.map(grupo => (
            <div key={grupo || 'geral'} className="space-y-3">
              {grupo && <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">{grupo}</h3>}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {campos
                  .filter(c => (c.grupo ?? '') === grupo)
                  .map(campo => (
                    <label key={campo.nome} className={`block ${campo.largo ? 'md:col-span-2' : ''}`}>
                      {campo.tipo !== 'checkbox' && (
                        <span className="text-xs font-medium text-slate-600">
                          {campo.rotulo}
                          {campo.obrigatorio && <span className="text-red-500"> *</span>}
                        </span>
                      )}
                      <div className={campo.tipo === 'checkbox' ? '' : 'mt-1'}>
                        <Entrada campo={campo} valor={form[campo.nome]} aoAlterar={v => alterar(campo.nome, v)} />
                      </div>
                      {campo.dica && <span className="block text-[11px] text-slate-400 mt-1">{campo.dica}</span>}
                    </label>
                  ))}
              </div>
            </div>
          ))}

          {rodape}

          {erro && (
            <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-red-50 border border-red-100 text-sm text-red-700">
              <AlertCircle size={15} className="flex-shrink-0 mt-0.5" />
              {erro}
            </div>
          )}

          <div className="flex items-center justify-between gap-3 pt-2">
            <div>
              {aoExcluir &&
                (confirmarExclusao ? (
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-slate-600">Excluir definitivamente?</span>
                    <button
                      type="button"
                      onClick={excluir}
                      disabled={salvando}
                      className="px-3 py-1.5 rounded-lg bg-red-600 text-white text-xs font-medium hover:bg-red-700"
                    >
                      Sim, excluir
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmarExclusao(false)}
                      className="px-3 py-1.5 rounded-lg text-xs text-slate-500 hover:bg-slate-100"
                    >
                      Cancelar
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmarExclusao(true)}
                    className="flex items-center gap-1.5 text-sm text-red-600 hover:text-red-700"
                  >
                    <Trash2 size={14} /> Excluir
                  </button>
                ))}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={aoFechar}
                className="px-4 py-2 text-sm rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={salvando}
                className="flex items-center gap-2 px-4 py-2 text-sm rounded-lg text-white font-medium disabled:opacity-60"
                style={{ background: BRAND }}
              >
                {salvando && <Loader2 size={14} className="animate-spin" />}
                Salvar
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

function Entrada({ campo, valor, aoAlterar }: { campo: CampoFormulario; valor: Valor; aoAlterar: (v: Valor) => void }) {
  const texto = valor === null || valor === undefined ? '' : String(valor);
  const listaId = `lista-${campo.nome}`;

  switch (campo.tipo) {
    case 'select':
      return (
        <select value={texto} onChange={e => aoAlterar(e.target.value)} className={inputClass}>
          <option value="">—</option>
          {(campo.opcoes ?? []).map(opcao => {
            const item = typeof opcao === 'string' ? { valor: opcao, rotulo: opcao } : opcao;
            return (
              <option key={String(item.valor)} value={String(item.valor)}>
                {item.rotulo}
              </option>
            );
          })}
        </select>
      );
    case 'textarea':
      return <textarea rows={3} value={texto} onChange={e => aoAlterar(e.target.value)} className={inputClass} />;
    case 'checkbox':
      return (
        <span className="flex items-center gap-2 text-sm text-slate-700 mt-5">
          <input
            type="checkbox"
            checked={Boolean(valor)}
            onChange={e => aoAlterar(e.target.checked)}
            className="rounded border-slate-300"
          />
          {campo.rotulo}
        </span>
      );
    case 'numero':
      return (
        <input
          type="number"
          step="0.01"
          value={texto}
          onChange={e => aoAlterar(e.target.value)}
          className={`${inputClass} text-right tabular-nums`}
        />
      );
    case 'data':
      return <input type="date" value={texto} onChange={e => aoAlterar(e.target.value)} className={inputClass} />;
    default:
      return (
        <>
          <input
            value={texto}
            onChange={e => aoAlterar(e.target.value)}
            list={campo.opcoes?.length ? listaId : undefined}
            className={inputClass}
          />
          {campo.opcoes?.length ? (
            <datalist id={listaId}>
              {campo.opcoes.map(opcao => {
                const item = typeof opcao === 'string' ? { valor: opcao, rotulo: opcao } : opcao;
                return <option key={String(item.valor)} value={String(item.valor)} />;
              })}
            </datalist>
          ) : null}
        </>
      );
  }
}
