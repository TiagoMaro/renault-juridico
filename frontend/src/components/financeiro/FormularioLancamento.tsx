/** Cadastro/edição de lançamento. O STATUS não é digitado: sai do fluxo RC → Pedido → Recepção → Envio → Pago. */

import { api } from '../../api/client';
import type { Lancamento, OpcoesFiltroFinanceiro } from '../../api/types';
import ModalFormulario, { type CampoFormulario } from './ModalFormulario';
import { MESES } from './comum';

interface Props {
  lancamento: Lancamento | null;
  opcoes: OpcoesFiltroFinanceiro | null;
  anoPadrao?: number;
  aoFechar: () => void;
  aoSalvar: () => void;
}

export default function FormularioLancamento({ lancamento, opcoes, anoPadrao, aoFechar, aoSalvar }: Props) {
  const campos: CampoFormulario[] = [
    { nome: 'valor', rotulo: 'Valor (R$)', tipo: 'numero', obrigatorio: true, grupo: 'Pagamento' },
    {
      nome: 'mes_referencia_num',
      rotulo: 'Mês de referência',
      tipo: 'select',
      obrigatorio: true,
      opcoes: MESES.map((nome, i) => ({ valor: i + 1, rotulo: nome })),
      grupo: 'Pagamento',
    },
    { nome: 'ano_referencia', rotulo: 'Ano (exercício)', tipo: 'numero', grupo: 'Pagamento' },
    { nome: 'area', rotulo: 'Área', opcoes: opcoes?.areas, grupo: 'Pagamento' },
    { nome: 'edoa', rotulo: 'EDOA', opcoes: opcoes?.edoas, grupo: 'Pagamento' },
    { nome: 'categoria', rotulo: 'Categoria', opcoes: opcoes?.categorias, grupo: 'Pagamento' },
    { nome: 'motivo', rotulo: 'Motivo', opcoes: opcoes?.motivos, grupo: 'Pagamento' },
    { nome: 'recorrencia', rotulo: 'Recorrência', opcoes: opcoes?.recorrencias, grupo: 'Pagamento' },
    { nome: 'tipo_pagamento', rotulo: 'Pagamento', opcoes: opcoes?.tipos_pagamento ?? ['Interno', 'Adiantamento'], grupo: 'Pagamento' },
    { nome: 'referencia', rotulo: 'Referência', grupo: 'Pagamento' },
    { nome: 'descricao', rotulo: 'Descrição', tipo: 'textarea', largo: true, grupo: 'Pagamento' },

    { nome: 'rc', rotulo: 'RC', grupo: 'Fluxo (define o status)' },
    { nome: 'numero_pedido', rotulo: 'Nº pedido', grupo: 'Fluxo (define o status)' },
    { nome: 'recepcao', rotulo: 'Recepção', grupo: 'Fluxo (define o status)' },
    { nome: 'item', rotulo: 'Item', grupo: 'Fluxo (define o status)' },
    { nome: 'chamado', rotulo: 'Chamado', grupo: 'Fluxo (define o status)' },
    { nome: 'envio_para_pagamento', rotulo: 'Envio para pagamento', tipo: 'data', grupo: 'Fluxo (define o status)' },
    { nome: 'documento_pago', rotulo: 'Pago / Nº documento', grupo: 'Fluxo (define o status)' },
    { nome: 'data_pagamento', rotulo: 'Data de pagamento', tipo: 'data', grupo: 'Fluxo (define o status)' },

    { nome: 'centro_custo', rotulo: 'Centro de custo', opcoes: opcoes?.centros_custo, grupo: 'Contábil' },
    { nome: 'conta_contabil', rotulo: 'Conta contábil', opcoes: opcoes?.contas_contabeis, grupo: 'Contábil' },
  ];

  const inicial = lancamento
    ? { ...lancamento }
    : { ano_referencia: anoPadrao ?? new Date().getFullYear(), tipo_pagamento: 'Interno' };

  const importado = lancamento && !lancamento.manual;

  return (
    <ModalFormulario
      titulo={lancamento ? 'Editar lançamento' : 'Novo lançamento'}
      subtitulo={
        importado
          ? `Veio da planilha (linha ${lancamento?.linha_planilha ?? '—'}). Uma nova importação do mesmo ano sobrescreve estas alterações.`
          : 'Lançamento feito no sistema — nunca é apagado por uma importação.'
      }
      campos={campos}
      inicial={inicial as Record<string, string | number | null>}
      aoFechar={aoFechar}
      aoSalvar={async valores => {
        if (lancamento) await api.financeiro.atualizarLancamento(lancamento.id, valores);
        else await api.financeiro.criarLancamento(valores);
        aoSalvar();
      }}
      aoExcluir={
        lancamento
          ? async () => {
              await api.financeiro.excluirLancamento(lancamento.id);
              aoSalvar();
            }
          : undefined
      }
    />
  );
}
