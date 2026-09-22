from datetime import datetime

from pydantic import BaseModel, ConfigDict


class InconsistenciaOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    linha: int
    campo: str
    problema: str
    valor_original: str | None
    numero_autos: str | None
    bloqueante: bool
    status: str


class ColunaDetectada(BaseModel):
    coluna_planilha: str
    campo_sistema: str | None
    reconhecida: bool


class PreviewPlanilha(BaseModel):
    """Resultado da leitura prévia do arquivo, antes de gravar no banco."""

    arquivo: str
    linha_cabecalho: int = 1
    total_linhas: int
    colunas: list[ColunaDetectada]
    colunas_obrigatorias_ausentes: list[str]
    amostra: list[dict]


class EtapaProcessamento(BaseModel):
    nome: str
    concluida: bool
    detalhe: str | None = None


class ImportacaoResumo(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    arquivo: str
    escritorio: str | None
    data: datetime
    usuario_nome: str | None
    total_processos: int
    registros_validos: int
    total_inconsistencias: int
    criados: int
    atualizados: int
    status: str
    duracao_ms: int | None


class ImportacaoDetalhe(ImportacaoResumo):
    mensagem_erro: str | None = None
    inconsistencias: list[InconsistenciaOut] = []


class ImportacaoResultado(BaseModel):
    """Retorno do POST de importação — alimenta a tela de resultado."""

    importacao: ImportacaoResumo
    etapas: list[EtapaProcessamento]
    inconsistencias: list[InconsistenciaOut]
    processos_ativos: int
    valor_risco_total: float
    valor_causa_total: float


class AtualizarInconsistencia(BaseModel):
    status: str
