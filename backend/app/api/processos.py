"""CRUD de processos, opções de filtro e exportação para Excel."""

import io
from datetime import datetime, timezone

import pandas as pd
from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.api.deps import exigir_analista, usuario_atual
from app.api.filtros import FiltrosProcesso, obter_filtros
from app.core.config import settings
from app.core.database import get_db
from app.models.processo import HistoricoAlteracao, Movimentacao, Processo
from app.models.usuario import Usuario
from app.schemas.dashboard import FiltroOpcoes
from app.schemas.processo import ProcessoCreate, ProcessoDetalhe, ProcessoLista, ProcessoOut, ProcessoUpdate
from app.services.normalizacao import calcular_risco
from app.services.auditoria import CAMPOS_AUDITADOS, formatar_para_historico

router = APIRouter(prefix="/processos", tags=["Processos"])

ORDENACOES = {
    "numero_autos": Processo.numero_autos,
    "autor_reu": Processo.autor_reu,
    "natureza": Processo.natureza,
    "comarca": Processo.comarca,
    "fase_processual": Processo.fase_processual,
    "status": Processo.status,
    "valor_causa": Processo.valor_causa,
    "valor_risco": Processo.valor_risco,
    "risco": Processo.risco,
    "data_inicio": Processo.data_inicio,
    "ultima_movimentacao": Processo.ultima_movimentacao,
}


def _aplicar_risco(processo: Processo) -> None:
    processo.risco = calcular_risco(
        float(processo.valor_risco or 0),
        status=processo.status,
        defesa_realizada=processo.defesa_realizada,
        critico_min=settings.RISCO_CRITICO_MIN,
        alto_min=settings.RISCO_ALTO_MIN,
        medio_min=settings.RISCO_MEDIO_MIN,
        agrava_sem_defesa=settings.RISCO_AGRAVA_SEM_DEFESA,
    )


def _para_saida(processo: Processo, total_movimentacoes: int | None = None) -> ProcessoOut:
    saida = ProcessoOut.model_validate(processo)
    saida.total_movimentacoes = (
        total_movimentacoes if total_movimentacoes is not None else len(processo.movimentacoes)
    )
    return saida


