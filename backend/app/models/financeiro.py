"""Controle de pagamentos e orçamento do Jurídico.

Espelha a planilha "Pagamentos Jurídico", que tem três tipos de aba:

  transacionais  Controle Lançamentos · Adiantamentos · Devoluções
  planejamento   RAP PAGAMENTOS · Honorários Variáveis · Mensais
  domínio        Base · RF MENSAL

Os VALORES das abas de resumo (Resultado, LGPD e as colunas PREVISTO/REALIZADO/GAP
do RAP) nunca são importados: são sempre calculados a partir dos lançamentos. Do
RAP e do Resultado importamos só o que não dá para deduzir — o budget, o layout
das linhas e o critério de soma de cada uma (lido das fórmulas SUMIF/SUMIFS).
"""

from datetime import date, datetime, timezone
from enum import StrEnum

from sqlalchemy import Date, DateTime, ForeignKey, Index, Integer, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class StatusLancamento(StrEnum):
    LANCAR_PGTO = "Lançar Pgto"
    RC_CRIADA = "RC Criada"
    PEDIDO_CONCLUIDO = "Pedido Concluído"
    PEDIDO_RECEPCIONADO = "Pedido Recepcionado"
    ENVIADO_PARA_PAGAMENTO = "Enviado para pagamento"
    PAGO = "Pago"


# Ordem do fluxo, do primeiro ao último estágio.
FLUXO_STATUS = [
    StatusLancamento.LANCAR_PGTO,
    StatusLancamento.RC_CRIADA,
    StatusLancamento.PEDIDO_CONCLUIDO,
    StatusLancamento.PEDIDO_RECEPCIONADO,
    StatusLancamento.ENVIADO_PARA_PAGAMENTO,
    StatusLancamento.PAGO,
]


class StatusAdiantamento(StrEnum):
    LANCAR = "Lançar adiantamento"
    LANCADO = "Adiantamento Lançado"
    BAIXA_LANCADA = "Baixa lançada"
    BAIXADO = "Adiantamento Baixado"


def derivar_status_lancamento(
    rc: object, numero_pedido: object, recepcao: object, envio: object, documento_pago: object
) -> str:
    """Mesma regra da coluna STATUS da planilha:

    =SE(U<>"";"Pago";SE(T<>"";"Enviado para pagamento";SE(N<>"";"Pedido Recepcionado";
     SE(M<>"";"Pedido Concluído";SE(L<>"";"RC Criada";"Lançar Pgto")))))

    O status é consequência dos campos do fluxo, não um campo digitado: vale
    tanto para a importação quanto para o que for editado no sistema.
    """

    def preenchido(valor: object) -> bool:
        return valor is not None and str(valor).strip() not in {"", "nan", "None"}

    if preenchido(documento_pago):
        return StatusLancamento.PAGO
    if preenchido(envio):
        return StatusLancamento.ENVIADO_PARA_PAGAMENTO
    if preenchido(recepcao):
        return StatusLancamento.PEDIDO_RECEPCIONADO
    if preenchido(numero_pedido):
        return StatusLancamento.PEDIDO_CONCLUIDO
    if preenchido(rc):
        return StatusLancamento.RC_CRIADA
    return StatusLancamento.LANCAR_PGTO


def derivar_status_adiantamento(chamado_adiantamento: object, chamado_baixa: object, documento_baixa: object) -> str:
    """Mesma regra da coluna Status da aba Adiantamentos:

    =SE(J<>"";"Adiantamento Baixado";SE(G<>"";"Baixa lançada";
     SE(E<>"";"Adiantamento Lançado";"Lançar adiantamento")))
    """

    def preenchido(valor: object) -> bool:
        return valor is not None and str(valor).strip() not in {"", "nan", "None"}

    if preenchido(documento_baixa):
        return StatusAdiantamento.BAIXADO
    if preenchido(chamado_baixa):
        return StatusAdiantamento.BAIXA_LANCADA
    if preenchido(chamado_adiantamento):
        return StatusAdiantamento.LANCADO
    return StatusAdiantamento.LANCAR


class TipoPagamento(StrEnum):
    INTERNO = "Interno"
    ADIANTAMENTO = "Adiantamento"


class Recorrencia(StrEnum):
    FIXO = "Fixo"
    FIXO_VALOR_VARIAVEL = "Fixo valor variável"
    VARIAVEL_PONTUAL = "Variável pontual"


