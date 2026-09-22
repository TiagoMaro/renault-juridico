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
