"""Relatórios financeiros: RAP (orçamento × realizado), Resultado, análise por EDOA,
plano de honorários e contratos mensais.

Todos os valores de realizado são calculados na hora a partir dos lançamentos,
então editar ou importar lançamentos já muda os relatórios.
"""

from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from pydantic import BaseModel, Field
from sqlalchemy import distinct, select
from sqlalchemy.orm import Session

from app.api.deps import exigir_gestor, usuario_atual
from app.core.database import get_db
from app.models.financeiro import ExercicioFinanceiro, ItemOrcamento, Lancamento
from app.models.usuario import Usuario
from app.services import financeiro_relatorios as rel
from app.services.financeiro import MESES_NOME

router = APIRouter(prefix="/financeiro", tags=["Financeiro — relatórios"])

EDOA_PADRAO_ANALISE = "LGPD GERAL & TERCEIROS"


def _ano(db: Session, ano: int | None) -> int:
    return ano or rel.ano_padrao(db)


@router.get("/anos")
def anos_disponiveis(db: Session = Depends(get_db), _: Usuario = Depends(usuario_atual)) -> dict:
    """Anos com lançamento ou orçamento, e o mês de fechamento de cada um."""
    anos = set(db.scalars(select(distinct(Lancamento.ano_referencia))).all())
    anos |= set(db.scalars(select(distinct(ItemOrcamento.ano))).all())
    anos.discard(None)
    exercicios = {e.ano: e for e in db.scalars(select(ExercicioFinanceiro)).all()}
    anos |= set(exercicios)
    lista = sorted(anos, reverse=True)
    return {
        "padrao": rel.ano_padrao(db),
        "anos": [
            {
                "ano": a,
                "mes_fechamento": exercicios[a].mes_fechamento if a in exercicios else 12,
                "arquivo_origem": exercicios[a].arquivo_origem if a in exercicios else None,
            }
            for a in lista
        ],
        "meses": MESES_NOME,
    }


class ExercicioEntrada(BaseModel):
    mes_fechamento: int = Field(ge=1, le=12)


@router.put("/exercicios/{ano}")
def atualizar_exercicio(
    ano: int,
    dados: ExercicioEntrada,
    db: Session = Depends(get_db),
    _: Usuario = Depends(exigir_gestor),
) -> dict:
    """Muda o "MÊS FECHAMENTO" do ano (célula B3 da aba RAP)."""
    exercicio = db.get(ExercicioFinanceiro, ano)
    if exercicio is None:
        exercicio = ExercicioFinanceiro(ano=ano)
        db.add(exercicio)
    exercicio.mes_fechamento = dados.mes_fechamento
    exercicio.atualizado_em = datetime.now(timezone.utc)
    db.commit()
    return {"ano": ano, "mes_fechamento": exercicio.mes_fechamento}


@router.get("/rap")
def relatorio_rap(
    ano: int | None = None,
    mes_fechamento: int | None = Query(None, ge=1, le=12),
    db: Session = Depends(get_db),
    _: Usuario = Depends(usuario_atual),
) -> dict:
    return rel.rap(db, _ano(db, ano), mes_fechamento)


class ItemOrcamentoEntrada(BaseModel):
    """Campos editáveis de uma linha do orçamento. Só o que vier é alterado."""

    budget_anual: float | None = None
    budget_fixo: float | None = None
    budget_variavel: float | None = None
    filtro_edoa: str | None = None
    filtro_area: str | None = None
    filtro_recorrencia: str | None = None
    realizado_manual: float | None = None
    limpar_realizado_manual: bool = False
    rotulo: str | None = None


@router.put("/orcamento/itens/{item_id}")
def atualizar_item_orcamento(
    item_id: int,
    dados: ItemOrcamentoEntrada,
    db: Session = Depends(get_db),
    _: Usuario = Depends(exigir_gestor),
) -> dict:
    """Corrige budget ou critério de soma de uma linha (ex.: a linha que na planilha soma célula vazia)."""
    item = db.get(ItemOrcamento, item_id)
    if item is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Linha do orçamento não encontrada.")

    alterou_regra = False
    for campo in ("budget_anual", "budget_fixo", "budget_variavel", "rotulo"):
        valor = getattr(dados, campo)
        if valor is not None:
            setattr(item, campo, valor)
    for campo in ("filtro_edoa", "filtro_area", "filtro_recorrencia"):
        valor = getattr(dados, campo)
        if valor is not None:
            setattr(item, campo, valor.strip() or None)
            alterou_regra = True
    if dados.limpar_realizado_manual:
        item.realizado_manual = None
    elif dados.realizado_manual is not None:
        item.realizado_manual = dados.realizado_manual
        alterou_regra = True
    if alterou_regra:
        item.regra_origem = "manual"
    db.commit()
    return {
        "id": item.id,
        "budget_anual": float(item.budget_anual or 0),
        "filtro_edoa": item.filtro_edoa,
        "filtro_area": item.filtro_area,
        "filtro_recorrencia": item.filtro_recorrencia,
        "realizado_manual": float(item.realizado_manual) if item.realizado_manual is not None else None,
        "regra_origem": item.regra_origem,
    }


