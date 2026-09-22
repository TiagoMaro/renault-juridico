"""Relatórios: prévia em tela e exportação real para Excel e PDF."""

import io
from datetime import datetime, timezone

import pandas as pd
from fastapi import APIRouter, Depends, Response
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.dashboard import _agrupar
from app.api.deps import usuario_atual
from app.api.filtros import FiltrosProcesso, obter_filtros
from app.core.database import get_db
from app.models.processo import FaixaRisco, Processo, StatusProcesso
from app.models.usuario import Usuario
from app.schemas.dashboard import RelatorioPreview
from app.schemas.processo import ProcessoOut
from app.services.auditoria import formatar_moeda

router = APIRouter(prefix="/relatorios", tags=["Relatórios"])

AZUL_RENAULT = colors.HexColor("#0035AD")
AZUL_ESCURO = colors.HexColor("#0D1B3E")
CINZA = colors.HexColor("#64748B")


def _carregar(db: Session, filtros: FiltrosProcesso) -> list[Processo]:
    return list(db.scalars(filtros.aplicar(select(Processo)).order_by(Processo.valor_risco.desc())))


def _descrever_filtros(filtros: FiltrosProcesso) -> str:
    aplicados = {
        "Período de": filtros.data_inicio,
        "até": filtros.data_fim,
        "Status": filtros.status,
        "Natureza": filtros.natureza,
        "Fase": filtros.fase,
        "Posição": filtros.posicao,
        "Risco": filtros.risco,
        "Comarca": filtros.comarca,
        "Escritório": filtros.escritorio,
    }
    partes = [f"{rotulo}: {valor}" for rotulo, valor in aplicados.items() if valor]
    return " | ".join(partes) if partes else "Nenhum filtro aplicado (base completa)"


@router.get("/preview", response_model=RelatorioPreview)
def previa_relatorio(
    db: Session = Depends(get_db),
    _: Usuario = Depends(usuario_atual),
    filtros: FiltrosProcesso = Depends(obter_filtros),
) -> RelatorioPreview:
    processos = _carregar(db, filtros)

    return RelatorioPreview(
        total_processos=len(processos),
        valor_causa_total=round(sum(float(p.valor_causa or 0) for p in processos), 2),
        valor_risco_total=round(sum(float(p.valor_risco or 0) for p in processos), 2),
        processos_ativos=len([p for p in processos if p.status == StatusProcesso.ATIVO]),
        processos_criticos=len([p for p in processos if p.risco == FaixaRisco.CRITICO]),
        por_natureza=_agrupar(processos, "natureza"),
        amostra=[ProcessoOut.model_validate(p) for p in processos[:10]],
    )


@router.get("/exportar/excel")
def exportar_excel(
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(usuario_atual),
    filtros: FiltrosProcesso = Depends(obter_filtros),
) -> Response:
    processos = _carregar(db, filtros)
    agora = datetime.now(timezone.utc)

    resumo = pd.DataFrame(
        [
            {"Indicador": "Relatório", "Valor": "Renault Geely — Gestão Jurídica"},
            {"Indicador": "Gerado em", "Valor": agora.strftime("%d/%m/%Y %H:%M UTC")},
            {"Indicador": "Gerado por", "Valor": usuario.nome},
            {"Indicador": "Filtros aplicados", "Valor": _descrever_filtros(filtros)},
            {"Indicador": "Total de processos", "Valor": len(processos)},
            {
                "Indicador": "Processos ativos",
                "Valor": len([p for p in processos if p.status == StatusProcesso.ATIVO]),
            },
            {
                "Indicador": "Valor total das causas",
                "Valor": sum(float(p.valor_causa or 0) for p in processos),
            },
            {
                "Indicador": "Valor total em risco",
                "Valor": sum(float(p.valor_risco or 0) for p in processos),
            },
        ]
    )

    detalhado = pd.DataFrame(
        [
            {
                "Status": p.status,
                "Autor/Réu": p.autor_reu,
                "Número Autos": p.numero_autos,
                "Natureza da ação": p.natureza,
                "Vara": p.vara,
                "Comarca": p.comarca,
                "Data de início": p.data_inicio.strftime("%d/%m/%Y") if p.data_inicio else None,
                "Posição da Renault": p.posicao_renault,
                "Defesa": "Sim" if p.defesa_realizada else "Não",
                "Fase processual": p.fase_processual,
                "Valor da causa": float(p.valor_causa or 0),
                "Valor do risco": float(p.valor_risco or 0),
                "Faixa de risco": p.risco,
                "Escritório": p.escritorio,
            }
            for p in processos
        ]
    )

    por_natureza = pd.DataFrame(
        [
            {
                "Natureza": item.label,
                "Processos": item.quantidade,
                "Valor da causa": item.valor_causa,
                "Valor em risco": item.valor_risco,
            }
            for item in _agrupar(processos, "natureza")
        ]
    )

    buffer = io.BytesIO()
    with pd.ExcelWriter(buffer, engine="xlsxwriter") as writer:
        resumo.to_excel(writer, index=False, sheet_name="Resumo")
        (detalhado if not detalhado.empty else pd.DataFrame([{}])).to_excel(
            writer, index=False, sheet_name="Processos"
        )
        (por_natureza if not por_natureza.empty else pd.DataFrame([{}])).to_excel(
            writer, index=False, sheet_name="Por natureza"
        )
        writer.sheets["Resumo"].set_column("A:B", 34)
        writer.sheets["Processos"].set_column("A:N", 20)
        writer.sheets["Por natureza"].set_column("A:D", 20)
    buffer.seek(0)

    nome = f"relatorio_juridico_{agora:%Y%m%d_%H%M}.xlsx"
    return Response(
        content=buffer.getvalue(),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{nome}"'},
    )