class Lancamento(Base):
    """Uma linha da aba "Controle Lançamentos": um pagamento do Jurídico."""

    __tablename__ = "lancamentos"
    __table_args__ = (
        Index("ix_lancamentos_area_mes", "area", "mes_referencia_num"),
        Index("ix_lancamentos_edoa", "edoa"),
        Index("ix_lancamentos_status", "status"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)

    # Impressão digital da linha — a planilha não tem chave primária, então ela
    # é calculada a partir do conteúdo (ver services/financeiro.py). É o que
    # permite reimportar o arquivo sem duplicar nada.
    fingerprint: Mapped[str] = mapped_column(String(64), unique=True, index=True, nullable=False)

    status: Mapped[str] = mapped_column(String(40), default=StatusLancamento.LANCAR_PGTO, nullable=False)
    categoria: Mapped[str | None] = mapped_column(String(60), index=True)
    area: Mapped[str | None] = mapped_column(String(60), index=True)
    tipo_pagamento: Mapped[str | None] = mapped_column(String(30))
    referencia: Mapped[str | None] = mapped_column(String(60))
    motivo: Mapped[str | None] = mapped_column(String(60), index=True)
    valor: Mapped[float] = mapped_column(Numeric(18, 2), default=0, nullable=False)

    mes_referencia: Mapped[str | None] = mapped_column(String(20))
    mes_referencia_num: Mapped[int | None] = mapped_column(Integer)
    ano_referencia: Mapped[int | None] = mapped_column(Integer, index=True)
    data_pagamento: Mapped[date | None] = mapped_column(Date)
    envio_para_pagamento: Mapped[date | None] = mapped_column(Date)

    recorrencia: Mapped[str | None] = mapped_column(String(30))
    descricao: Mapped[str | None] = mapped_column(Text)

    # Rastreabilidade com o ERP / fluxo de compras
    rc: Mapped[str | None] = mapped_column(String(40))
    numero_pedido: Mapped[str | None] = mapped_column(String(40))
    recepcao: Mapped[str | None] = mapped_column(String(40))
    item: Mapped[str | None] = mapped_column(String(20))
    chamado: Mapped[str | None] = mapped_column(String(40), index=True)
    documento_pago: Mapped[str | None] = mapped_column(String(40))

    # Classificação orçamentária/contábil
    edoa: Mapped[str | None] = mapped_column(String(60))
    centro_custo: Mapped[str | None] = mapped_column(String(30))
    conta_contabil: Mapped[str | None] = mapped_column(String(30))

    linha_planilha: Mapped[int | None] = mapped_column(Integer)
    importacao_id: Mapped[int | None] = mapped_column(ForeignKey("importacoes.id", ondelete="SET NULL"))
    criado_em: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )
    atualizado_em: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    @property
    def pago(self) -> bool:
        return self.status == StatusLancamento.PAGO

    @property
    def manual(self) -> bool:
        """Cadastrado no sistema (não veio de planilha) — nunca é apagado por reimportação."""
        return self.importacao_id is None and self.fingerprint.startswith("manual-")


class Adiantamento(Base):
    """Adiantamento a escritório e sua baixa posterior."""

    __tablename__ = "adiantamentos"

    id: Mapped[int] = mapped_column(primary_key=True)
    fingerprint: Mapped[str] = mapped_column(String(64), unique=True, index=True, nullable=False)

    status: Mapped[str | None] = mapped_column(String(40), index=True)
    conferido_planilha: Mapped[bool] = mapped_column(default=False, nullable=False)
    area: Mapped[str | None] = mapped_column(String(60), index=True)
    doa: Mapped[str | None] = mapped_column(String(60))
    escritorio: Mapped[str | None] = mapped_column(String(160))

    valor: Mapped[float] = mapped_column(Numeric(18, 2), default=0, nullable=False)
    valor_excedente: Mapped[float] = mapped_column(Numeric(18, 2), default=0, nullable=False)
    valor_total: Mapped[float] = mapped_column(Numeric(18, 2), default=0, nullable=False)

    chamado_adiantamento: Mapped[str | None] = mapped_column(String(40))
    chamado_baixa: Mapped[str | None] = mapped_column(String(40))
    documento_baixa: Mapped[str | None] = mapped_column(String(40))

    observacao: Mapped[str | None] = mapped_column(Text)
    ano_referencia: Mapped[int | None] = mapped_column(Integer, index=True)

    linha_planilha: Mapped[int | None] = mapped_column(Integer)
    importacao_id: Mapped[int | None] = mapped_column(ForeignKey("importacoes.id", ondelete="SET NULL"))
    criado_em: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )

    @property
    def baixado(self) -> bool:
        """Adiantamento com baixa registrada (chamado de baixa ou documento)."""
        return bool(self.chamado_baixa or self.documento_baixa)

    @property
    def manual(self) -> bool:
        return self.importacao_id is None and self.fingerprint.startswith("manual-")


