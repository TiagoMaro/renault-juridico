"""Módulo financeiro: lançamentos, adiantamentos, devoluções e orçamento.

Os resumos que na planilha são tabelas dinâmicas (abas Resultado e LGPD, e as
colunas PREVISTO/REALIZADO/GAP do RAP) aqui são sempre CALCULADOS a partir dos
lançamentos — nunca importados.
"""

from __future__ import annotations

import io
from dataclasses import dataclass
from datetime import date, datetime, timezone

import pandas as pd
from fastapi import APIRouter, Depends, File, HTTPException, Query, Response, UploadFile, status
from sqlalchemy import Select, case, func, select
from sqlalchemy.orm import Session

from app.api.deps import exigir_analista, usuario_atual
from app.core.config import settings
from app.core.database import get_db
from app.models.financeiro import (
    Adiantamento,
    Devolucao,
    DominioFinanceiro,
    Lancamento,
    StatusAdiantamento,
    StatusLancamento,
    derivar_status_adiantamento,
    derivar_status_lancamento,
)
from app.models.usuario import Usuario
from app.schemas.financeiro import (
    AbaAnalisada,
    AdiantamentoEntrada,
    AdiantamentoOut,
    DashboardFinanceiro,
    DevolucaoEntrada,
    DevolucaoOut,
    ImportacaoFinanceiraOut,
    KpiFinanceiro,
    LancamentoCriar,
    LancamentoEntrada,
    LancamentoLista,
    LancamentoOut,
    OpcoesFiltroFinanceiro,
    PreviewFinanceiro,
    ResultadoAbaOut,
    ValorPorCategoria,
    ValorPorMes,
)
import uuid

from app.services import financeiro as servico
from app.services.auditoria import formatar_moeda
from app.services.financeiro import MESES_NOME, canonizar
from app.services.financeiro_relatorios import ano_padrao
from app.services.leitura import PlanilhaInvalida

router = APIRouter(prefix="/financeiro", tags=["Financeiro"])


# --------------------------------------------------------------------------
# Filtros
# --------------------------------------------------------------------------


@dataclass
class FiltrosLancamento:
    status: str | None = None
    area: str | None = None
    edoa: str | None = None
    categoria: str | None = None
    motivo: str | None = None
    recorrencia: str | None = None
    tipo_pagamento: str | None = None
    centro_custo: str | None = None
    conta_contabil: str | None = None
    mes: int | None = None
    ano: int | None = None
    data_de: date | None = None
    data_ate: date | None = None
    valor_min: float | None = None
    valor_max: float | None = None
    busca: str | None = None

    def aplicar(self, stmt: Select) -> Select:
        campo = Lancamento
        if self.status:
            stmt = stmt.where(campo.status == self.status)
        if self.area:
            stmt = stmt.where(campo.area == self.area)
        if self.edoa:
            stmt = stmt.where(campo.edoa == self.edoa)
        if self.categoria:
            stmt = stmt.where(campo.categoria == self.categoria)
        if self.motivo:
            stmt = stmt.where(campo.motivo == self.motivo)
        if self.recorrencia:
            stmt = stmt.where(campo.recorrencia == self.recorrencia)
        if self.tipo_pagamento:
            stmt = stmt.where(campo.tipo_pagamento == self.tipo_pagamento)
        if self.centro_custo:
            stmt = stmt.where(campo.centro_custo == self.centro_custo)
        if self.conta_contabil:
            stmt = stmt.where(campo.conta_contabil == self.conta_contabil)
        if self.mes:
            stmt = stmt.where(campo.mes_referencia_num == self.mes)
        if self.ano:
            stmt = stmt.where(campo.ano_referencia == self.ano)
        if self.data_de:
            stmt = stmt.where(campo.data_pagamento >= self.data_de)
        if self.data_ate:
            stmt = stmt.where(campo.data_pagamento <= self.data_ate)
        if self.valor_min is not None:
            stmt = stmt.where(campo.valor >= self.valor_min)
        if self.valor_max is not None:
            stmt = stmt.where(campo.valor <= self.valor_max)
        if self.busca:
            termo = f"%{self.busca.strip()}%"
            stmt = stmt.where(
                campo.descricao.ilike(termo)
                | campo.referencia.ilike(termo)
                | campo.chamado.ilike(termo)
                | campo.numero_pedido.ilike(termo)
                | campo.rc.ilike(termo)
                | campo.documento_pago.ilike(termo)
            )
        return stmt


