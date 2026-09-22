"""Filtros globais compartilhados pelo dashboard, processos, análises e relatórios."""

from dataclasses import dataclass, field
from datetime import date, timedelta

from fastapi import Query
from sqlalchemy import Select

from app.models.processo import Processo


@dataclass
class FiltrosProcesso:
    data_inicio: date | None = None
    data_fim: date | None = None
    status: str | None = None
    natureza: str | None = None
    comarca: str | None = None
    vara: str | None = None
    posicao: str | None = None
    fase: str | None = None
    escritorio: str | None = None
    risco: str | None = None
    busca: str | None = None
    # Filtros de acompanhamento usados pelas telas de Análises.
    defesa: bool | None = None
    sem_movimentacao_dias: int | None = None
    riscos: list[str] = field(default_factory=list)

    def aplicar(self, stmt: Select) -> Select:
        p = Processo
        if self.data_inicio:
            stmt = stmt.where(p.data_inicio >= self.data_inicio)
        if self.data_fim:
            stmt = stmt.where(p.data_inicio <= self.data_fim)
        if self.status:
            stmt = stmt.where(p.status == self.status)
        if self.natureza:
            stmt = stmt.where(p.natureza == self.natureza)
        if self.comarca:
            stmt = stmt.where(p.comarca == self.comarca)
        if self.vara:
            stmt = stmt.where(p.vara == self.vara)
        if self.posicao:
            stmt = stmt.where(p.posicao_renault == self.posicao)
        if self.fase:
            stmt = stmt.where(p.fase_processual == self.fase)
        if self.escritorio:
            stmt = stmt.where(p.escritorio == self.escritorio)
        if self.risco:
            stmt = stmt.where(p.risco == self.risco)
        if self.riscos:
            stmt = stmt.where(p.risco.in_(self.riscos))
        if self.defesa is not None:
            stmt = stmt.where(p.defesa_realizada.is_(self.defesa))
        if self.sem_movimentacao_dias is not None:
            limite = date.today() - timedelta(days=self.sem_movimentacao_dias)
            stmt = stmt.where((p.ultima_movimentacao.is_(None)) | (p.ultima_movimentacao < limite))
        if self.busca:
            termo = f"%{self.busca.strip()}%"
            stmt = stmt.where(
                p.numero_autos.ilike(termo)
                | p.autor_reu.ilike(termo)
                | p.comarca.ilike(termo)
                | p.vara.ilike(termo)
            )
        return stmt


def obter_filtros(
    data_inicio: date | None = Query(None, description="Data de início a partir de"),
    data_fim: date | None = Query(None, description="Data de início até"),
    status: str | None = Query(None),
    natureza: str | None = Query(None),
    comarca: str | None = Query(None),
    vara: str | None = Query(None),
    posicao: str | None = Query(None, description="Polo Ativo / Polo Passivo"),
    fase: str | None = Query(None),
    escritorio: str | None = Query(None),
    risco: str | None = Query(None, description="Baixo / Médio / Alto / Crítico"),
    riscos: list[str] | None = Query(None, description="Várias faixas de risco ao mesmo tempo"),
    defesa: bool | None = Query(None, description="true = defesa realizada, false = pendente"),
    sem_movimentacao_dias: int | None = Query(
        None, ge=1, description="Somente processos parados há mais de N dias"
    ),
    busca: str | None = Query(None, description="Número dos autos, parte, comarca ou vara"),
) -> FiltrosProcesso:
    return FiltrosProcesso(
        data_inicio=data_inicio,
        data_fim=data_fim,
        status=status,
        natureza=natureza,
        comarca=comarca,
        vara=vara,
        posicao=posicao,
        fase=fase,
        escritorio=escritorio,
        risco=risco,
        riscos=riscos or [],
        defesa=defesa,
        sem_movimentacao_dias=sem_movimentacao_dias,
        busca=busca,
    )
