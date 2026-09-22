from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field

from app.models.processo import FaixaRisco, PosicaoRenault, StatusProcesso


class MovimentacaoOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    data: date | None
    tipo: str
    descricao: str


class HistoricoOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    data: datetime
    usuario_nome: str | None
    campo: str
    valor_anterior: str | None
    valor_novo: str | None
    origem: str


class ProcessoBase(BaseModel):
    numero_autos: str = Field(min_length=3, max_length=60)
    status: StatusProcesso = StatusProcesso.ATIVO
    autor_reu: str = Field(min_length=1, max_length=255)
    natureza: str = "Outros"
    vara: str | None = None
    comarca: str | None = None
    data_inicio: date | None = None
    posicao_renault: PosicaoRenault = PosicaoRenault.POLO_PASSIVO
    resumo: str | None = None
    defesa_realizada: bool = False
    fase_processual: str = "Outros"
    movimentacoes_texto: str | None = None
    valor_causa: float = 0
    valor_risco: float = 0
    escritorio: str | None = None


class ProcessoCreate(ProcessoBase):
    pass


class ProcessoUpdate(BaseModel):
    status: StatusProcesso | None = None
    autor_reu: str | None = None
    natureza: str | None = None
    vara: str | None = None
    comarca: str | None = None
    data_inicio: date | None = None
    posicao_renault: PosicaoRenault | None = None
    resumo: str | None = None
    defesa_realizada: bool | None = None
    fase_processual: str | None = None
    valor_causa: float | None = None
    valor_risco: float | None = None
    escritorio: str | None = None


class ProcessoOut(BaseModel):
    """Versão usada nas tabelas/listagens."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    numero_autos: str
    status: str
    autor_reu: str
    natureza: str
    vara: str | None
    comarca: str | None
    data_inicio: date | None
    posicao_renault: str
    defesa_realizada: bool
    fase_processual: str
    valor_causa: float
    valor_risco: float
    risco: FaixaRisco
    escritorio: str | None
    ultima_movimentacao: date | None
    total_movimentacoes: int = 0


class ProcessoDetalhe(ProcessoOut):
    resumo: str | None = None
    movimentacoes_texto: str | None = None
    criado_em: datetime
    atualizado_em: datetime
    movimentacoes: list[MovimentacaoOut] = []
    historico: list[HistoricoOut] = []


class ProcessoLista(BaseModel):
    """Resposta paginada da listagem de processos."""

    itens: list[ProcessoOut]
    total: int
    pagina: int
    por_pagina: int
    total_paginas: int