class Devolucao(Base):
    """Valor devolvido por um escritório."""

    __tablename__ = "devolucoes"

    id: Mapped[int] = mapped_column(primary_key=True)
    fingerprint: Mapped[str] = mapped_column(String(64), unique=True, index=True, nullable=False)

    area: Mapped[str | None] = mapped_column(String(60), index=True)
    fornecedor: Mapped[str | None] = mapped_column(String(160), index=True)
    codigo_banco: Mapped[str | None] = mapped_column(String(30))
    data_transferencia: Mapped[date | None] = mapped_column(Date)
    pasta_benner: Mapped[str | None] = mapped_column(String(80))
    valor_devolvido: Mapped[float] = mapped_column(Numeric(18, 2), default=0, nullable=False)
    chamado: Mapped[str | None] = mapped_column(String(40))
    documento: Mapped[str | None] = mapped_column(String(40))
    observacao: Mapped[str | None] = mapped_column(Text)
    ano_referencia: Mapped[int | None] = mapped_column(Integer, index=True)

    linha_planilha: Mapped[int | None] = mapped_column(Integer)
    importacao_id: Mapped[int | None] = mapped_column(ForeignKey("importacoes.id", ondelete="SET NULL"))
    criado_em: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )

    @property
    def manual(self) -> bool:
        return self.importacao_id is None and self.fingerprint.startswith("manual-")


class ItemOrcamento(Base):
    """Linha de planejamento orçamentário.

    Unifica as três abas de planejamento: RAP PAGAMENTOS (budget anual por EDOA),
    Honorários Variáveis (plano mês a mês) e Mensais (contratos recorrentes).
    O realizado NÃO fica aqui — é sempre calculado a partir dos lançamentos.
    """

    __tablename__ = "orcamento_itens"

    id: Mapped[int] = mapped_column(primary_key=True)
    fingerprint: Mapped[str] = mapped_column(String(64), unique=True, index=True, nullable=False)

    origem: Mapped[str] = mapped_column(String(60), nullable=False)  # nome da aba de origem
    # "edoa" = orçamento total do EDOA · "area" = quebra por área dentro do EDOA.
    # Somar os dois níveis contaria o mesmo dinheiro duas vezes.
    nivel: Mapped[str] = mapped_column(String(10), default="edoa", nullable=False, index=True)
    # A aba RAP traz dois blocos empilhados; o 2º é uma visão paralela por área.
    bloco: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    edoa: Mapped[str | None] = mapped_column(String(60), index=True)
    area: Mapped[str | None] = mapped_column(String(60), index=True)
    detalhamento: Mapped[str | None] = mapped_column(String(255))
    recorrencia: Mapped[str | None] = mapped_column(String(30))
    ano: Mapped[int] = mapped_column(Integer, nullable=False)

    budget_anual: Mapped[float] = mapped_column(Numeric(18, 2), default=0, nullable=False)
    valor_mensal_contratado: Mapped[float | None] = mapped_column(Numeric(18, 2))

    # --- Apresentação, como na aba RAP -----------------------------------
    # grupo = coluna EDOA da aba (repetida para as linhas de detalhe);
    # rotulo = coluna ÁREA como está escrita ("Consumidor - Condenação").
    grupo: Mapped[str | None] = mapped_column(String(80))
    rotulo: Mapped[str | None] = mapped_column(String(160))
    ordem: Mapped[int | None] = mapped_column(Integer)
    # Bloco 2 do RAP separa o budget de honorários em fixo e variável.
    budget_fixo: Mapped[float | None] = mapped_column(Numeric(18, 2))
    budget_variavel: Mapped[float | None] = mapped_column(Numeric(18, 2))

    # --- Regra do REALIZADO ------------------------------------------------
    # Extraída da fórmula SUMIF/SUMIFS da planilha: quais lançamentos somam
    # nesta linha. Assim o sistema reproduz exatamente o critério da planilha,
    # e o critério fica visível e editável na tela.
    filtro_edoa: Mapped[str | None] = mapped_column(String(160))
    filtro_area: Mapped[str | None] = mapped_column(String(160))
    filtro_recorrencia: Mapped[str | None] = mapped_column(String(60))
    # Na planilha, algumas linhas têm o realizado digitado à mão (sem fórmula).
    realizado_manual: Mapped[float | None] = mapped_column(Numeric(18, 2))
    # formula | inferida | manual | sem_regra
    regra_origem: Mapped[str | None] = mapped_column(String(20))

    linha_planilha: Mapped[int | None] = mapped_column(Integer)
    importacao_id: Mapped[int | None] = mapped_column(ForeignKey("importacoes.id", ondelete="SET NULL"))

    plano_mensal: Mapped[list["PlanoMensal"]] = relationship(
        back_populates="item", cascade="all, delete-orphan", order_by="PlanoMensal.mes"
    )


