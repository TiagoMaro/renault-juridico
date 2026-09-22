"""Configuração dos testes — banco SQLite temporário, isolado do PostgreSQL."""

import os
import tempfile
from pathlib import Path

import pytest

# Precisa vir antes de importar a aplicação (as settings são lidas na importação).
_ARQUIVO_TEMP = Path(tempfile.gettempdir()) / "teste_juridico.db"
os.environ["DATABASE_URL"] = f"sqlite:///{_ARQUIVO_TEMP}"
os.environ["SECRET_KEY"] = "chave-de-teste"

from fastapi.testclient import TestClient  # noqa: E402

from app.core.database import Base, SessionLocal, engine  # noqa: E402
from app.core.security import gerar_hash_senha  # noqa: E402
from app.main import app  # noqa: E402
from app.models.usuario import PerfilAcesso, Usuario  # noqa: E402


@pytest.fixture(scope="session", autouse=True)
def banco_limpo():
    if _ARQUIVO_TEMP.exists():
        _ARQUIVO_TEMP.unlink()
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)
    if _ARQUIVO_TEMP.exists():
        _ARQUIVO_TEMP.unlink()


@pytest.fixture(scope="session")
def cliente(banco_limpo) -> TestClient:
    return TestClient(app)


@pytest.fixture(scope="session")
def admin(banco_limpo) -> dict:
    dados = {"email": "teste.admin@renaultgeely.com.br", "senha": "renault@2026"}
    with SessionLocal() as db:
        if not db.query(Usuario).filter(Usuario.email == dados["email"]).first():
            db.add(
                Usuario(
                    nome="Admin de Teste",
                    email=dados["email"],
                    senha_hash=gerar_hash_senha(dados["senha"]),
                    cargo="QA",
                    perfil=PerfilAcesso.ADMINISTRADOR,
                    ativo=True,
                )
            )
            db.commit()
    return dados


@pytest.fixture(scope="session")
def cabecalho_auth(cliente: TestClient, admin: dict) -> dict:
    resposta = cliente.post("/api/auth/login", json=admin)
    assert resposta.status_code == 200, resposta.text
    return {"Authorization": f"Bearer {resposta.json()['access_token']}"}
