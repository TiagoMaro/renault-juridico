"""Indicadores consolidados do Dashboard Jurídico.

Todos os números são calculados a partir dos processos gravados no banco —
nada é fixo no código. Os mesmos filtros globais valem para todos os blocos.
"""

from datetime import date, timedelta

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.api.deps import usuario_atual
from app.api.filtros import FiltrosProcesso, obter_filtros
from app.core.config import settings
from app.core.database import get_db
from app.models.processo import FaixaRisco, Processo, StatusProcesso
from app.models.usuario import Usuario
from app.schemas.dashboard import (
    DashboardResponse,
    ItemCategoria,
    Kpi,
    KpisDashboard,
    PontoAtencao,
    PontoSerie,
)
from app.schemas.processo import ProcessoOut

router = APIRouter(prefix="/dashboard", tags=["Dashboard"])

MESES_PT = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"]


def _primeiro_dia(referencia: date, meses_atras: int) -> date:
    """Primeiro dia do mês, deslocado N meses para trás (N negativo avança)."""
    total = (referencia.year * 12 + referencia.month - 1) - meses_atras
    return date(total // 12, total % 12 + 1, 1)


def _fim_do_mes(dia: date) -> date:
    """Último dia do mês do `dia` informado."""
    return _primeiro_dia(dia, -1) - timedelta(days=1)


def _variacao(atual: float, anterior: float) -> float | None:
    if anterior == 0:
        return None if atual == 0 else 100.0
    return round((atual - anterior) / anterior * 100, 1)


def montar_evolucao(processos: list[Processo], meses: int = 12) -> list[PontoSerie]:
    """Série acumulada dos últimos meses, a partir da data de início de cada processo.

    O acumulado é o que interessa ao jurídico: quantos processos a empresa
    carregava naquele mês, e quanto de causa/risco isso representava.
    """
    hoje = date.today()
    serie: list[PontoSerie] = []

    for indice in range(meses - 1, -1, -1):
        inicio_mes = _primeiro_dia(hoje, indice)
        fim_mes = _fim_do_mes(inicio_mes)
        ativos_ate_o_mes = [
            p for p in processos if p.data_inicio is not None and p.data_inicio <= fim_mes
        ]
        serie.append(
            PontoSerie(
                mes=f"{MESES_PT[inicio_mes.month - 1]}/{str(inicio_mes.year)[2:]}",
                processos=len(ativos_ate_o_mes),
                valor_causa=round(sum(float(p.valor_causa or 0) for p in ativos_ate_o_mes), 2),
                valor_risco=round(sum(float(p.valor_risco or 0) for p in ativos_ate_o_mes), 2),
            )
        )
    return serie


def _agrupar(processos: list[Processo], atributo: str) -> list[ItemCategoria]:
    acumulado: dict[str, dict[str, float]] = {}
    for processo in processos:
        chave = getattr(processo, atributo) or "Não informado"
        item = acumulado.setdefault(chave, {"quantidade": 0, "valor_risco": 0.0, "valor_causa": 0.0})
        item["quantidade"] += 1
        item["valor_risco"] += float(processo.valor_risco or 0)
        item["valor_causa"] += float(processo.valor_causa or 0)

    return sorted(
        (
            ItemCategoria(
                label=label,
                quantidade=int(dados["quantidade"]),
                valor_risco=round(dados["valor_risco"], 2),
                valor_causa=round(dados["valor_causa"], 2),
            )
            for label, dados in acumulado.items()
        ),
        key=lambda item: item.quantidade,
        reverse=True,
    )


@router.get("", response_model=DashboardResponse)
def obter_dashboard(
    db: Session = Depends(get_db),
    _: Usuario = Depends(usuario_atual),
    filtros: FiltrosProcesso = Depends(obter_filtros),
) -> DashboardResponse:
    processos = list(
        db.scalars(filtros.aplicar(select(Processo)).options(selectinload(Processo.movimentacoes)))
    )

    ativos = [p for p in processos if p.status == StatusProcesso.ATIVO]
    inativos = [p for p in processos if p.status == StatusProcesso.INATIVO]
    sem_defesa = [p for p in ativos if not p.defesa_realizada]
    valor_causa_total = round(sum(float(p.valor_causa or 0) for p in processos), 2)
    valor_risco_total = round(sum(float(p.valor_risco or 0) for p in processos), 2)

    evolucao = montar_evolucao(processos)
    mes_atual = evolucao[-1] if evolucao else None
    mes_anterior = evolucao[-2] if len(evolucao) > 1 else None

    kpis = KpisDashboard(
        total_processos=Kpi(
            valor=len(processos),
            variacao_percentual=_variacao(mes_atual.processos, mes_anterior.processos)
            if mes_atual and mes_anterior
            else None,
            positivo=True,
        ),
        processos_ativos=Kpi(valor=len(ativos), positivo=True),
        processos_inativos=Kpi(valor=len(inativos), positivo=True),
        valor_causa_total=Kpi(
            valor=valor_causa_total,
            variacao_percentual=_variacao(mes_atual.valor_causa, mes_anterior.valor_causa)
            if mes_atual and mes_anterior
            else None,
            positivo=False,
        ),
        valor_risco_total=Kpi(
            valor=valor_risco_total,
            variacao_percentual=_variacao(mes_atual.valor_risco, mes_anterior.valor_risco)
            if mes_atual and mes_anterior
            else None,
            positivo=False,
        ),
        defesa_pendente=Kpi(valor=len(sem_defesa), positivo=False),
    )

    # --- Pontos de atenção (calculados, não fixos) -------------------------
    limite_sem_movimentacao = date.today() - timedelta(days=settings.DIAS_SEM_MOVIMENTACAO_ALERTA)
    criticos = [p for p in processos if p.risco == FaixaRisco.CRITICO]
    alto_risco = [p for p in processos if p.risco in {FaixaRisco.ALTO, FaixaRisco.CRITICO}]
    parados = [
        p
        for p in ativos
        if p.ultima_movimentacao is None or p.ultima_movimentacao < limite_sem_movimentacao
    ]
    movimentados = [
        p for p in ativos if p.ultima_movimentacao and p.ultima_movimentacao >= date.today() - timedelta(days=30)
    ]
    exposicao_alto_risco = round(sum(float(p.valor_risco or 0) for p in alto_risco), 2)

    pontos_atencao: list[PontoAtencao] = []
    if sem_defesa:
        pontos_atencao.append(
            PontoAtencao(
                tipo="sem_defesa",
                texto=f"{len(sem_defesa)} processo(s) ativo(s) sem defesa registrada",
                quantidade=len(sem_defesa),
                severidade="alerta",
            )
        )
    if criticos:
        pontos_atencao.append(
            PontoAtencao(
                tipo="risco_critico",
                texto=f"{len(criticos)} processo(s) com risco crítico",
                quantidade=len(criticos),
                severidade="critico",
            )
        )
    if movimentados:
        pontos_atencao.append(
            PontoAtencao(
                tipo="movimentacao_recente",
                texto=f"{len(movimentados)} processo(s) com movimentação nos últimos 30 dias",
                quantidade=len(movimentados),
                severidade="info",
            )
        )
    if exposicao_alto_risco:
        pontos_atencao.append(
            PontoAtencao(
                tipo="exposicao_alto_risco",
                texto=f"R$ {exposicao_alto_risco:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
                + " concentrados em processos de risco alto/crítico",
                quantidade=exposicao_alto_risco,
                severidade="critico",
            )
        )
    if parados:
        pontos_atencao.append(
            PontoAtencao(
                tipo="sem_movimentacao",
                texto=(
                    f"{len(parados)} processo(s) sem movimentação há mais de "
                    f"{settings.DIAS_SEM_MOVIMENTACAO_ALERTA} dias"
                ),
                quantidade=len(parados),
                severidade="alerta",
            )
        )

    recentes = sorted(
        [p for p in ativos if p.ultima_movimentacao],
        key=lambda p: p.ultima_movimentacao,
        reverse=True,
    )[:8]

    def _saida(processo: Processo) -> ProcessoOut:
        item = ProcessoOut.model_validate(processo)
        item.total_movimentacoes = len(processo.movimentacoes)
        return item

    risco_ordem = {"Baixo": 0, "Médio": 1, "Alto": 2, "Crítico": 3}
    por_risco = sorted(_agrupar(processos, "risco"), key=lambda i: risco_ordem.get(i.label, 9))

    return DashboardResponse(
        kpis=kpis,
        evolucao=evolucao,
        por_natureza=_agrupar(processos, "natureza"),
        por_fase=_agrupar(processos, "fase_processual"),
        por_risco=por_risco,
        por_posicao=_agrupar(processos, "posicao_renault"),
        risco_por_natureza=sorted(
            _agrupar(processos, "natureza"), key=lambda item: item.valor_risco, reverse=True
        ),
        pontos_atencao=pontos_atencao,
        processos_recentes=[_saida(p) for p in recentes],
    )