class PlanoMensal(Base):
    """Valor planejado de um item de orçamento em um mês (1-12)."""

    __tablename__ = "orcamento_plano_mensal"

    id: Mapped[int] = mapped_column(primary_key=True)
    item_id: Mapped[int] = mapped_column(
        ForeignKey("orcamento_itens.id", ondelete="CASCADE"), index=True, nullable=False
    )
    mes: Mapped[int] = mapped_column(Integer, nullable=False)
    valor: Mapped[float] = mapped_column(Numeric(18, 2), default=0, nullable=False)

    item: Mapped[ItemOrcamento] = relationship(back_populates="plano_mensal")


class ContaContabil(Base):
    """Plano de contas do Jurídico (aba RF MENSAL)."""

    __tablename__ = "contas_contabeis"

    id: Mapped[int] = mapped_column(primary_key=True)
    diretoria: Mapped[str | None] = mapped_column(String(60))
    grupo: Mapped[str | None] = mapped_column(String(60))
    centro_custo: Mapped[str] = mapped_column(String(30), nullable=False)
    conta: Mapped[str] = mapped_column(String(30), nullable=False)
    descricao: Mapped[str | None] = mapped_column(String(255))

    __table_args__ = (Index("ix_contas_centro_conta", "centro_custo", "conta", unique=True),)


class ExercicioFinanceiro(Base):
    """Parâmetros do ano orçamentário (célula "MÊS FECHAMENTO" da aba RAP)."""

    __tablename__ = "exercicios_financeiros"

    ano: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=False)
    mes_fechamento: Mapped[int] = mapped_column(Integer, default=12, nullable=False)
    arquivo_origem: Mapped[str | None] = mapped_column(String(255))
    atualizado_em: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )


class LinhaResultadoConfig(Base):
    """Layout da aba "Resultado": quais linhas o relatório mostra e em que ordem.

    O layout não dá para deduzir dos lançamentos — o rótulo "DOA" nem sempre é
    um EDOA ("ACORDOS CONSUMIDOR + SAC") e o IMPACTO (APCO, MASSA, APCE, G&A)
    só existe nesta aba. Por isso ele é importado como configuração; os
    VALORES continuam sempre calculados a partir dos lançamentos.
    """

    __tablename__ = "resultado_linhas"

    id: Mapped[int] = mapped_column(primary_key=True)
    ano: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    ordem: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    categoria: Mapped[str] = mapped_column(String(80), nullable=False)
    doa: Mapped[str | None] = mapped_column(String(120))
    impacto: Mapped[str | None] = mapped_column(String(60))

    # Critério de soma (extraído da fórmula da planilha). Vários EDOAs vêm
    # separados por "|" — ex.: "ACORDOS CONSUMIDOR|ACORDOS SAC".
    filtro_categoria: Mapped[str | None] = mapped_column(String(80))
    filtro_edoa: Mapped[str | None] = mapped_column(String(255))
    regra_origem: Mapped[str | None] = mapped_column(String(20))

    importacao_id: Mapped[int | None] = mapped_column(ForeignKey("importacoes.id", ondelete="SET NULL"))


class DominioFinanceiro(Base):
    """Listas de domínio da aba Base (áreas, fornecedores, motivos, EDOA...).

    Alimentam os selects das telas e a padronização da importação.
    """

    __tablename__ = "dominios_financeiros"
    __table_args__ = (Index("ix_dominio_tipo_valor", "tipo", "valor", unique=True),)

    id: Mapped[int] = mapped_column(primary_key=True)
    tipo: Mapped[str] = mapped_column(String(40), nullable=False, index=True)
    valor: Mapped[str] = mapped_column(String(160), nullable=False)
