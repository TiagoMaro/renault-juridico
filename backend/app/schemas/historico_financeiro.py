from datetime import datetime

from pydantic import BaseModel, ConfigDict


class HistoricoFinanceiroOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    data: datetime
    usuario_nome: str | None
    entidade: str
    entidade_id: int
    acao: str
    resumo: str | None
    campo: str | None
    valor_anterior: str | None
    valor_novo: str | None
    origem: str


class HistoricoFinanceiroLista(BaseModel):
    itens: list[HistoricoFinanceiroOut]
    total: int
    pagina: int
    por_pagina: int
    total_paginas: int