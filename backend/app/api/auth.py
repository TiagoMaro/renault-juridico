"""Autenticação: login, registro e sessão atual."""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import usuario_atual
from app.core.database import get_db
from app.core.security import criar_access_token, gerar_hash_senha, verificar_senha
from app.models.usuario import PerfilAcesso, Usuario
from app.schemas.auth import LoginRequest, RegistroRequest, TokenResponse
from app.schemas.usuario import UsuarioOut

router = APIRouter(prefix="/auth", tags=["Autenticação"])


@router.post("/login", response_model=TokenResponse)
def login(dados: LoginRequest, db: Session = Depends(get_db)) -> TokenResponse:
    usuario = db.query(Usuario).filter(Usuario.email == dados.email.lower()).first()

    if usuario is None or not verificar_senha(dados.senha, usuario.senha_hash):
        # Mensagem propositalmente genérica: não revela se o e-mail existe.
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="E-mail ou senha incorretos."
        )
    if not usuario.ativo:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Usuário desativado. Procure o administrador do sistema.",
        )

    usuario.ultimo_acesso = datetime.now(timezone.utc)
    db.commit()
    db.refresh(usuario)

    token = criar_access_token(subject=usuario.email, perfil=usuario.perfil)
    return TokenResponse(access_token=token, usuario=UsuarioOut.model_validate(usuario))


@router.post("/registrar", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
def registrar(dados: RegistroRequest, db: Session = Depends(get_db)) -> TokenResponse:
    email = dados.email.lower()
    if db.query(Usuario).filter(Usuario.email == email).first():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="Já existe um usuário com este e-mail."
        )

    # Auto-cadastro nunca concede perfil administrativo — só um admin promove.
    perfil = dados.perfil if dados.perfil != PerfilAcesso.ADMINISTRADOR else PerfilAcesso.VISUALIZADOR

    usuario = Usuario(
        nome=dados.nome.strip(),
        email=email,
        senha_hash=gerar_hash_senha(dados.senha),
        cargo=dados.cargo,
        perfil=perfil,
        ativo=True,
    )
    db.add(usuario)
    db.commit()
    db.refresh(usuario)

    token = criar_access_token(subject=usuario.email, perfil=usuario.perfil)
    return TokenResponse(access_token=token, usuario=UsuarioOut.model_validate(usuario))


@router.get("/eu", response_model=UsuarioOut)
def sessao_atual(usuario: Usuario = Depends(usuario_atual)) -> UsuarioOut:
    return UsuarioOut.model_validate(usuario)
