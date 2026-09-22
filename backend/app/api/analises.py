"""Análises aprofundadas e insights gerados a partir dos dados reais."""

from datetime import date, timedelta

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.dashboard import _agrupar, montar_evolucao
from app.api.deps import usuario_atual
from app.api.filtros import FiltrosProcesso, obter_filtros
from app.core.config import settings
from app.core.database import get_db
from app.models.processo import FaixaRisco, Processo, StatusProcesso
from app.models.usuario import Usuario
from app.schemas.dashboard import AnalisesResponse, InsightAnalise
from app.services.auditoria import formatar_moeda

router = APIRouter(prefix="/analises", tags=["Análises"])


def gerar_insights(processos: list[Processo]) -> list[InsightAnalise]:
    """Frases de leitura executiva derivadas dos números do banco."""
    insights: list[InsightAnalise] = []
    total = len(processos)
    if total == 0:
        return [
            InsightAnalise(
                texto="Nenhum processo importado ainda. Importe uma planilha para gerar as análises.",
                tipo="info",
            )
        ]

    risco_total = sum(float(p.valor_risco or 0) for p in processos)

    # 1. Natureza que concentra mais volume e mais exposição
    por_natureza = _agrupar(processos, "natureza")
    if por_natureza:
        principal = por_natureza[0]
        participacao_volume = principal.quantidade / total * 100
        participacao_risco = (principal.valor_risco / risco_total * 100) if risco_total else 0
        insights.append(
            InsightAnalise(
                texto=(
                    f"Processos de natureza {principal.label} representam "
                    f"{participacao_volume:.0f}% do volume total e concentram "
                    f"{participacao_risco:.0f}% do valor em risco."
                ),
                tipo="alerta" if participacao_risco > participacao_volume else "info",
            )
        )

    # 2. Concentração da exposição nas faixas alta e crítica
    alto_critico = [p for p in processos if p.risco in {FaixaRisco.ALTO, FaixaRisco.CRITICO}]
    if alto_critico and risco_total:
        risco_alto = sum(float(p.valor_risco or 0) for p in alto_critico)
        insights.append(
            InsightAnalise(
                texto=(
                    f"Os processos classificados como alto e crítico representam "
                    f"{len(alto_critico) / total * 100:.0f}% dos processos, mas concentram "
                    f"{risco_alto / risco_total * 100:.0f}% da exposição financeira."
                ),
                tipo="critico",
            )
        )

    # 3. Defesa pendente
    sem_defesa = [p for p in processos if p.status == StatusProcesso.ATIVO and not p.defesa_realizada]
    if sem_defesa:
        exposicao = sum(float(p.valor_risco or 0) for p in sem_defesa)
        insights.append(
            InsightAnalise(
                texto=(
                    f"{len(sem_defesa)} processo(s) ativo(s) seguem sem defesa registrada, "
                    f"somando {formatar_moeda(exposicao)} em risco."
                ),
                tipo="alerta",
            )
        )

    # 4. Comarca com maior concentração
    por_comarca = _agrupar(processos, "comarca")
    if por_comarca and por_comarca[0].label != "Não informado":
        comarca = por_comarca[0]
        insights.append(
            InsightAnalise(
                texto=(
                    f"A comarca de {comarca.label} concentra {comarca.quantidade} processo(s) "
                    f"({comarca.quantidade / total * 100:.0f}% do total), "
                    f"com {formatar_moeda(comarca.valor_risco)} em risco."
                ),
                tipo="info",
            )
        )

    # 5. Processos parados
    limite = date.today() - timedelta(days=settings.DIAS_SEM_MOVIMENTACAO_ALERTA)
    parados = [
        p
        for p in processos
        if p.status == StatusProcesso.ATIVO
        and (p.ultima_movimentacao is None or p.ultima_movimentacao < limite)
    ]
    if parados:
        insights.append(
            InsightAnalise(
                texto=(
                    f"{len(parados)} processo(s) ativo(s) estão sem movimentação há mais de "
                    f"{settings.DIAS_SEM_MOVIMENTACAO_ALERTA} dias — vale cobrar posição do escritório."
                ),
                tipo="alerta",
            )
        )

    # 6. Posição processual
    passivos = [p for p in processos if p.posicao_renault == "Polo Passivo"]
    if passivos:
        insights.append(
            InsightAnalise(
                texto=(
                    f"A Renault figura no polo passivo em {len(passivos) / total * 100:.0f}% dos casos, "
                    f"o que explica a concentração da exposição financeira."
                ),
                tipo="info",
            )
        )

    return insights


@router.get("", response_model=AnalisesResponse)
def obter_analises(
    db: Session = Depends(get_db),
    _: Usuario = Depends(usuario_atual),
    filtros: FiltrosProcesso = Depends(obter_filtros),
) -> AnalisesResponse:
    processos = list(db.scalars(filtros.aplicar(select(Processo))))

    limite = date.today() - timedelta(days=settings.DIAS_SEM_MOVIMENTACAO_ALERTA)
    ativos = [p for p in processos if p.status == StatusProcesso.ATIVO]
    alto_critico = [p for p in processos if p.risco in {FaixaRisco.ALTO, FaixaRisco.CRITICO}]

    return AnalisesResponse(
        evolucao=montar_evolucao(processos),
        naturezas_maior_exposicao=sorted(
            _agrupar(processos, "natureza"), key=lambda i: i.valor_risco, reverse=True
        )[:7],
        comarcas_maior_concentracao=_agrupar(processos, "comarca")[:7],
        fases_maior_volume=_agrupar(processos, "fase_processual"),
        processos_alto_risco=len(alto_critico),
        processos_sem_defesa=len([p for p in ativos if not p.defesa_realizada]),
        processos_sem_movimentacao=len(
            [p for p in ativos if p.ultima_movimentacao is None or p.ultima_movimentacao < limite]
        ),
        valor_risco_alto_critico=round(sum(float(p.valor_risco or 0) for p in alto_critico), 2),
        insights=gerar_insights(processos),
    )
