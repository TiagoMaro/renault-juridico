"""Cadastros do financeiro: listas de domínio (aba Base) e plano de contas (aba RF MENSAL)."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.deps import exigir_gestor, usuario_atual
from app.core.database import get_db
from app.models.financeiro import ContaContabil, DominioFinanceiro, Lancamento
from app.models.usuario import Usuario
from app.services.financeiro import TIPOS_DOMINIO
from app.services.leitura import limpar_texto
from app.services.normalizacao import chave

router = APIRouter(prefix="/financeiro/cadastros", tags=["Financeiro — cadastros"])

ROTULOS_DOMINIO = {
    "area": "Áreas",
    "tipo_pagamento": "Tipos de pagamento",
    "fornecedor": "Fornecedores",
    "motivo": "Motivos",
    "recorrencia": "Recorrências",
    "edoa": "EDOA",
    "categoria": "Categorias",
}


class DominioEntrada(BaseModel):
    tipo: str
    valor: str = Field(min_length=1, max_length=160)


class ContaEntrada(BaseModel):
    diretoria: str | None = None
    grupo: str | None = None
    centro_custo: str = Field(min_length=1, max_length=30)
    conta: str = Field(min_length=1, max_length=30)
    descricao: str | None = None


def _conta_out(conta: ContaContabil) -> dict:
    return {
        "id": conta.id,
        "diretoria": conta.diretoria,
        "grupo": conta.grupo,
        "centro_custo": conta.centro_custo,
        "conta": conta.conta,
        "descricao": conta.descricao,
    }


@router.get("/dominios")
def listar_dominios(db: Session = Depends(get_db), _: Usuario = Depends(usuario_atual)) -> dict:
    """Listas agrupadas por tipo, com quantos lançamentos usam cada valor."""
    dominios = db.scalars(select(DominioFinanceiro).order_by(DominioFinanceiro.tipo, DominioFinanceiro.valor)).all()

    uso: dict[str, dict[str, int]] = {}
    for tipo in ("area", "tipo_pagamento", "motivo", "recorrencia", "edoa", "categoria"):
        coluna = getattr(Lancamento, tipo)
        uso[tipo] = {
            chave(valor): quantidade
            for valor, quantidade in db.execute(select(coluna, func.count()).where(coluna.is_not(None)).group_by(coluna)).all()
        }

    grupos = {tipo: [] for tipo in TIPOS_DOMINIO}
    for dominio in dominios:
        grupos.setdefault(dominio.tipo, []).append(
            {"id": dominio.id, "valor": dominio.valor, "uso": uso.get(dominio.tipo, {}).get(chave(dominio.valor))}
        )
    return {
        "tipos": [
            {"tipo": tipo, "rotulo": ROTULOS_DOMINIO.get(tipo, tipo), "itens": itens}
            for tipo, itens in grupos.items()
        ]
    }


@router.post("/dominios", status_code=status.HTTP_201_CREATED)
def criar_dominio(dados: DominioEntrada, db: Session = Depends(get_db), _: Usuario = Depends(exigir_gestor)) -> dict:
    if dados.tipo not in TIPOS_DOMINIO:
        raise HTTPException(status_code=422, detail=f"Tipo inválido. Use: {', '.join(TIPOS_DOMINIO)}.")
    valor = limpar_texto(dados.valor)
    existentes = db.scalars(select(DominioFinanceiro).where(DominioFinanceiro.tipo == dados.tipo)).all()
    if any(chave(d.valor) == chave(valor) for d in existentes):
        raise HTTPException(status_code=409, detail=f"'{valor}' já está cadastrado (mesmo escrito de outro jeito).")
    dominio = DominioFinanceiro(tipo=dados.tipo, valor=valor)
    db.add(dominio)
    db.commit()
    return {"id": dominio.id, "tipo": dominio.tipo, "valor": dominio.valor}


@router.delete(
    "/dominios/{dominio_id}", status_code=status.HTTP_204_NO_CONTENT, response_class=Response, response_model=None
)
def excluir_dominio(dominio_id: int, db: Session = Depends(get_db), _: Usuario = Depends(exigir_gestor)):
    dominio = db.get(DominioFinanceiro, dominio_id)
    if dominio is None:
        raise HTTPException(status_code=404, detail="Item não encontrado.")
    db.delete(dominio)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/contas")
def listar_contas(db: Session = Depends(get_db), _: Usuario = Depends(usuario_atual)) -> list[dict]:
    contas = db.scalars(select(ContaContabil).order_by(ContaContabil.centro_custo, ContaContabil.conta)).all()
    return [_conta_out(c) for c in contas]


def _conta_duplicada(db: Session, dados: ContaEntrada, ignorar_id: int | None = None) -> bool:
    existente = db.scalar(
        select(ContaContabil).where(
            ContaContabil.centro_custo == dados.centro_custo.strip(), ContaContabil.conta == dados.conta.strip()
        )
    )
    return existente is not None and existente.id != ignorar_id


@router.post("/contas", status_code=status.HTTP_201_CREATED)
def criar_conta(dados: ContaEntrada, db: Session = Depends(get_db), _: Usuario = Depends(exigir_gestor)) -> dict:
    if _conta_duplicada(db, dados):
        raise HTTPException(status_code=409, detail="Já existe essa conta nesse centro de custo.")
    conta = ContaContabil(**{k: (v.strip() if isinstance(v, str) else v) for k, v in dados.model_dump().items()})
    db.add(conta)
    db.commit()
    return _conta_out(conta)


@router.put("/contas/{conta_id}")
def atualizar_conta(
    conta_id: int, dados: ContaEntrada, db: Session = Depends(get_db), _: Usuario = Depends(exigir_gestor)
) -> dict:
    conta = db.get(ContaContabil, conta_id)
    if conta is None:
        raise HTTPException(status_code=404, detail="Conta não encontrada.")
    if _conta_duplicada(db, dados, conta_id):
        raise HTTPException(status_code=409, detail="Já existe essa conta nesse centro de custo.")
    for campo, valor in dados.model_dump().items():
        setattr(conta, campo, valor.strip() if isinstance(valor, str) else valor)
    db.commit()
    return _conta_out(conta)


@router.delete(
    "/contas/{conta_id}", status_code=status.HTTP_204_NO_CONTENT, response_class=Response, response_model=None
)
def excluir_conta(conta_id: int, db: Session = Depends(get_db), _: Usuario = Depends(exigir_gestor)):
    conta = db.get(ContaContabil, conta_id)
    if conta is None:
        raise HTTPException(status_code=404, detail="Conta não encontrada.")
    db.delete(conta)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
