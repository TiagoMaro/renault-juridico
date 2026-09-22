"""Ponto de entrada da API — Renault Geely / Gestão Jurídica.

Suba com:  uvicorn app.main:app --reload
Documentação interativa: http://localhost:8000/docs
"""

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import (
    analises,
    auth,
    dashboard,
    financeiro,
    financeiro_cadastros,
    financeiro_relatorios,
    importacoes,
    processos,
    relatorios,
    usuarios,
)
from app.core.config import settings
from app.core.database import criar_tabelas

logging.basicConfig(level=logging.INFO, format="%(asctime)s | %(levelname)s | %(message)s")
logger = logging.getLogger(__name__)


@asynccontextmanager
async def ciclo_de_vida(app: FastAPI):
    logger.info("Criando/validando as tabelas do banco...")
    criar_tabelas()
    logger.info("API pronta em %s", settings.API_PREFIX)
    yield


app = FastAPI(
    title=settings.APP_NAME,
    description=(
        "API do sistema de Gestão e Análise Jurídica da Renault Geely do Brasil. "
        "Recebe as planilhas dos escritórios, consolida os processos e serve os "
        "indicadores do dashboard."
    ),
    version="1.0.0",
    lifespan=ciclo_de_vida,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["Content-Disposition"],
)

for modulo in (
    auth, processos, dashboard, importacoes, analises, relatorios, usuarios,
    financeiro, financeiro_relatorios, financeiro_cadastros,
):
    app.include_router(modulo.router, prefix=settings.API_PREFIX)


@app.get("/", tags=["Status"])
def raiz() -> dict:
    return {
        "sistema": settings.APP_NAME,
        "versao": "1.0.0",
        "documentacao": "/docs",
        "status": "online",
    }


@app.get(f"{settings.API_PREFIX}/health", tags=["Status"])
def health() -> dict:
    """Usado pelo docker-compose para saber quando a API subiu."""
    from sqlalchemy import text

    from app.core.database import engine

    try:
        with engine.connect() as conexao:
            conexao.execute(text("SELECT 1"))
        banco = "ok"
    except Exception as erro:  # noqa: BLE001
        banco = f"erro: {erro}"

    return {"api": "ok", "banco": banco}
