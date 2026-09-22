from pydantic import BaseModel

from app.schemas.processo import ProcessoOut


class Kpi(BaseModel):
    valor: float
    variacao_percentual: float | None = None
    positivo: bool = True


class KpisDashboard(BaseModel):
    total_processos: Kpi
    processos_ativos: Kpi
    processos_inativos: Kpi
    valor_causa_total: Kpi
    valor_risco_total: Kpi
    defesa_pendente: Kpi


class PontoSerie(BaseModel):
    mes: str
    processos: int
    valor_causa: float
    valor_risco: float


class ItemCategoria(BaseModel):
    label: str
    quantidade: int
    valor_risco: float = 0
    valor_causa: float = 0


class PontoAtencao(BaseModel):
    tipo: str
    texto: str
    quantidade: float
    severidade: str  # info | alerta | critico


class DashboardResponse(BaseModel):
    kpis: KpisDashboard
    evolucao: list[PontoSerie]
    por_natureza: list[ItemCategoria]
    por_fase: list[ItemCategoria]
    por_risco: list[ItemCategoria]
    por_posicao: list[ItemCategoria]
    risco_por_natureza: list[ItemCategoria]
    pontos_atencao: list[PontoAtencao]
    processos_recentes: list[ProcessoOut]


class FiltroOpcoes(BaseModel):
    """Valores distintos existentes no banco, para alimentar os selects."""

    naturezas: list[str]
    comarcas: list[str]
    varas: list[str]
    fases: list[str]
    escritorios: list[str]
    riscos: list[str]
    status: list[str]
    posicoes: list[str]


class InsightAnalise(BaseModel):
    texto: str
    tipo: str  # positivo | alerta | critico | info


class AnalisesResponse(BaseModel):
    evolucao: list[PontoSerie]
    naturezas_maior_exposicao: list[ItemCategoria]
    comarcas_maior_concentracao: list[ItemCategoria]
    fases_maior_volume: list[ItemCategoria]
    processos_alto_risco: int
    processos_sem_defesa: int
    processos_sem_movimentacao: int
    valor_risco_alto_critico: float
    insights: list[InsightAnalise]


class RelatorioFiltros(BaseModel):
    data_inicio: str | None = None
    data_fim: str | None = None
    status: str | None = None
    natureza: str | None = None
    fase: str | None = None
    posicao: str | None = None
    risco: str | None = None
    comarca: str | None = None
    escritorio: str | None = None


class RelatorioPreview(BaseModel):
    total_processos: int
    valor_causa_total: float
    valor_risco_total: float
    processos_ativos: int
    processos_criticos: int
    por_natureza: list[ItemCategoria]
    amostra: list[ProcessoOut]
