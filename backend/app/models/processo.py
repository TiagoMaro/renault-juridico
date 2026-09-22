"""Modelo de processo jurídico — espelha as colunas da planilha do escritório.

Colunas da planilha base recebida dos escritórios:
    Status | Autor/Réu | Número Autos | Natureza da ação | Vara | Comarca |
    Data de início | Posição da Renault | Resumo do caso | Defesa |
    Fase processual | Movimentações | Valor da causa | Valor do risco
"""

from datetime import date, datetime, timezone
from enum import StrEnum

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Index, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class StatusProcesso(StrEnum):
    ATIVO = "Ativo"
    INATIVO = "Inativo"


class PosicaoRenault(StrEnum):
    POLO_ATIVO = "Polo Ativo"
    POLO_PASSIVO = "Polo Passivo"


class FaixaRisco(StrEnum):
    BAIXO = "Baixo"
    MEDIO = "Médio"
    ALTO = "Alto"
    CRITICO = "Crítico"


class Processo(Base):
    __tablename__ = "processos"
    __table_args__ = (
        Index("ix_processos_status_natureza", "status", "natureza"),
        Index("ix_processos_risco", "risco"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)

    # --- Colunas vindas da planilha ---------------------------------------
    numero_autos: Mapped[str] = mapped_column(String(60), unique=True, index=True, nullable=False)
    status: Mapped[str] = mapped_column(String(20), default=StatusProcesso.ATIVO, nullable=False)
    autor_reu: Mapped[str] = mapped_column(String(255), nullable=False)
    natureza: Mapped[str] = mapped_column(String(60), default="Outros", nullable=False)
    vara: Mapped[str | None] = mapped_column(String(160))
    comarca: Mapped[str | None] = mapped_column(String(120), index=True)
    data_inicio: Mapped[date | None] = mapped_column(Date)
    posicao_renault: Mapped[str] = mapped_column(
        String(20), default=PosicaoRenault.POLO_PASSIVO, nullable=False
    )
    resumo: Mapped[str | None] = mapped_column(Text)
    defesa_realizada: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    fase_processual: Mapped[str] = mapped_column(String(60), default="Outros", nullable=False)
    movimentacoes_texto: Mapped[str | None] = mapped_column(Text)
    valor_causa: Mapped[float] = mapped_column(Numeric(18, 2), default=0, nullable=False)
    valor_risco: Mapped[float] = mapped_column(Numeric(18, 2), default=0, nullable=False)

    # --- Campos derivados / de controle -----------------------------------
    risco: Mapped[str] = mapped_column(String(20), default=FaixaRisco.BAIXO, nullable=False)
    escritorio: Mapped[str | None] = mapped_column(String(160), index=True)
    ultima_movimentacao: Mapped[date | None] = mapped_column(Date)
    importacao_id: Mapped[int | None] = mapped_column(ForeignKey("importacoes.id", ondelete="SET NULL"))
    criado_em: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )
    atualizado_em: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    movimentacoes: Mapped[list["Movimentacao"]] = relationship(
        back_populates="processo",
        cascade="all, delete-orphan",
        order_by="Movimentacao.data.desc()",
    )
    historico: Mapped[list["HistoricoAlteracao"]] = relationship(
        back_populates="processo",
        cascade="all, delete-orphan",
        order_by="HistoricoAlteracao.data.desc()",
    )


class Movimentacao(Base):
    """Andamento processual. Extraído da coluna "Movimentações" da planilha."""

    __tablename__ = "movimentacoes"

    id: Mapped[int] = mapped_column(primary_key=True)
    processo_id: Mapped[int] = mapped_column(
        ForeignKey("processos.id", ondelete="CASCADE"), index=True, nullable=False
    )
    data: Mapped[date | None] = mapped_column(Date)
    tipo: Mapped[str] = mapped_column(String(30), default="outros", nullable=False)
    descricao: Mapped[str] = mapped_column(Text, nullable=False)
    criado_em: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )

    processo: Mapped[Processo] = relationship(back_populates="movimentacoes")


class HistoricoAlteracao(Base):
    """Trilha de auditoria: o que mudou, quando, por quem.

    Alimentada tanto por edições manuais quanto por reimportações de planilha
    (quando um processo já existente chega com valores diferentes).
    """

    __tablename__ = "historico_alteracoes"

    id: Mapped[int] = mapped_column(primary_key=True)
    processo_id: Mapped[int] = mapped_column(
        ForeignKey("processos.id", ondelete="CASCADE"), index=True, nullable=False
    )
    usuario_id: Mapped[int | None] = mapped_column(ForeignKey("usuarios.id", ondelete="SET NULL"))
    usuario_nome: Mapped[str | None] = mapped_column(String(160))
    campo: Mapped[str] = mapped_column(String(60), nullable=False)
    valor_anterior: Mapped[str | None] = mapped_column(Text)
    valor_novo: Mapped[str | None] = mapped_column(Text)
    origem: Mapped[str] = mapped_column(String(30), default="edicao", nullable=False)  # edicao | importacao
    data: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )

    processo: Mapped[Processo] = relationship(back_populates="historico")
