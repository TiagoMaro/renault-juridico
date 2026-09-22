"""Usuários do sistema e perfis de acesso."""

from datetime import datetime, timezone
from enum import StrEnum

from sqlalchemy import Boolean, DateTime, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class PerfilAcesso(StrEnum):
    ADMINISTRADOR = "Administrador"
    GESTOR = "Gestor"
    ANALISTA = "Analista"
    VISUALIZADOR = "Visualizador"


# Hierarquia usada para autorização: quanto maior, mais permissões.
NIVEL_PERFIL: dict[str, int] = {
    PerfilAcesso.VISUALIZADOR: 1,
    PerfilAcesso.ANALISTA: 2,
    PerfilAcesso.GESTOR: 3,
    PerfilAcesso.ADMINISTRADOR: 4,
}


class Usuario(Base):
    __tablename__ = "usuarios"

    id: Mapped[int] = mapped_column(primary_key=True)
    nome: Mapped[str] = mapped_column(String(160), nullable=False)
    email: Mapped[str] = mapped_column(String(160), unique=True, index=True, nullable=False)
    senha_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    cargo: Mapped[str | None] = mapped_column(String(120))
    perfil: Mapped[str] = mapped_column(String(20), default=PerfilAcesso.VISUALIZADOR, nullable=False)
    ativo: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    ultimo_acesso: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    data_cadastro: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )

    @property
    def status(self) -> str:
        return "Ativo" if self.ativo else "Inativo"

    @property
    def iniciais(self) -> str:
        partes = [p for p in self.nome.split() if p]
        if not partes:
            return "??"
        if len(partes) == 1:
            return partes[0][:2].upper()
        return (partes[0][0] + partes[-1][0]).upper()