@router.get("/exportar/pdf")
def exportar_pdf(
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(usuario_atual),
    filtros: FiltrosProcesso = Depends(obter_filtros),
) -> Response:
    processos = _carregar(db, filtros)
    agora = datetime.now(timezone.utc)

    buffer = io.BytesIO()
    documento = SimpleDocTemplate(
        buffer,
        pagesize=landscape(A4),
        leftMargin=15 * mm,
        rightMargin=15 * mm,
        topMargin=15 * mm,
        bottomMargin=15 * mm,
        title="Relatório Jurídico — Renault Geely",
    )

    estilos = getSampleStyleSheet()
    titulo = ParagraphStyle(
        "TituloRenault", parent=estilos["Title"], fontSize=18, textColor=AZUL_ESCURO, alignment=0
    )
    subtitulo = ParagraphStyle("Sub", parent=estilos["Normal"], fontSize=9, textColor=CINZA)
    secao = ParagraphStyle(
        "Secao", parent=estilos["Heading2"], fontSize=12, textColor=AZUL_RENAULT, spaceBefore=12
    )

    elementos = [
        Paragraph("RENAULT GEELY — Gestão Jurídica", titulo),
        Paragraph("Relatório consolidado de processos e exposição jurídica", subtitulo),
        Spacer(1, 6),
        Paragraph(f"Gerado em {agora:%d/%m/%Y %H:%M} UTC por {usuario.nome}", subtitulo),
        Paragraph(f"Filtros: {_descrever_filtros(filtros)}", subtitulo),
        Spacer(1, 10),
        Paragraph("Indicadores", secao),
    ]

    ativos = len([p for p in processos if p.status == StatusProcesso.ATIVO])
    criticos = len([p for p in processos if p.risco == FaixaRisco.CRITICO])
    causa_total = sum(float(p.valor_causa or 0) for p in processos)
    risco_total = sum(float(p.valor_risco or 0) for p in processos)

    indicadores = Table(
        [
            ["Total de processos", "Ativos", "Risco crítico", "Valor das causas", "Valor em risco"],
            [
                str(len(processos)),
                str(ativos),
                str(criticos),
                formatar_moeda(causa_total),
                formatar_moeda(risco_total),
            ],
        ],
        colWidths=[52 * mm] * 5,
    )
    indicadores.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), AZUL_ESCURO),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("FONTNAME", (0, 1), (-1, 1), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, -1), 9),
                ("ALIGN", (0, 0), (-1, -1), "CENTER"),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("TOPPADDING", (0, 0), (-1, -1), 7),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
                ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#CBD5E1")),
            ]
        )
    )
    elementos += [indicadores, Paragraph("Distribuição por natureza", secao)]

    linhas_natureza = [["Natureza", "Processos", "Valor da causa", "Valor em risco"]] + [
        [item.label, str(item.quantidade), formatar_moeda(item.valor_causa), formatar_moeda(item.valor_risco)]
        for item in _agrupar(processos, "natureza")
    ]
    tabela_natureza = Table(linhas_natureza, colWidths=[70 * mm, 30 * mm, 80 * mm, 80 * mm])
    tabela_natureza.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), AZUL_RENAULT),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, -1), 8),
                ("GRID", (0, 0), (-1, -1), 0.3, colors.HexColor("#E2E8F0")),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F8FAFC")]),
                ("ALIGN", (1, 1), (-1, -1), "RIGHT"),
            ]
        )
    )
    elementos += [tabela_natureza, Paragraph("Processos (até 60 registros de maior risco)", secao)]

    estilo_celula = ParagraphStyle("Celula", parent=estilos["Normal"], fontSize=7, leading=9)
    linhas = [
        [
            Paragraph("<b>Número dos Autos</b>", estilo_celula),
            Paragraph("<b>Autor/Réu</b>", estilo_celula),
            Paragraph("<b>Natureza</b>", estilo_celula),
            Paragraph("<b>Comarca</b>", estilo_celula),
            Paragraph("<b>Fase</b>", estilo_celula),
            Paragraph("<b>Status</b>", estilo_celula),
            Paragraph("<b>Risco</b>", estilo_celula),
            Paragraph("<b>Valor da causa</b>", estilo_celula),
            Paragraph("<b>Valor do risco</b>", estilo_celula),
        ]
    ]
    for p in processos[:60]:
        linhas.append(
            [
                Paragraph(p.numero_autos, estilo_celula),
                Paragraph((p.autor_reu or "")[:60], estilo_celula),
                Paragraph(p.natureza, estilo_celula),
                Paragraph(p.comarca or "—", estilo_celula),
                Paragraph(p.fase_processual, estilo_celula),
                Paragraph(p.status, estilo_celula),
                Paragraph(p.risco, estilo_celula),
                Paragraph(formatar_moeda(float(p.valor_causa or 0)), estilo_celula),
                Paragraph(formatar_moeda(float(p.valor_risco or 0)), estilo_celula),
            ]
        )

    tabela = Table(
        linhas,
        colWidths=[38 * mm, 48 * mm, 22 * mm, 26 * mm, 26 * mm, 16 * mm, 16 * mm, 30 * mm, 30 * mm],
        repeatRows=1,
    )
    tabela.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), AZUL_ESCURO),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("GRID", (0, 0), (-1, -1), 0.3, colors.HexColor("#E2E8F0")),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F8FAFC")]),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ]
        )
    )
    elementos.append(tabela)

    documento.build(elementos)
    buffer.seek(0)

    nome = f"relatorio_juridico_{agora:%Y%m%d_%H%M}.pdf"
    return Response(
        content=buffer.getvalue(),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{nome}"'},
    )
