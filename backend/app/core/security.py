"""Hash de senha e emissão/validação de token JWT."""

from datetime import datetime, timedelta, timezone

from jose import JWTError, jwt
from passlib.context import CryptContext

from app.core.config import settings

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def gerar_hash_senha(senha: str) -> str:
    # bcrypt trunca em 72 bytes; cortamos antes para evitar erro em senhas longas.
    return pwd_context.hash(senha[:72])


def verificar_senha(senha: str, senha_hash: str) -> bool:
    try:
        return pwd_context.verify(senha[:72], senha_hash)
    except ValueError:
        return False


def criar_access_token(subject: str, perfil: str, expira_em_minutos: int | None = None) -> str:
    expira = datetime.now(timezone.utc) + timedelta(
        minutes=expira_em_minutos or settings.ACCESS_TOKEN_EXPIRE_MINUTES
    )
    payload = {"sub": subject, "perfil": perfil, "exp": expira}
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def decodificar_token(token: str) -> dict | None:
    try:
        return jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
    except JWTError:
        return None
