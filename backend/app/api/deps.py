"""Dependências compartilhadas: usuário autenticado e controle de perfil."""

from collections.abc import Callable

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import decodificar_token
from app.models.usuario import NIVEL_PERFIL, PerfilAcesso, Usuario

bearer = HTTPBearer(auto_error=False)

CREDENCIAIS_INVALIDAS = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="Sessão inválida ou expirada. Faça login novamente.",
    headers={"WWW-Authenticate": "Bearer"},
)


def usuario_atual(
    credenciais: HTTPAuthorizationCredentials | None = Depends(bearer),
    db: Session = Depends(get_db),
) -> Usuario:
    if credenciais is None:
        raise CREDENCIAIS_INVALIDAS

    payload = decodificar_token(credenciais.credentials)
    if not payload or not payload.get("sub"):
        raise CREDENCIAIS_INVALIDAS

    usuario = db.query(Usuario).filter(Usuario.email == payload["sub"]).first()
    if usuario is None:
        raise CREDENCIAIS_INVALIDAS
    if not usuario.ativo:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Usuário desativado.")
    return usuario


def exigir_perfil(perfil_minimo: PerfilAcesso) -> Callable[[Usuario], Usuario]:
    """Gera uma dependência que exige um nível mínimo de acesso.

    Visualizador < Analista < Gestor < Administrador
    """
    nivel_exigido = NIVEL_PERFIL[perfil_minimo]

    def verificar(usuario: Usuario = Depends(usuario_atual)) -> Usuario:
        if NIVEL_PERFIL.get(usuario.perfil, 0) < nivel_exigido:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Ação permitida apenas para o perfil {perfil_minimo} ou superior.",
            )
        return usuario

    return verificar


# Atalhos usados nas rotas
exigir_analista = exigir_perfil(PerfilAcesso.ANALISTA)
exigir_gestor = exigir_perfil(PerfilAcesso.GESTOR)
exigir_administrador = exigir_perfil(PerfilAcesso.ADMINISTRADOR)