def obter_filtros(
    status: str | None = Query(None),
    area: str | None = Query(None),
    edoa: str | None = Query(None),
    categoria: str | None = Query(None),
    motivo: str | None = Query(None),
    recorrencia: str | None = Query(None),
    tipo_pagamento: str | None = Query(None),
    centro_custo: str | None = Query(None),
    conta_contabil: str | None = Query(None),
    mes: int | None = Query(None, ge=1, le=12),
    ano: int | None = Query(None),
    data_de: date | None = Query(None),
    data_ate: date | None = Query(None),
    valor_min: float | None = Query(None),
    valor_max: float | None = Query(None),
    busca: str | None = Query(None),
) -> FiltrosLancamento:
    return FiltrosLancamento(
        status=status, area=area, edoa=edoa, categoria=categoria, motivo=motivo,
        recorrencia=recorrencia, tipo_pagamento=tipo_pagamento, centro_custo=centro_custo,
        conta_contabil=conta_contabil, mes=mes, ano=ano, data_de=data_de, data_ate=data_ate,
        valor_min=valor_min, valor_max=valor_max, busca=busca,
    )


ORDENACOES = {
    "valor": Lancamento.valor,
    "data_pagamento": Lancamento.data_pagamento,
    "envio_para_pagamento": Lancamento.envio_para_pagamento,
    "area": Lancamento.area,
    "edoa": Lancamento.edoa,
    "status": Lancamento.status,
    "motivo": Lancamento.motivo,
    "categoria": Lancamento.categoria,
    "mes_referencia_num": Lancamento.mes_referencia_num,
    "linha_planilha": Lancamento.linha_planilha,
}


def _agrupar(
    db: Session, filtros: FiltrosLancamento, coluna, limite: int | None = None
) -> list[ValorPorCategoria]:
    stmt = filtros.aplicar(
        select(coluna, func.sum(Lancamento.valor), func.count()).group_by(coluna)
    ).order_by(func.sum(Lancamento.valor).desc())

    linhas = db.execute(stmt).all()
    total = sum(float(valor or 0) for _, valor, _ in linhas) or 1

    itens = [
        ValorPorCategoria(
            label=label or "Não informado",
            valor=round(float(valor or 0), 2),
            quantidade=int(quantidade),
            percentual=round(float(valor or 0) / total * 100, 1),
        )
        for label, valor, quantidade in linhas
    ]
    return itens[:limite] if limite else itens


# --------------------------------------------------------------------------
# Lançamentos
# --------------------------------------------------------------------------


