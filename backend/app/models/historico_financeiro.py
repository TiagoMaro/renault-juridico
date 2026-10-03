"""Trilha de auditoria do módulo financeiro."""

from datetime import datetime, timezone

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class HistoricoFinanceiro(Base):
    """Quem criou, alterou ou excluiu lançamentos, adiantamentos e devoluções."""

    __tablename__ = "historico_financeiro"

    id: Mapped[int] = mapped_column(primary_key=True)
    entidade: Mapped[str] = mapped_column(String(20), index=True, nullable=False)  # lancamento | adiantamento | devolucao
    # Sem ForeignKey de propósito: o histórico precisa sobreviver à exclusão do item.
    entidade_id: Mapped[int] = mapped_column(Integer, index=True, nullable=False)
    acao: Mapped[str] = mapped_column(String(20), nullable=False)  # criacao | alteracao | exclusao
    usuario_id: Mapped[int | None] = mapped_column(ForeignKey("usuarios.id", ondelete="SET NULL"))
    usuario_nome: Mapped[str | None] = mapped_column(String(160))
    resumo: Mapped[str | None] = mapped_column(String(300))  # identifica o item (referência, área, valor)
    campo: Mapped[str | None] = mapped_column(String(60))
    valor_anterior: Mapped[str | None] = mapped_column(Text)
    valor_novo: Mapped[str | None] = mapped_column(Text)
    origem: Mapped[str] = mapped_column(String(30), default="edicao", nullable=False)
    data: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), index=True, nullable=False
    )