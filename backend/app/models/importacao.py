"""Histórico de importações de planilha e inconsistências encontradas."""

from datetime import datetime, timezone
from enum import StrEnum

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class StatusImportacao(StrEnum):
    PROCESSANDO = "Processando"
    CONCLUIDO = "Concluído"
    CONCLUIDO_COM_ALERTAS = "Concluído com alertas"
    ERRO = "Erro"


class StatusInconsistencia(StrEnum):
    PENDENTE = "Pendente"
    CORRIGIDO = "Corrigido"
    IGNORADO = "Ignorado"
    REVISAR = "Revisar depois"


class TipoImportacao(StrEnum):
    PROCESSOS = "processos"
    FINANCEIRO = "financeiro"


class Importacao(Base):
    __tablename__ = "importacoes"

    id: Mapped[int] = mapped_column(primary_key=True)
    tipo: Mapped[str] = mapped_column(String(20), default=TipoImportacao.PROCESSOS, nullable=False, index=True)
    arquivo: Mapped[str] = mapped_column(String(255), nullable=False)
    escritorio: Mapped[str | None] = mapped_column(String(160))
    usuario_id: Mapped[int | None] = mapped_column(ForeignKey("usuarios.id", ondelete="SET NULL"))
    usuario_nome: Mapped[str | None] = mapped_column(String(160))

    total_processos: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    registros_validos: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    total_inconsistencias: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    criados: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    atualizados: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    status: Mapped[str] = mapped_column(String(30), default=StatusImportacao.PROCESSANDO, nullable=False)
    mensagem_erro: Mapped[str | None] = mapped_column(Text)
    duracao_ms: Mapped[int | None] = mapped_column(Integer)
    data: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )

    inconsistencias: Mapped[list["Inconsistencia"]] = relationship(
        back_populates="importacao", cascade="all, delete-orphan", order_by="Inconsistencia.linha"
    )


class Inconsistencia(Base):
    """Problema encontrado em uma linha da planilha (coluna faltando, data
    inválida, valor não numérico, status desconhecido...)."""

    __tablename__ = "inconsistencias"

    id: Mapped[int] = mapped_column(primary_key=True)
    importacao_id: Mapped[int] = mapped_column(
        ForeignKey("importacoes.id", ondelete="CASCADE"), index=True, nullable=False
    )
    aba: Mapped[str | None] = mapped_column(String(60))
    linha: Mapped[int] = mapped_column(Integer, nullable=False)
    campo: Mapped[str] = mapped_column(String(60), nullable=False)
    problema: Mapped[str] = mapped_column(String(255), nullable=False)
    valor_original: Mapped[str | None] = mapped_column(Text)
    numero_autos: Mapped[str | None] = mapped_column(String(60))
    bloqueante: Mapped[bool] = mapped_column(default=False, nullable=False)
    status: Mapped[str] = mapped_column(String(30), default=StatusInconsistencia.PENDENTE, nullable=False)

    importacao: Mapped[Importacao] = relationship(back_populates="inconsistencias")
