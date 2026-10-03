from datetime import date

from app.models.historico_financeiro import HistoricoFinanceiro

"""Trilha de auditoria: quais campos são registrados e como formatá-los."""

# Campos cuja alteração vira uma linha no histórico do processo.
CAMPOS_AUDITADOS: dict[str, str] = {
    "status": "Status",
    "fase_processual": "Fase Processual",
    "valor_causa": "Valor da Causa",
    "valor_risco": "Valor em Risco",
    "risco": "Risco",
    "defesa_realizada": "Defesa",
    "posicao_renault": "Posição Renault",
    "comarca": "Comarca",
    "vara": "Vara",
}


def formatar_moeda(valor: float) -> str:
    """1234.5 -> 'R$ 1.234,50' (padrão brasileiro)."""
    return "R$ " + f"{float(valor):,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")


def formatar_para_historico(campo: str, valor) -> str:
    if valor is None:
        return "—"
    if campo in {"valor_causa", "valor_risco"}:
        return formatar_moeda(valor)
    if campo == "defesa_realizada":
        return "Realizada" if valor else "Não realizada"
    return str(valor)


# --------------------------------------------------------------------------
# Financeiro
# --------------------------------------------------------------------------

CAMPOS_FINANCEIROS: dict[str, dict[str, str]] = {
    "lancamento": {
        "status": "Status",
        "categoria": "Categoria",
        "area": "Área",
        "tipo_pagamento": "Tipo de pagamento",
        "referencia": "Referência",
        "motivo": "Motivo",
        "valor": "Valor",
        "mes_referencia_num": "Mês de referência",
        "ano_referencia": "Ano de referência",
        "data_pagamento": "Data de pagamento",
        "envio_para_pagamento": "Envio para pagamento",
        "recorrencia": "Recorrência",
        "descricao": "Descrição",
        "rc": "RC",
        "numero_pedido": "Nº do pedido",
        "recepcao": "Recepção",
        "item": "Item",
        "chamado": "Chamado",
        "documento_pago": "Documento pago",
        "edoa": "EDOA",
        "centro_custo": "Centro de custo",
        "conta_contabil": "Conta contábil",
    },
    "adiantamento": {
        "status": "Status",
        "conferido_planilha": "Conferido na planilha",
        "area": "Área",
        "doa": "DOA",
        "escritorio": "Escritório",
        "valor": "Valor",
        "valor_excedente": "Valor excedente",
        "chamado_adiantamento": "Chamado do adiantamento",
        "chamado_baixa": "Chamado da baixa",
        "documento_baixa": "Documento da baixa",
        "observacao": "Observação",
        "ano_referencia": "Ano de referência",
    },
    "devolucao": {
        "area": "Área",
        "fornecedor": "Fornecedor",
        "codigo_banco": "Código do banco",
        "data_transferencia": "Data da transferência",
        "pasta_benner": "Pasta Benner",
        "valor_devolvido": "Valor devolvido",
        "chamado": "Chamado",
        "documento": "Documento",
        "observacao": "Observação",
        "ano_referencia": "Ano de referência",
    },
}

CAMPOS_MONETARIOS = {"valor", "valor_excedente", "valor_devolvido"}


def _normalizar(valor):
    """Enums viram texto; vazio vira None. Assim 'antes' e 'depois' são comparáveis."""
    valor = getattr(valor, "value", valor)
    return None if valor == "" else valor


def _formatar_financeiro(campo: str, valor) -> str:
    valor = _normalizar(valor)
    if valor is None:
        return "—"
    if campo in CAMPOS_MONETARIOS:
        return formatar_moeda(valor)
    if isinstance(valor, bool):
        return "Sim" if valor else "Não"
    if isinstance(valor, date):
        return valor.strftime("%d/%m/%Y")
    return str(valor)


def _mudou(campo: str, antes, depois) -> bool:
    if campo in CAMPOS_MONETARIOS:
        return abs(float(antes or 0) - float(depois or 0)) >= 0.01
    return _normalizar(antes) != _normalizar(depois)


def tirar_foto(registro, entidade: str) -> dict:
    """Copia os valores auditados ANTES de alterar o registro."""
    return {campo: getattr(registro, campo, None) for campo in CAMPOS_FINANCEIROS[entidade]}


def resumir(registro, entidade: str) -> str:
    """Texto curto que identifica o item, para o histórico fazer sentido mesmo depois de excluído."""
    if entidade == "lancamento":
        partes = [getattr(registro, "referencia", None), registro.area, registro.motivo]
        valor = registro.valor
    elif entidade == "adiantamento":
        partes = [registro.escritorio, registro.area, registro.chamado_adiantamento]
        valor = registro.valor
    else:
        partes = [registro.fornecedor, registro.area]
        valor = registro.valor_devolvido
    partes.append(formatar_moeda(valor or 0))
    return " · ".join(str(p) for p in partes if p)


def _nova_linha(entidade: str, registro, acao: str, usuario, **extra) -> HistoricoFinanceiro:
    return HistoricoFinanceiro(
        entidade=entidade,
        entidade_id=registro.id,
        acao=acao,
        usuario_id=usuario.id,
        usuario_nome=usuario.nome,
        resumo=resumir(registro, entidade),
        origem="edicao",
        **extra,
    )


def registrar_criacao(db, entidade: str, registro, usuario) -> None:
    db.add(_nova_linha(entidade, registro, "criacao", usuario))


def registrar_exclusao(db, entidade: str, registro, usuario) -> None:
    """Guarda uma cópia dos dados, porque depois do delete o histórico é o único registro."""
    rotulos = CAMPOS_FINANCEIROS[entidade]
    copia = "; ".join(
        f"{rotulo}: {_formatar_financeiro(campo, getattr(registro, campo, None))}"
        for campo, rotulo in rotulos.items()
        if _normalizar(getattr(registro, campo, None)) is not None
    )
    db.add(_nova_linha(entidade, registro, "exclusao", usuario, valor_anterior=copia))


def registrar_alteracoes(db, entidade: str, registro, antes: dict, usuario) -> None:
    """Compara a foto de antes com o estado atual e grava uma linha por campo que mudou."""
    for campo, rotulo in CAMPOS_FINANCEIROS[entidade].items():
        anterior, atual = antes.get(campo), getattr(registro, campo, None)
        if not _mudou(campo, anterior, atual):
            continue
        db.add(
            _nova_linha(
                entidade,
                registro,
                "alteracao",
                usuario,
                campo=rotulo,
                valor_anterior=_formatar_financeiro(campo, anterior),
                valor_novo=_formatar_financeiro(campo, atual),
            )
        )