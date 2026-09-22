"""Configuração central da aplicação.

Todos os parâmetros podem ser sobrescritos por variáveis de ambiente
(ou por um arquivo .env na raiz de `backend/`).
"""

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # --- Aplicação ---------------------------------------------------------
    APP_NAME: str = "Renault Geely — Gestão Jurídica"
    API_PREFIX: str = "/api"
    DEBUG: bool = False

    # --- Banco de dados ----------------------------------------------------
    # Em produção/dev com Docker: postgresql+psycopg2://user:senha@db:5432/juridico
    DATABASE_URL: str = "postgresql+psycopg2://juridico:juridico@localhost:5432/juridico"

    # --- Segurança ---------------------------------------------------------
    SECRET_KEY: str = "troque-esta-chave-em-producao-com-openssl-rand-hex-32"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 8  # jornada de trabalho

    # --- CORS --------------------------------------------------------------
    CORS_ORIGINS: str = "http://localhost:5173,http://localhost:4173,http://localhost:8443,http://127.0.0.1:5173"

    # --- Regras de negócio: faixas de risco --------------------------------
    # Classificação automática a partir do "Valor do risco" da planilha.
    RISCO_CRITICO_MIN: float = 1_000_000.0
    RISCO_ALTO_MIN: float = 300_000.0
    RISCO_MEDIO_MIN: float = 50_000.0
    # Processo ativo sem defesa registrada sobe uma faixa de risco.
    RISCO_AGRAVA_SEM_DEFESA: bool = True

    # --- Importação --------------------------------------------------------
    MAX_UPLOAD_MB: int = 25
    DIAS_SEM_MOVIMENTACAO_ALERTA: int = 90

    @property
    def cors_origins_list(self) -> list[str]:
        return [origem.strip() for origem in self.CORS_ORIGINS.split(",") if origem.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
