from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field

from app.models.usuario import PerfilAcesso


class UsuarioBase(BaseModel):
    nome: str = Field(min_length=3, max_length=160)
    email: EmailStr
    cargo: str | None = None
    perfil: PerfilAcesso = PerfilAcesso.VISUALIZADOR


class UsuarioCreate(UsuarioBase):
    senha: str = Field(min_length=6, max_length=72)


class UsuarioUpdate(BaseModel):
    nome: str | None = Field(default=None, min_length=3, max_length=160)
    cargo: str | None = None
    perfil: PerfilAcesso | None = None
    ativo: bool | None = None
    senha: str | None = Field(default=None, min_length=6, max_length=72)


class UsuarioOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    nome: str
    email: EmailStr
    cargo: str | None
    perfil: str
    status: str
    iniciais: str
    ultimo_acesso: datetime | None
    data_cadastro: datetime