@router.get("/resultado")
def relatorio_resultado(
    ano: int | None = None,
    mes: int | None = Query(None, ge=1, le=12),
    db: Session = Depends(get_db),
    _: Usuario = Depends(usuario_atual),
) -> dict:
    ano_efetivo = _ano(db, ano)
    return rel.resultado(db, ano_efetivo, mes or rel.mes_fechamento_padrao(db, ano_efetivo))


@router.get("/analise")
def relatorio_analise(
    ano: int | None = None,
    edoa: str | None = EDOA_PADRAO_ANALISE,
    linha1: str = "area",
    linha2: str | None = "motivo",
    coluna: str = "recorrencia",
    mes_de: int | None = Query(None, ge=1, le=12),
    mes_ate: int | None = Query(None, ge=1, le=12),
    db: Session = Depends(get_db),
    _: Usuario = Depends(usuario_atual),
) -> dict:
    """Tabela dinâmica dos lançamentos (a aba LGPD é esta análise para um EDOA fixo).

    `edoa` vazio = todos; vários EDOAs separados por "|".
    """
    try:
        return rel.analise_dinamica(
            db, _ano(db, ano), edoa or None, linha1, linha2 or None, coluna, mes_de, mes_ate
        )
    except ValueError as erro:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(erro)) from erro


@router.get("/plano-honorarios")
def relatorio_plano_honorarios(
    ano: int | None = None, db: Session = Depends(get_db), _: Usuario = Depends(usuario_atual)
) -> dict:
    return rel.plano_honorarios(db, _ano(db, ano))


@router.get("/contratos")
def contratos_mensais(
    ano: int | None = None, db: Session = Depends(get_db), _: Usuario = Depends(usuario_atual)
) -> dict:
    """Contratos recorrentes (aba Mensais) com o realizado por área no ano."""
    ano_efetivo = _ano(db, ano)
    base = rel.carregar_base(db, ano_efetivo)
    itens = db.scalars(
        select(ItemOrcamento)
        .where(ItemOrcamento.ano == ano_efetivo, ItemOrcamento.origem.like("Mensais%"))
        .order_by(ItemOrcamento.origem, ItemOrcamento.ordem, ItemOrcamento.id)
    ).all()

    contratos = []
    for item in itens:
        realizado = None
        if item.area:
            realizado, _q = rel.somar(base, area=item.area, recorrencias=rel.GRUPO_FIXO)
        contratos.append(
            {
                "id": item.id,
                "tipo": "Sistema" if item.origem.endswith("(sistemas)") else "Escritório",
                "area": item.area,
                "descricao": item.rotulo or item.detalhamento,
                "recorrencia": item.recorrencia,
                "valor_mensal": float(item.valor_mensal_contratado or 0),
                "valor_anual": float(item.budget_anual or 0),
                "realizado_fixo_ano": realizado,
            }
        )
    return {
        "ano": ano_efetivo,
        "contratos": contratos,
        "total_mensal": round(sum(c["valor_mensal"] for c in contratos), 2),
        "total_anual": round(sum(c["valor_anual"] for c in contratos), 2),
        "observacao": "Realizado = lançamentos da área com recorrência 'Fixo' no ano.",
    }


@router.get("/importacoes/modelo")
def baixar_modelo(ano: int | None = None, _: Usuario = Depends(usuario_atual)) -> Response:
    """Planilha de exemplo com o layout da planilha de pagamentos do Jurídico (dados fictícios)."""
    from app.services.modelo_financeiro import gerar_planilha_financeira

    ano_modelo = ano or datetime.now(timezone.utc).year
    conteudo, _lancamentos = gerar_planilha_financeira(ano_modelo)
    return Response(
        content=conteudo,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="modelo-pagamentos-juridico-{ano_modelo}.xlsx"'},
    )