@router.get("", response_model=ProcessoLista)
def listar_processos(
    db: Session = Depends(get_db),
    _: Usuario = Depends(usuario_atual),
    filtros: FiltrosProcesso = Depends(obter_filtros),
    pagina: int = Query(1, ge=1),
    por_pagina: int = Query(10, ge=1, le=200),
    ordenar_por: str = Query("ultima_movimentacao"),
    direcao: str = Query("desc", pattern="^(asc|desc)$"),
) -> ProcessoLista:
    stmt = filtros.aplicar(select(Processo))

    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0

    coluna = ORDENACOES.get(ordenar_por, Processo.ultima_movimentacao)
    stmt = stmt.order_by(coluna.desc().nullslast() if direcao == "desc" else coluna.asc().nullsfirst())
    stmt = stmt.offset((pagina - 1) * por_pagina).limit(por_pagina)

    processos = db.scalars(stmt.options(selectinload(Processo.movimentacoes))).all()

    return ProcessoLista(
        itens=[_para_saida(p) for p in processos],
        total=total,
        pagina=pagina,
        por_pagina=por_pagina,
        total_paginas=max(1, -(-total // por_pagina)),
    )


@router.get("/opcoes-filtro", response_model=FiltroOpcoes)
def opcoes_de_filtro(db: Session = Depends(get_db), _: Usuario = Depends(usuario_atual)) -> FiltroOpcoes:
    """Valores distintos existentes no banco — alimenta os selects das telas."""

    def distintos(coluna) -> list[str]:
        valores = db.scalars(select(coluna).where(coluna.isnot(None)).distinct().order_by(coluna)).all()
        return [v for v in valores if v]

    return FiltroOpcoes(
        naturezas=distintos(Processo.natureza),
        comarcas=distintos(Processo.comarca),
        varas=distintos(Processo.vara),
        fases=distintos(Processo.fase_processual),
        escritorios=distintos(Processo.escritorio),
        riscos=["Baixo", "Médio", "Alto", "Crítico"],
        status=["Ativo", "Inativo"],
        posicoes=["Polo Ativo", "Polo Passivo"],
    )


@router.get("/exportar")
def exportar_processos(
    db: Session = Depends(get_db),
    _: Usuario = Depends(usuario_atual),
    filtros: FiltrosProcesso = Depends(obter_filtros),
) -> Response:
    """Baixa a lista filtrada em XLSX, com os mesmos cabeçalhos da planilha de origem."""
    processos = db.scalars(filtros.aplicar(select(Processo)).order_by(Processo.numero_autos)).all()

    linhas = [
        {
            "Status": p.status,
            "Autor/Réu": p.autor_reu,
            "Número Autos": p.numero_autos,
            "Natureza da ação": p.natureza,
            "Vara": p.vara,
            "Comarca": p.comarca,
            "Data de início": p.data_inicio.strftime("%d/%m/%Y") if p.data_inicio else None,
            "Posição da Renault": p.posicao_renault,
            "Resumo do caso": p.resumo,
            "Defesa": "Sim" if p.defesa_realizada else "Não",
            "Fase processual": p.fase_processual,
            "Movimentações": p.movimentacoes_texto,
            "Valor da causa": float(p.valor_causa or 0),
            "Valor do risco": float(p.valor_risco or 0),
            "Faixa de risco": p.risco,
            "Escritório": p.escritorio,
        }
        for p in processos
    ]

    buffer = io.BytesIO()
    with pd.ExcelWriter(buffer, engine="xlsxwriter") as writer:
        pd.DataFrame(linhas or [{}]).to_excel(writer, index=False, sheet_name="Processos")
        planilha = writer.sheets["Processos"]
        planilha.set_column("A:P", 22)
    buffer.seek(0)

    nome = f"processos_renault_geely_{datetime.now(timezone.utc):%Y%m%d_%H%M}.xlsx"
    return Response(
        content=buffer.getvalue(),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{nome}"'},
    )


@router.get("/{processo_id}", response_model=ProcessoDetalhe)
def obter_processo(
    processo_id: int, db: Session = Depends(get_db), _: Usuario = Depends(usuario_atual)
) -> ProcessoDetalhe:
    processo = db.get(
        Processo,
        processo_id,
        options=[selectinload(Processo.movimentacoes), selectinload(Processo.historico)],
    )
    if processo is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Processo não encontrado.")

    detalhe = ProcessoDetalhe.model_validate(processo)
    detalhe.total_movimentacoes = len(processo.movimentacoes)
    return detalhe


@router.post("", response_model=ProcessoDetalhe, status_code=status.HTTP_201_CREATED)
def criar_processo(
    dados: ProcessoCreate,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(exigir_analista),
) -> ProcessoDetalhe:
    if db.scalar(select(Processo).where(Processo.numero_autos == dados.numero_autos)):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="Já existe um processo com este número de autos."
        )

    processo = Processo(**dados.model_dump())
    _aplicar_risco(processo)
    db.add(processo)
    db.commit()
    db.refresh(processo)

    detalhe = ProcessoDetalhe.model_validate(processo)
    detalhe.total_movimentacoes = 0
    return detalhe


@router.put("/{processo_id}", response_model=ProcessoDetalhe)
def atualizar_processo(
    processo_id: int,
    dados: ProcessoUpdate,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(exigir_analista),
) -> ProcessoDetalhe:
    processo = db.get(Processo, processo_id)
    if processo is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Processo não encontrado.")

    for campo, valor_novo in dados.model_dump(exclude_unset=True).items():
        valor_atual = getattr(processo, campo)
        if campo in {"valor_causa", "valor_risco"}:
            if abs(float(valor_atual or 0) - float(valor_novo or 0)) < 0.01:
                continue
        elif valor_atual == valor_novo:
            continue

        if campo in CAMPOS_AUDITADOS:
            db.add(
                HistoricoAlteracao(
                    processo_id=processo.id,
                    usuario_id=usuario.id,
                    usuario_nome=usuario.nome,
                    campo=CAMPOS_AUDITADOS[campo],
                    valor_anterior=formatar_para_historico(campo, valor_atual),
                    valor_novo=formatar_para_historico(campo, valor_novo),
                    origem="edicao",
                )
            )
        setattr(processo, campo, valor_novo)

    _aplicar_risco(processo)
    db.commit()
    db.refresh(processo)

    detalhe = ProcessoDetalhe.model_validate(processo)
    detalhe.total_movimentacoes = len(processo.movimentacoes)
    return detalhe


@router.delete("/{processo_id}", status_code=status.HTTP_204_NO_CONTENT)
def excluir_processo(
    processo_id: int,
    db: Session = Depends(get_db),
    _: Usuario = Depends(exigir_analista),
) -> None:
    processo = db.get(Processo, processo_id)
    if processo is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Processo não encontrado.")
    db.delete(processo)
    db.commit()


@router.post("/{processo_id}/movimentacoes", status_code=status.HTTP_201_CREATED)
def adicionar_movimentacao(
    processo_id: int,
    descricao: str = Query(..., min_length=4),
    db: Session = Depends(get_db),
    _: Usuario = Depends(exigir_analista),
) -> dict:
    processo = db.get(Processo, processo_id)
    if processo is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Processo não encontrado.")

    hoje = datetime.now(timezone.utc).date()
    movimentacao = Movimentacao(processo_id=processo.id, data=hoje, tipo="outros", descricao=descricao)
    db.add(movimentacao)
    processo.ultima_movimentacao = hoje
    db.commit()
    return {"id": movimentacao.id, "mensagem": "Movimentação registrada."}
