"""Contratos de entrada e saída do módulo financeiro."""

from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field, model_validator

MESES_POR_NOME = {
    nome: i
    for i, nome in enumerate(
        ["janeiro", "fevereiro", "marco", "abril", "maio", "junho",
         "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"],
        start=1,
    )
}


class LancamentoOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    status: str
    categoria: str | None
    area: str | None
    tipo_pagamento: str | None
    referencia: str | None
    motivo: str | None
    valor: float
    mes_referencia: str | None
    mes_referencia_num: int | None
    ano_referencia: int | None
    data_pagamento: date | None
    envio_para_pagamento: date | None
    recorrencia: str | None
    descricao: str | None
    rc: str | None
    numero_pedido: str | None
    recepcao: str | None
    item: str | None
    chamado: str | None
    documento_pago: str | None
    edoa: str | None
    centro_custo: str | None
    conta_contabil: str | None
    linha_planilha: int | None
    manual: bool = False


class LancamentoLista(BaseModel):
    itens: list[LancamentoOut]
    total: int
    total_valor: float
    pagina: int
    por_pagina: int
    total_paginas: int


class LancamentoEntrada(BaseModel):
    """Campos editáveis de um lançamento. O STATUS não entra: ele é consequência
    do fluxo (RC → Pedido → Recepção → Envio → Pago), como na planilha."""

    categoria: str | None = None
    area: str | None = None
    tipo_pagamento: str | None = None
    referencia: str | None = None
    motivo: str | None = None
    valor: float | None = None
    mes_referencia_num: int | None = Field(default=None, ge=1, le=12)
    # Aceita também o nome do mês ("Março"), como está na planilha.
    mes_referencia: str | None = Field(default=None, exclude=True)
    ano_referencia: int | None = Field(default=None, ge=2000, le=2100)
    data_pagamento: date | None = None
    envio_para_pagamento: date | None = None
    recorrencia: str | None = None
    descricao: str | None = None
    rc: str | None = None
    numero_pedido: str | None = None
    recepcao: str | None = None
    item: str | None = None
    chamado: str | None = None
    documento_pago: str | None = None
    edoa: str | None = None
    centro_custo: str | None = None
    conta_contabil: str | None = None


    @model_validator(mode="after")
    def _mes_por_nome(self):
        if self.mes_referencia and not self.mes_referencia_num:
            import unicodedata

            nome = unicodedata.normalize("NFKD", self.mes_referencia.strip().lower())
            nome = "".join(c for c in nome if not unicodedata.combining(c))
            numero = MESES_POR_NOME.get(nome)
            if numero is None:
                raise ValueError(f"Mês inválido: {self.mes_referencia}")
            self.mes_referencia_num = numero
        return self


# Mantido para compatibilidade com quem já usa o nome antigo.
LancamentoUpdate = LancamentoEntrada


class LancamentoCriar(LancamentoEntrada):
    valor: float = Field(gt=0)

    @model_validator(mode="after")
    def _mes_obrigatorio(self):
        if not self.mes_referencia_num:
            raise ValueError("Informe o mês de referência.")
        return self


class AdiantamentoOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    status: str | None
    conferido_planilha: bool
    area: str | None
    doa: str | None
    escritorio: str | None
    valor: float
    valor_excedente: float
    valor_total: float
    chamado_adiantamento: str | None
    chamado_baixa: str | None
    documento_baixa: str | None
    observacao: str | None = None
    ano_referencia: int | None = Field(default=None, ge=2000, le=2100)
    baixado: bool
    manual: bool = False


class AdiantamentoEntrada(BaseModel):
    area: str | None = None
    doa: str | None = None
    escritorio: str | None = None
    valor: float | None = Field(default=None, ge=0)
    valor_excedente: float | None = None
    chamado_adiantamento: str | None = None
    chamado_baixa: str | None = None
    documento_baixa: str | None = None
    conferido_planilha: bool | None = None
    observacao: str | None = None
    ano_referencia: int | None = Field(default=None, ge=2000, le=2100)


class DevolucaoOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    area: str | None
    fornecedor: str | None
    codigo_banco: str | None
    data_transferencia: date | None
    pasta_benner: str | None
    valor_devolvido: float
    chamado: str | None
    documento: str | None
    observacao: str | None
    ano_referencia: int | None = Field(default=None, ge=2000, le=2100)
    manual: bool = False


class DevolucaoEntrada(BaseModel):
    area: str | None = None
    fornecedor: str | None = None
    codigo_banco: str | None = None
    data_transferencia: date | None = None
    pasta_benner: str | None = None
    valor_devolvido: float | None = Field(default=None, gt=0)
    chamado: str | None = None
    documento: str | None = None
    observacao: str | None = None
    ano_referencia: int | None = Field(default=None, ge=2000, le=2100)


class ValorPorCategoria(BaseModel):
    label: str
    valor: float
    quantidade: int
    percentual: float = 0


class ValorPorMes(BaseModel):
    mes: int
    nome: str
    valor: float
    quantidade: int
    pago: float
    em_processamento: float


class KpiFinanceiro(BaseModel):
    valor: float
    quantidade: int = 0
    variacao_percentual: float | None = None


class DashboardFinanceiro(BaseModel):
    total_geral: KpiFinanceiro
    total_pago: KpiFinanceiro
    em_processamento: KpiFinanceiro
    ticket_medio: KpiFinanceiro
    adiantamentos_em_aberto: KpiFinanceiro
    devolucoes: KpiFinanceiro

    por_mes: list[ValorPorMes]
    por_area: list[ValorPorCategoria]
    por_edoa: list[ValorPorCategoria]
    por_motivo: list[ValorPorCategoria]
    por_status: list[ValorPorCategoria]
    por_recorrencia: list[ValorPorCategoria]
    por_centro_custo: list[ValorPorCategoria]
    alertas: list[str]


class OpcoesFiltroFinanceiro(BaseModel):
    status: list[str]
    areas: list[str]
    edoas: list[str]
    categorias: list[str]
    motivos: list[str]
    recorrencias: list[str]
    tipos_pagamento: list[str]
    centros_custo: list[str]
    contas_contabeis: list[str]
    anos: list[int]


class AbaAnalisada(BaseModel):
    aba: str
    destino: str | None
    descricao: str | None = None
    linhas: int = 0
    linha_cabecalho: int = 1
    colunas: list[str] = []
    observacao: str | None = None


class PreviewFinanceiro(BaseModel):
    arquivo: str
    ano_detectado: int
    origem_ano: str
    abas: list[AbaAnalisada]


class ResultadoAbaOut(BaseModel):
    aba: str
    destino: str
    linhas_lidas: int
    criados: int
    atualizados: int
    ignorados: int
    removidos: int = 0
    linha_cabecalho: int
    mensagem: str | None = None
    problemas: int = 0


class ImportacaoFinanceiraOut(BaseModel):
    importacao_id: int
    arquivo: str
    status: str
    data: datetime
    duracao_ms: int | None
    criados: int
    atualizados: int
    total_inconsistencias: int
    abas: list[ResultadoAbaOut]
    total_lancamentos: int
    valor_total_lancamentos: float
    ano: int
    origem_ano: str
    mes_fechamento: int | None = None
    removidos: int = 0
    padronizacoes: list[dict] = []