@router.get("/lancamentos", response_model=LancamentoLista)
def listar_lancamentos(
    db: Session = Depends(get_db),
    _: Usuario = Depends(usuario_atual),
    filtros: FiltrosLancamento = Depends(obter_filtros),
    pagina: int = Query(1, ge=1),
    por_pagina: int = Query(25, ge=1, le=500),
    ordenar_por: str = Query("data_pagamento"),
    direcao: str = Query("desc", pattern="^(asc|desc)$"),
) -> LancamentoLista:
    base = filtros.aplicar(select(Lancamento))

    total = db.scalar(select(func.count()).select_from(base.subquery())) or 0
    total_valor = db.scalar(
        filtros.aplicar(select(func.coalesce(func.sum(Lancamento.valor), 0)))
    )

    coluna = ORDENACOES.get(ordenar_por, Lancamento.data_pagamento)
    ordenado = base.order_by(
        coluna.desc().nullslast() if direcao == "desc" else coluna.asc().nullsfirst()
    )
    itens = db.scalars(ordenado.offset((pagina - 1) * por_pagina).limit(por_pagina)).all()

    return LancamentoLista(
        itens=[LancamentoOut.model_validate(i) for i in itens],
        total=total,
        total_valor=round(float(total_valor or 0), 2),
        pagina=pagina,
        por_pagina=por_pagina,
        total_paginas=max(1, -(-total // por_pagina)),
    )


@router.get("/lancamentos/opcoes-filtro", response_model=OpcoesFiltroFinanceiro)
def opcoes_filtro(
    db: Session = Depends(get_db), _: Usuario = Depends(usuario_atual)
) -> OpcoesFiltroFinanceiro:
    """Valores existentes no banco + listas de domínio importadas da aba Base."""

    def distintos(coluna) -> list[str]:
        valores = db.scalars(select(coluna).where(coluna.isnot(None)).distinct().order_by(coluna)).all()
        return [v for v in valores if v]

    def dominio(tipo: str) -> list[str]:
        return db.scalars(
            select(DominioFinanceiro.valor)
            .where(DominioFinanceiro.tipo == tipo)
            .order_by(DominioFinanceiro.valor)
        ).all()

    def unir(*listas: list[str]) -> list[str]:
        return sorted({v for lista in listas for v in lista if v})

    anos = db.scalars(
        select(Lancamento.ano_referencia)
        .where(Lancamento.ano_referencia.isnot(None))
        .distinct()
        .order_by(Lancamento.ano_referencia.desc())
    ).all()

    return OpcoesFiltroFinanceiro(
        status=[s.value for s in StatusLancamento],
        areas=unir(distintos(Lancamento.area), dominio("area")),
        edoas=unir(distintos(Lancamento.edoa), dominio("edoa")),
        categorias=distintos(Lancamento.categoria),
        motivos=unir(distintos(Lancamento.motivo), dominio("motivo")),
        recorrencias=unir(distintos(Lancamento.recorrencia), dominio("recorrencia")),
        tipos_pagamento=unir(distintos(Lancamento.tipo_pagamento), dominio("tipo_pagamento")),
        centros_custo=distintos(Lancamento.centro_custo),
        contas_contabeis=distintos(Lancamento.conta_contabil),
        anos=[int(a) for a in anos],
    )


@router.get("/lancamentos/exportar")
def exportar_lancamentos(
    db: Session = Depends(get_db),
    _: Usuario = Depends(usuario_atual),
    filtros: FiltrosLancamento = Depends(obter_filtros),
) -> Response:
    """Baixa os lançamentos filtrados em XLSX, no layout da planilha de origem."""
    itens = db.scalars(filtros.aplicar(select(Lancamento)).order_by(Lancamento.linha_planilha)).all()

    linhas = [
        {
            "STATUS": i.status,
            "CATEGORIA": i.categoria,
            "ÁREA": i.area,
            "PAGAMENTO": i.tipo_pagamento,
            "REFERÊNCIA": i.referencia,
            "MOTIVO": i.motivo,
            "Valor": float(i.valor or 0),
            "MÊS REFERENCIA": i.mes_referencia,
            "DATA PAGAMENTO": i.data_pagamento.strftime("%d.%m.%Y") if i.data_pagamento else None,
            "RECORRÊNCIA": i.recorrencia,
            "DESCRIÇÃO": i.descricao,
            "RC": i.rc,
            "Nº PEDIDO": i.numero_pedido,
            "Recepção": i.recepcao,
            "ITEM": i.item,
            "CHAMADO": i.chamado,
            "EDOA": i.edoa,
            "CENTRO DE CUSTO": i.centro_custo,
            "CONTA CONTÁBIL": i.conta_contabil,
            "ENVIO PARA PAGAMENTO": i.envio_para_pagamento.strftime("%d.%m.%Y")
            if i.envio_para_pagamento
            else None,
            "PAGO / Nº DOCUMENTO": i.documento_pago,
        }
        for i in itens
    ]

    buffer = io.BytesIO()
    with pd.ExcelWriter(buffer, engine="xlsxwriter") as writer:
        pd.DataFrame(linhas or [{}]).to_excel(writer, index=False, sheet_name="Controle Lançamentos")
        writer.sheets["Controle Lançamentos"].set_column("A:U", 20)
    buffer.seek(0)

    nome = f"lancamentos_juridico_{datetime.now(timezone.utc):%Y%m%d_%H%M}.xlsx"
    return Response(
        content=buffer.getvalue(),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{nome}"'},
    )


def _aplicar_lancamento(lancamento: Lancamento, dados: dict) -> None:
    """Grava os campos, padroniza os textos e recalcula o que é derivado."""
    textos_de_dominio = {"area": "area", "motivo": "motivo", "recorrencia": "recorrencia", "tipo_pagamento": "tipo_pagamento"}
    for campo, valor in dados.items():
        if isinstance(valor, str):
            valor = canonizar(valor, textos_de_dominio.get(campo))
        setattr(lancamento, campo, valor)

    if lancamento.mes_referencia_num:
        lancamento.mes_referencia = MESES_NOME[lancamento.mes_referencia_num - 1]
    # Mesmo critério da coluna STATUS da planilha.
    lancamento.status = derivar_status_lancamento(
        lancamento.rc,
        lancamento.numero_pedido,
        lancamento.recepcao,
        lancamento.envio_para_pagamento,
        lancamento.documento_pago,
    )


@router.get("/lancamentos/{lancamento_id}", response_model=LancamentoOut)
def obter_lancamento(
    lancamento_id: int, db: Session = Depends(get_db), _: Usuario = Depends(usuario_atual)
) -> LancamentoOut:
    lancamento = db.get(Lancamento, lancamento_id)
    if lancamento is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lançamento não encontrado.")
    return LancamentoOut.model_validate(lancamento)


@router.post("/lancamentos", response_model=LancamentoOut, status_code=status.HTTP_201_CREATED)
def criar_lancamento(
    dados: LancamentoCriar,
    db: Session = Depends(get_db),
    _: Usuario = Depends(exigir_analista),
) -> LancamentoOut:
    """Novo pagamento lançado direto no sistema (sem passar pela planilha)."""
    campos = dados.model_dump()
    campos["ano_referencia"] = campos.get("ano_referencia") or ano_padrao(db)
    lancamento = Lancamento(fingerprint=f"manual-{uuid.uuid4().hex}", valor=campos["valor"])
    _aplicar_lancamento(lancamento, campos)
    db.add(lancamento)
    db.commit()
    db.refresh(lancamento)
    return LancamentoOut.model_validate(lancamento)


@router.put("/lancamentos/{lancamento_id}", response_model=LancamentoOut)
def atualizar_lancamento(
    lancamento_id: int,
    dados: LancamentoEntrada,
    db: Session = Depends(get_db),
    _: Usuario = Depends(exigir_analista),
) -> LancamentoOut:
    lancamento = db.get(Lancamento, lancamento_id)
    if lancamento is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lançamento não encontrado.")

    _aplicar_lancamento(lancamento, dados.model_dump(exclude_unset=True))
    db.commit()
    db.refresh(lancamento)
    return LancamentoOut.model_validate(lancamento)


@router.delete("/lancamentos/{lancamento_id}", status_code=status.HTTP_204_NO_CONTENT, response_class=Response, response_model=None)
def excluir_lancamento(
    lancamento_id: int, db: Session = Depends(get_db), _: Usuario = Depends(exigir_analista)
) -> None:
    lancamento = db.get(Lancamento, lancamento_id)
    if lancamento is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lançamento não encontrado.")
    db.delete(lancamento)
    db.commit()


# --------------------------------------------------------------------------
# Dashboard
# --------------------------------------------------------------------------


@router.get("/dashboard", response_model=DashboardFinanceiro)
def dashboard_financeiro(
    db: Session = Depends(get_db),
    _: Usuario = Depends(usuario_atual),
    filtros: FiltrosLancamento = Depends(obter_filtros),
) -> DashboardFinanceiro:
    total_geral = float(db.scalar(filtros.aplicar(select(func.coalesce(func.sum(Lancamento.valor), 0)))) or 0)
    quantidade = int(db.scalar(filtros.aplicar(select(func.count()).select_from(Lancamento))) or 0)

    pagos_stmt = filtros.aplicar(select(func.coalesce(func.sum(Lancamento.valor), 0), func.count())).where(
        Lancamento.status == StatusLancamento.PAGO
    )
    pago_valor, pago_qtd = db.execute(pagos_stmt).one()

    em_processamento = total_geral - float(pago_valor or 0)

    # Série mensal (sempre os 12 meses, para o gráfico não "pular" meses vazios).
    valor_pago = case((Lancamento.status == StatusLancamento.PAGO, Lancamento.valor), else_=0)
    por_mes_bruto = db.execute(
        filtros.aplicar(
            select(
                Lancamento.mes_referencia_num,
                func.sum(Lancamento.valor),
                func.count(),
                func.sum(valor_pago),
            ).group_by(Lancamento.mes_referencia_num)
        )
    ).all()

    mapa_mes = {
        int(mes): (float(valor or 0), int(qtd), float(pago or 0))
        for mes, valor, qtd, pago in por_mes_bruto
        if mes is not None
    }
    por_mes = [
        ValorPorMes(
            mes=mes,
            nome=MESES_NOME[mes - 1],
            valor=round(mapa_mes.get(mes, (0, 0, 0))[0], 2),
            quantidade=mapa_mes.get(mes, (0, 0, 0))[1],
            pago=round(mapa_mes.get(mes, (0, 0, 0))[2], 2),
            em_processamento=round(
                mapa_mes.get(mes, (0, 0, 0))[0] - mapa_mes.get(mes, (0, 0, 0))[2], 2
            ),
        )
        for mes in range(1, 13)
    ]

    # Adiantamentos ainda sem baixa registrada.
    adiantamentos_abertos = db.execute(
        select(func.coalesce(func.sum(Adiantamento.valor), 0), func.count()).where(
            Adiantamento.chamado_baixa.is_(None), Adiantamento.documento_baixa.is_(None)
        )
    ).one()

    devolucoes = db.execute(
        select(func.coalesce(func.sum(Devolucao.valor_devolvido), 0), func.count())
    ).one()

    alertas: list[str] = []
    if float(adiantamentos_abertos[0] or 0) > 0:
        alertas.append(
            f"{adiantamentos_abertos[1]} adiantamento(s) sem baixa, somando "
            f"{formatar_moeda(float(adiantamentos_abertos[0]))}."
        )
    if em_processamento > 0:
        alertas.append(
            f"{formatar_moeda(em_processamento)} em lançamentos que ainda não constam como pagos."
        )
    sem_edoa = db.scalar(
        filtros.aplicar(select(func.count()).select_from(Lancamento)).where(Lancamento.edoa.is_(None))
    )
    if sem_edoa:
        alertas.append(f"{sem_edoa} lançamento(s) sem EDOA — ficam fora do controle orçamentário.")
    sem_centro = db.scalar(
        filtros.aplicar(select(func.count()).select_from(Lancamento)).where(
            Lancamento.centro_custo.is_(None)
        )
    )
    if sem_centro:
        alertas.append(f"{sem_centro} lançamento(s) sem centro de custo.")

    return DashboardFinanceiro(
        total_geral=KpiFinanceiro(valor=round(total_geral, 2), quantidade=quantidade),
        total_pago=KpiFinanceiro(valor=round(float(pago_valor or 0), 2), quantidade=int(pago_qtd or 0)),
        em_processamento=KpiFinanceiro(
            valor=round(em_processamento, 2), quantidade=quantidade - int(pago_qtd or 0)
        ),
        ticket_medio=KpiFinanceiro(
            valor=round(total_geral / quantidade, 2) if quantidade else 0, quantidade=quantidade
        ),
        adiantamentos_em_aberto=KpiFinanceiro(
            valor=round(float(adiantamentos_abertos[0] or 0), 2), quantidade=int(adiantamentos_abertos[1])
        ),
        devolucoes=KpiFinanceiro(
            valor=round(float(devolucoes[0] or 0), 2), quantidade=int(devolucoes[1])
        ),
        por_mes=por_mes,
        por_area=_agrupar(db, filtros, Lancamento.area),
        por_edoa=_agrupar(db, filtros, Lancamento.edoa),
        por_motivo=_agrupar(db, filtros, Lancamento.motivo, limite=12),
        por_status=_agrupar(db, filtros, Lancamento.status),
        por_recorrencia=_agrupar(db, filtros, Lancamento.recorrencia),
        por_centro_custo=_agrupar(db, filtros, Lancamento.centro_custo, limite=12),
        alertas=alertas,
    )


# --------------------------------------------------------------------------
# Adiantamentos e devoluções
# --------------------------------------------------------------------------


@router.get("/adiantamentos", response_model=list[AdiantamentoOut])
def listar_adiantamentos(
    db: Session = Depends(get_db),
    _: Usuario = Depends(usuario_atual),
    em_aberto: bool | None = Query(None, description="true = apenas sem baixa registrada"),
    area: str | None = Query(None),
    ano: int | None = Query(None),
    status_adiantamento: str | None = Query(None, alias="status"),
) -> list[AdiantamentoOut]:
    stmt = select(Adiantamento)
    if area:
        stmt = stmt.where(Adiantamento.area == area)
    if ano:
        stmt = stmt.where(Adiantamento.ano_referencia == ano)
    if status_adiantamento:
        stmt = stmt.where(Adiantamento.status == status_adiantamento)
    if em_aberto is True:
        stmt = stmt.where(Adiantamento.status != StatusAdiantamento.BAIXADO)
    elif em_aberto is False:
        stmt = stmt.where(Adiantamento.status == StatusAdiantamento.BAIXADO)

    itens = db.scalars(stmt.order_by(Adiantamento.linha_planilha.asc().nullslast(), Adiantamento.id)).all()
    return [AdiantamentoOut.model_validate(i) for i in itens]


def _aplicar_adiantamento(adiantamento: Adiantamento, dados: dict) -> None:
    for campo, valor in dados.items():
        if isinstance(valor, str):
            valor = canonizar(valor, "area" if campo == "area" else None)
        setattr(adiantamento, campo, valor)
    adiantamento.valor = adiantamento.valor or 0
    adiantamento.valor_excedente = adiantamento.valor_excedente or 0
    # Na planilha: Valor total = Valor + Valor Excedente; Status pela coluna de baixa.
    adiantamento.valor_total = round(float(adiantamento.valor) + float(adiantamento.valor_excedente), 2)
    adiantamento.status = derivar_status_adiantamento(
        adiantamento.chamado_adiantamento, adiantamento.chamado_baixa, adiantamento.documento_baixa
    )


@router.post("/adiantamentos", response_model=AdiantamentoOut, status_code=status.HTTP_201_CREATED)
def criar_adiantamento(
    dados: AdiantamentoEntrada, db: Session = Depends(get_db), _: Usuario = Depends(exigir_analista)
) -> AdiantamentoOut:
    campos = dados.model_dump()
    campos["ano_referencia"] = campos.get("ano_referencia") or ano_padrao(db)
    campos["conferido_planilha"] = bool(campos.get("conferido_planilha"))
    adiantamento = Adiantamento(fingerprint=f"manual-{uuid.uuid4().hex}")
    _aplicar_adiantamento(adiantamento, campos)
    db.add(adiantamento)
    db.commit()
    db.refresh(adiantamento)
    return AdiantamentoOut.model_validate(adiantamento)


@router.put("/adiantamentos/{adiantamento_id}", response_model=AdiantamentoOut)
def atualizar_adiantamento(
    adiantamento_id: int,
    dados: AdiantamentoEntrada,
    db: Session = Depends(get_db),
    _: Usuario = Depends(exigir_analista),
) -> AdiantamentoOut:
    adiantamento = db.get(Adiantamento, adiantamento_id)
    if adiantamento is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Adiantamento não encontrado.")
    _aplicar_adiantamento(adiantamento, dados.model_dump(exclude_unset=True))
    db.commit()
    db.refresh(adiantamento)
    return AdiantamentoOut.model_validate(adiantamento)


@router.delete("/adiantamentos/{adiantamento_id}", status_code=status.HTTP_204_NO_CONTENT, response_class=Response, response_model=None)
def excluir_adiantamento(
    adiantamento_id: int, db: Session = Depends(get_db), _: Usuario = Depends(exigir_analista)
) -> None:
    adiantamento = db.get(Adiantamento, adiantamento_id)
    if adiantamento is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Adiantamento não encontrado.")
    db.delete(adiantamento)
    db.commit()


@router.get("/devolucoes", response_model=list[DevolucaoOut])
def listar_devolucoes(
    db: Session = Depends(get_db),
    _: Usuario = Depends(usuario_atual),
    area: str | None = Query(None),
    fornecedor: str | None = Query(None),
    ano: int | None = Query(None),
) -> list[DevolucaoOut]:
    stmt = select(Devolucao)
    if area:
        stmt = stmt.where(Devolucao.area == area)
    if fornecedor:
        stmt = stmt.where(Devolucao.fornecedor.ilike(f"%{fornecedor}%"))
    if ano:
        stmt = stmt.where(Devolucao.ano_referencia == ano)

    itens = db.scalars(stmt.order_by(Devolucao.data_transferencia.desc().nullslast())).all()
    return [DevolucaoOut.model_validate(i) for i in itens]


def _aplicar_devolucao(devolucao: Devolucao, dados: dict) -> None:
    for campo, valor in dados.items():
        if isinstance(valor, str):
            valor = canonizar(valor, "area" if campo == "area" else None)
        setattr(devolucao, campo, valor)


@router.post("/devolucoes", response_model=DevolucaoOut, status_code=status.HTTP_201_CREATED)
def criar_devolucao(
    dados: DevolucaoEntrada, db: Session = Depends(get_db), _: Usuario = Depends(exigir_analista)
) -> DevolucaoOut:
    campos = dados.model_dump()
    if not campos.get("valor_devolvido"):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Informe o valor devolvido.")
    campos["ano_referencia"] = campos.get("ano_referencia") or ano_padrao(db)
    devolucao = Devolucao(fingerprint=f"manual-{uuid.uuid4().hex}")
    _aplicar_devolucao(devolucao, campos)
    db.add(devolucao)
    db.commit()
    db.refresh(devolucao)
    return DevolucaoOut.model_validate(devolucao)


@router.put("/devolucoes/{devolucao_id}", response_model=DevolucaoOut)
def atualizar_devolucao(
    devolucao_id: int,
    dados: DevolucaoEntrada,
    db: Session = Depends(get_db),
    _: Usuario = Depends(exigir_analista),
) -> DevolucaoOut:
    devolucao = db.get(Devolucao, devolucao_id)
    if devolucao is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Devolução não encontrada.")
    _aplicar_devolucao(devolucao, dados.model_dump(exclude_unset=True))
    db.commit()
    db.refresh(devolucao)
    return DevolucaoOut.model_validate(devolucao)


@router.delete("/devolucoes/{devolucao_id}", status_code=status.HTTP_204_NO_CONTENT, response_class=Response, response_model=None)
def excluir_devolucao(
    devolucao_id: int, db: Session = Depends(get_db), _: Usuario = Depends(exigir_analista)
) -> None:
    devolucao = db.get(Devolucao, devolucao_id)
    if devolucao is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Devolução não encontrada.")
    db.delete(devolucao)
    db.commit()


# --------------------------------------------------------------------------
# Importação
# --------------------------------------------------------------------------


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


@router.post("/importacoes/preview", response_model=PreviewFinanceiro)
async def preview_importacao(
    arquivo: UploadFile = File(...),
    _: Usuario = Depends(exigir_analista),
) -> PreviewFinanceiro:
    """Mostra o que será feito com cada aba, sem gravar nada."""
    conteudo = await _ler_upload(arquivo)
    try:
        analise = servico.analisar_arquivo(conteudo, arquivo.filename or "planilha")
    except PlanilhaInvalida as erro:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(erro)) from erro

    return PreviewFinanceiro(
        arquivo=arquivo.filename or "planilha",
        ano_detectado=analise["ano_detectado"],
        origem_ano=analise["origem_ano"],
        abas=[AbaAnalisada(**aba) for aba in analise["abas"]],
    )


@router.post("/importacoes", response_model=ImportacaoFinanceiraOut, status_code=status.HTTP_201_CREATED)
async def importar(
    arquivo: UploadFile = File(...),
    ano: int | None = Query(None, description="Exercício; se omitido, é detectado pelo nome do arquivo"),
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(exigir_analista),
) -> ImportacaoFinanceiraOut:
    conteudo = await _ler_upload(arquivo)

    try:
        importacao, resultados, extras = servico.importar_planilha_financeira(
            db, conteudo, arquivo.filename or "planilha", usuario, ano
        )
    except PlanilhaInvalida as erro:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(erro)) from erro

    ano_importado = extras["ano"]
    total = db.scalar(select(func.count()).select_from(Lancamento).where(Lancamento.ano_referencia == ano_importado)) or 0
    soma = db.scalar(
        select(func.coalesce(func.sum(Lancamento.valor), 0)).where(Lancamento.ano_referencia == ano_importado)
    ) or 0

    return ImportacaoFinanceiraOut(
        importacao_id=importacao.id,
        arquivo=importacao.arquivo,
        status=importacao.status,
        data=importacao.data,
        duracao_ms=importacao.duracao_ms,
        criados=importacao.criados,
        atualizados=importacao.atualizados,
        total_inconsistencias=importacao.total_inconsistencias,
        abas=[
            ResultadoAbaOut(
                aba=r.aba,
                destino=r.destino,
                linhas_lidas=r.linhas_lidas,
                criados=r.criados,
                atualizados=r.atualizados,
                ignorados=r.ignorados,
                removidos=r.removidos,
                linha_cabecalho=r.linha_cabecalho,
                mensagem=r.mensagem,
                problemas=len(r.problemas),
            )
            for r in resultados
        ],
        total_lancamentos=int(total),
        valor_total_lancamentos=round(float(soma), 2),
        ano=ano_importado,
        origem_ano=extras["origem_ano"],
        mes_fechamento=extras["mes_fechamento"],
        removidos=sum(r.removidos for r in resultados),
        padronizacoes=extras["padronizacoes"],
    )
