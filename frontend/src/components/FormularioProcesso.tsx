/** Modal de cadastro/edição de processo. */

import { useState } from 'react';
import { AlertCircle, Loader2, X } from 'lucide-react';

import { api } from '../api/client';
import type { Processo } from '../api/types';

const BRAND = '#0035AD';

const NATUREZAS = ['Trabalhista', 'Cível', 'Consumidor', 'Tributário', 'Contratual', 'Administrativo', 'Outros'];
const FASES = ['Conhecimento', 'Recurso', 'Execução', 'Cumprimento de sentença', 'Encerrado', 'Outros'];

interface Props {
  processo: Processo | null;
  aoFechar: () => void;
  aoSalvar: () => void;
}

export default function FormularioProcesso({ processo, aoFechar, aoSalvar }: Props) {
  const edicao = processo !== null;
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [form, setForm] = useState({
    numero_autos: processo?.numero_autos ?? '',
    autor_reu: processo?.autor_reu ?? '',
    status: processo?.status ?? 'Ativo',
    natureza: processo?.natureza ?? 'Trabalhista',
    vara: processo?.vara ?? '',
    comarca: processo?.comarca ?? '',
    data_inicio: processo?.data_inicio ?? '',
    posicao_renault: processo?.posicao_renault ?? 'Polo Passivo',
    fase_processual: processo?.fase_processual ?? 'Conhecimento',
    defesa_realizada: processo?.defesa_realizada ?? false,
    valor_causa: String(processo?.valor_causa ?? ''),
    valor_risco: String(processo?.valor_risco ?? ''),
    escritorio: processo?.escritorio ?? '',
    resumo: '',
  });

  const set = (campo: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [campo]: e.target.value }));

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro(null);
    setSalvando(true);

    const payload = {
      ...form,
      valor_causa: Number(form.valor_causa) || 0,
      valor_risco: Number(form.valor_risco) || 0,
      data_inicio: form.data_inicio || null,
      vara: form.vara || null,
      comarca: form.comarca || null,
      escritorio: form.escritorio || null,
      resumo: form.resumo || null,
    };

    try {
      if (edicao && processo) {
        const { numero_autos: _ignorado, ...atualizacao } = payload;
        await api.processos.atualizar(processo.id, atualizacao);
      } else {
        await api.processos.criar(payload);
      }
      aoSalvar();
    } catch (problema) {
      setErro(problema instanceof Error ? problema.message : 'Não foi possível salvar.');
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between sticky top-0 bg-white">
          <div>
            <h2 className="font-semibold text-slate-900 font-display">
              {edicao ? 'Editar processo' : 'Novo processo'}
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              {edicao
                ? 'As alterações ficam registradas no histórico do processo.'
                : 'Cadastro manual — o caminho normal é a importação da planilha.'}
            </p>
          </div>
          <button onClick={aoFechar} className="text-slate-400 hover:text-slate-700 transition-colors">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={enviar} className="px-6 py-5 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Campo label="Número dos Autos" obrigatorio>
              <input
                value={form.numero_autos}
                onChange={set('numero_autos')}
                disabled={edicao}
                required
                placeholder="0001234-56.2021.5.09.0015"
                className={`${inputClass} font-mono disabled:bg-slate-50 disabled:text-slate-500`}
              />
            </Campo>

            <Campo label="Autor/Réu" obrigatorio>
              <input value={form.autor_reu} onChange={set('autor_reu')} required className={inputClass} />
            </Campo>

            <Campo label="Natureza da ação">
              <select value={form.natureza} onChange={set('natureza')} className={inputClass}>
                {NATUREZAS.map(n => (
                  <option key={n}>{n}</option>
                ))}
              </select>
            </Campo>

            <Campo label="Fase processual">
              <select value={form.fase_processual} onChange={set('fase_processual')} className={inputClass}>
                {FASES.map(f => (
                  <option key={f}>{f}</option>
                ))}
              </select>
            </Campo>

            <Campo label="Vara">
              <input value={form.vara} onChange={set('vara')} className={inputClass} />
            </Campo>

            <Campo label="Comarca">
              <input value={form.comarca} onChange={set('comarca')} className={inputClass} />
            </Campo>

            <Campo label="Data de início">
              <input type="date" value={form.data_inicio ?? ''} onChange={set('data_inicio')} className={inputClass} />
            </Campo>

            <Campo label="Escritório responsável">
              <input value={form.escritorio} onChange={set('escritorio')} className={inputClass} />
            </Campo>

            <Campo label="Status">
              <select value={form.status} onChange={set('status')} className={inputClass}>
                <option>Ativo</option>
                <option>Inativo</option>
              </select>
            </Campo>

            <Campo label="Posição da Renault">
              <select value={form.posicao_renault} onChange={set('posicao_renault')} className={inputClass}>
                <option>Polo Passivo</option>
                <option>Polo Ativo</option>
              </select>
            </Campo>

            <Campo label="Valor da causa (R$)">
              <input
                type="number"
                step="0.01"
                min="0"
                value={form.valor_causa}
                onChange={set('valor_causa')}
                className={inputClass}
              />
            </Campo>

            <Campo label="Valor do risco (R$)">
              <input
                type="number"
                step="0.01"
                min="0"
                value={form.valor_risco}
                onChange={set('valor_risco')}
                className={inputClass}
              />
              <p className="text-xs text-slate-400 mt-1">A faixa de risco é calculada automaticamente.</p>
            </Campo>
          </div>

          {!edicao && (
            <Campo label="Resumo do caso">
              <textarea value={form.resumo} onChange={set('resumo')} rows={3} className={inputClass} />
            </Campo>
          )}

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.defesa_realizada}
              onChange={e => setForm(f => ({ ...f, defesa_realizada: e.target.checked }))}
              className="w-4 h-4 rounded border-slate-300"
              style={{ accentColor: BRAND }}
            />
            <span className="text-sm text-slate-700">Defesa realizada</span>
          </label>

          {erro && (
            <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg border border-red-200 bg-red-50 text-sm text-red-700">
              <AlertCircle size={15} className="flex-shrink-0 mt-0.5" />
              <span>{erro}</span>
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={aoFechar}
              className="px-4 py-2 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={salvando}
              className="flex items-center gap-2 px-4 py-2 text-sm rounded-lg text-white transition-colors hover:opacity-90 disabled:opacity-60"
              style={{ background: BRAND }}
            >
              {salvando && <Loader2 size={14} className="animate-spin" />}
              {edicao ? 'Salvar alterações' : 'Cadastrar processo'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Campo({
  label,
  obrigatorio,
  children,
}: {
  label: string;
  obrigatorio?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700 mb-1.5">
        {label} {obrigatorio && <span className="text-red-500">*</span>}
      </label>
      {children}
    </div>
  );
}

const inputClass =
  'w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:border-transparent bg-white transition-all';
