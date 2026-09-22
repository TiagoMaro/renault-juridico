from pydantic import BaseModel, EmailStr, Field

from app.models.usuario import PerfilAcesso
from app.schemas.usuario import UsuarioOut


class LoginRequest(BaseModel):
    email: EmailStr
    senha: str = Field(min_length=1, max_length=72)


class RegistroRequest(BaseModel):
    nome: str = Field(min_length=3, max_length=160)
    email: EmailStr
    senha: str = Field(min_length=6, max_length=72)
    cargo: str | None = None
    perfil: PerfilAcesso = PerfilAcesso.VISUALIZADOR


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    usuario: UsuarioOut
