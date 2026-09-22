"""Administração de usuários (restrito a Gestor/Administrador)."""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from pydantic import BaseModel, Field

from app.api.deps import exigir_administrador, exigir_gestor, usuario_atual
from app.core.database import get_db
from app.core.security import gerar_hash_senha, verificar_senha
from app.models.usuario import PerfilAcesso, Usuario
from app.schemas.usuario import UsuarioCreate, UsuarioOut, UsuarioUpdate

router = APIRouter(prefix="/usuarios", tags=["Usuários"])


class PerfilProprio(BaseModel):
    nome: str = Field(min_length=3, max_length=160)
    cargo: str | None = None


class TrocaSenha(BaseModel):
    senha_atual: str = Field(min_length=1, max_length=72)
    nova_senha: str = Field(min_length=6, max_length=72)


@router.get("", response_model=list[UsuarioOut])
def listar_usuarios(
    db: Session = Depends(get_db), _: Usuario = Depends(exigir_gestor)
) -> list[UsuarioOut]:
    usuarios = db.scalars(select(Usuario).order_by(Usuario.nome)).all()
    return [UsuarioOut.model_validate(u) for u in usuarios]


@router.post("", response_model=UsuarioOut, status_code=status.HTTP_201_CREATED)
def criar_usuario(
    dados: UsuarioCreate,
    db: Session = Depends(get_db),
    _: Usuario = Depends(exigir_administrador),
) -> UsuarioOut:
    email = dados.email.lower()
    if db.scalar(select(Usuario).where(Usuario.email == email)):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="Já existe um usuário com este e-mail."
        )

    usuario = Usuario(
        nome=dados.nome.strip(),
        email=email,
        senha_hash=gerar_hash_senha(dados.senha),
        cargo=dados.cargo,
        perfil=dados.perfil,
        ativo=True,
    )
    db.add(usuario)
    db.commit()
    db.refresh(usuario)
    return UsuarioOut.model_validate(usuario)


# As rotas /eu precisam vir ANTES de /{usuario_id}: o FastAPI resolve na ordem de
# declaração e /{usuario_id} capturaria o literal "eu".
@router.put("/eu", response_model=UsuarioOut)
def atualizar_proprio_perfil(
    dados: PerfilProprio,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(usuario_atual),
) -> UsuarioOut:
    """Qualquer usuário edita o próprio nome e cargo (não o perfil de acesso)."""
    usuario.nome = dados.nome.strip()
    usuario.cargo = dados.cargo
    db.commit()
    db.refresh(usuario)
    return UsuarioOut.model_validate(usuario)


@router.put("/eu/senha", response_model=UsuarioOut)
def alterar_propria_senha(
    dados: TrocaSenha,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(usuario_atual),
) -> UsuarioOut:
    if not verificar_senha(dados.senha_atual, usuario.senha_hash):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Senha atual incorreta.")

    usuario.senha_hash = gerar_hash_senha(dados.nova_senha)
    db.commit()
    db.refresh(usuario)
    return UsuarioOut.model_validate(usuario)


@router.put("/{usuario_id}", response_model=UsuarioOut)
def atualizar_usuario(
    usuario_id: int,
    dados: UsuarioUpdate,
    db: Session = Depends(get_db),
    solicitante: Usuario = Depends(exigir_administrador),
) -> UsuarioOut:
    usuario = db.get(Usuario, usuario_id)
    if usuario is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Usuário não encontrado.")

    alteracoes = dados.model_dump(exclude_unset=True)

    # Trava de segurança: o administrador não pode se autodesativar nem se rebaixar.
    if usuario.id == solicitante.id:
        if alteracoes.get("ativo") is False:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail="Você não pode desativar seu próprio usuário."
            )
        if alteracoes.get("perfil") and alteracoes["perfil"] != PerfilAcesso.ADMINISTRADOR:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Você não pode remover seu próprio perfil de administrador.",
            )

    if "senha" in alteracoes and alteracoes["senha"]:
        usuario.senha_hash = gerar_hash_senha(alteracoes.pop("senha"))
    alteracoes.pop("senha", None)

    for campo, valor in alteracoes.items():
        setattr(usuario, campo, valor)

    db.commit()
    db.refresh(usuario)
    return UsuarioOut.model_validate(usuario)


@router.patch("/{usuario_id}/status", response_model=UsuarioOut)
def alternar_status(
    usuario_id: int,
    db: Session = Depends(get_db),
    solicitante: Usuario = Depends(exigir_administrador),
) -> UsuarioOut:
    """Ativa/desativa o usuário (botão da tela de Usuários)."""
    usuario = db.get(Usuario, usuario_id)
    if usuario is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Usuário não encontrado.")
    if usuario.id == solicitante.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Você não pode desativar seu próprio usuário."
        )

    usuario.ativo = not usuario.ativo
    db.commit()
    db.refresh(usuario)
    return UsuarioOut.model_validate(usuario)
