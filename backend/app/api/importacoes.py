"""Importação de planilhas jurídicas, histórico e tratamento de inconsistências."""

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.api.deps import exigir_analista, usuario_atual
from app.core.config import settings
from app.core.database import get_db
from app.models.importacao import Importacao, Inconsistencia, StatusInconsistencia
from app.models.processo import Processo, StatusProcesso
from app.models.usuario import Usuario
from app.schemas.importacao import (
    AtualizarInconsistencia,
    EtapaProcessamento,
    ImportacaoDetalhe,
    ImportacaoResultado,
    ImportacaoResumo,
    InconsistenciaOut,
    PreviewPlanilha,
)
from app.services import planilha as servico_planilha
from app.services.planilha import PlanilhaInvalida

router = APIRouter(prefix="/importacoes", tags=["Importação"])

MENSAGEM_PLANILHA_FINANCEIRA = (
    "Este arquivo é a planilha de pagamentos do Jurídico (abas Controle Lançamentos, RAP, "
    "Adiantamentos...). Importe-o em Financeiro → Importar planilha financeira."
)


def _recusar_se_financeira(conteudo: bytes, nome: str) -> None:
    from app.services.financeiro import parece_planilha_financeira

    if parece_planilha_financeira(conteudo, nome):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=MENSAGEM_PLANILHA_FINANCEIRA)


async def _ler_upload(arquivo: UploadFile) -> bytes:
    conteudo = await arquivo.read()
    limite = settings.MAX_UPLOAD_MB * 1024 * 1024
    if len(conteudo) > limite:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"Arquivo maior que o limite de {settings.MAX_UPLOAD_MB} MB.",
        )
    if not conteudo:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Arquivo vazio.")
    return conteudo


@router.post("/preview", response_model=PreviewPlanilha)
async def previsualizar(
    arquivo: UploadFile = File(...),
    _: Usuario = Depends(exigir_analista),
) -> PreviewPlanilha:
    """Lê o arquivo sem gravar nada: mostra as colunas reconhecidas e uma amostra."""
    conteudo = await _ler_upload(arquivo)
    _recusar_se_financeira(conteudo, arquivo.filename or "planilha")
    try:
        return PreviewPlanilha(**servico_planilha.montar_preview(conteudo, arquivo.filename or "planilha"))
    except PlanilhaInvalida as erro:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(erro)) from erro


@router.post("", response_model=ImportacaoResultado, status_code=status.HTTP_201_CREATED)
async def importar_planilha(
    arquivo: UploadFile = File(...),
    escritorio: str | None = Form(None),
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(exigir_analista),
) -> ImportacaoResultado:
    """Importa de fato: normaliza, grava os processos e registra as inconsistências."""
    conteudo = await _ler_upload(arquivo)
    _recusar_se_financeira(conteudo, arquivo.filename or "planilha")

    try:
        importacao, etapas = servico_planilha.importar(
            db, conteudo, arquivo.filename or "planilha", escritorio, usuario
        )
    except PlanilhaInvalida as erro:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(erro)) from erro

    ativos = db.scalar(
        select(func.count()).select_from(Processo).where(Processo.status == StatusProcesso.ATIVO)
    )
    risco_total = db.scalar(select(func.coalesce(func.sum(Processo.valor_risco), 0)))
    causa_total = db.scalar(select(func.coalesce(func.sum(Processo.valor_causa), 0)))

    return ImportacaoResultado(
        importacao=ImportacaoResumo.model_validate(importacao),
        etapas=[EtapaProcessamento(**etapa) for etapa in etapas],
        inconsistencias=[InconsistenciaOut.model_validate(i) for i in importacao.inconsistencias[:200]],
        processos_ativos=int(ativos or 0),
        valor_risco_total=float(risco_total or 0),
        valor_causa_total=float(causa_total or 0),
    )


@router.get("", response_model=list[ImportacaoResumo])
def listar_importacoes(
    db: Session = Depends(get_db),
    _: Usuario = Depends(usuario_atual),
    limite: int = 50,
) -> list[ImportacaoResumo]:
    importacoes = db.scalars(select(Importacao).order_by(Importacao.data.desc()).limit(limite)).all()
    return [ImportacaoResumo.model_validate(i) for i in importacoes]


@router.get("/{importacao_id}", response_model=ImportacaoDetalhe)
def obter_importacao(
    importacao_id: int, db: Session = Depends(get_db), _: Usuario = Depends(usuario_atual)
) -> ImportacaoDetalhe:
    importacao = db.get(Importacao, importacao_id, options=[selectinload(Importacao.inconsistencias)])
    if importacao is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Importação não encontrada.")
    return ImportacaoDetalhe.model_validate(importacao)


@router.patch("/inconsistencias/{inconsistencia_id}", response_model=InconsistenciaOut)
def atualizar_inconsistencia(
    inconsistencia_id: int,
    dados: AtualizarInconsistencia,
    db: Session = Depends(get_db),
    _: Usuario = Depends(exigir_analista),
) -> InconsistenciaOut:
    """Marca a inconsistência como corrigida, ignorada ou para revisar depois."""
    inconsistencia = db.get(Inconsistencia, inconsistencia_id)
    if inconsistencia is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Inconsistência não encontrada.")

    permitidos = {s.value for s in StatusInconsistencia}
    if dados.status not in permitidos:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Status inválido. Use um destes: {', '.join(sorted(permitidos))}.",
        )

    inconsistencia.status = dados.status
    db.commit()
    db.refresh(inconsistencia)
    return InconsistenciaOut.model_validate(inconsistencia)
