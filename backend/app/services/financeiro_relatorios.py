"""Relatórios do módulo financeiro, sempre calculados a partir dos lançamentos.

| Relatório          | Equivale a                         |
|--------------------|------------------------------------|
| `rap`              | aba RAP PAGAMENTOS (blocos 1 e 2)  |
| `resultado`        | aba Resultado                      |
| `analise_dinamica` | aba LGPD (tabela dinâmica), para qualquer EDOA |
| `plano_honorarios` | aba Honorarios Variaveis, com a coluna REAL funcionando |

Os lançamentos do ano cabem em memória (alguns milhares de linhas), então as
somas são feitas em Python: dezenas de critérios diferentes por relatório
custariam dezenas de consultas ao banco.

Comparação de texto: sem diferenciar maiúscula/minúscula, acento e espaços —
o SUMIF do Excel já ignora maiúsculas ("consumidor" soma "Consumidor").
"""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.financeiro import (
    ExercicioFinanceiro,
    ItemOrcamento,
    Lancamento,
    LinhaResultadoConfig,
    Recorrencia,
)
from app.services.financeiro import MESES_NOME
from app.services.normalizacao import chave

# Agrupamento da recorrência no bloco 2 do RAP e no plano de honorários.
# A planilha soma REAL FIXO com "Fixo" e REAL VARIÁVEL com "Variável" — mas os
# lançamentos dizem "Variável pontual", então o REAL VARIÁVEL da planilha dá
# sempre zero. O fixo segue a planilha à risca (só "Fixo"); o variável aceita
# as duas grafias. "Fixo valor variável" fica na coluna "outros".
GRUPO_FIXO = {chave(Recorrencia.FIXO)}
GRUPO_VARIAVEL = {chave(Recorrencia.VARIAVEL_PONTUAL), chave("Variável")}

DIMENSOES = {
    "area": "Área",
    "motivo": "Motivo",
    "recorrencia": "Recorrência",
    "categoria": "Categoria",
    "status": "Status",
    "edoa": "EDOA",
    "tipo_pagamento": "Pagamento",
    "centro_custo": "Centro de custo",
    "conta_contabil": "Conta contábil",
    "mes": "Mês",
}

SEM_VALOR = "(vazio)"


@dataclass
class LinhaBase:
    """Um lançamento reduzido ao que os relatórios precisam."""

    valor: float
    mes: int | None
    campos: dict[str, str | None]  # texto original
    chaves: dict[str, str]  # texto normalizado, para comparar


def ano_padrao(db: Session) -> int:
    """O ano mais recente que tem lançamento; sem nada, o último exercício cadastrado."""
    ano = db.scalar(select(func.max(Lancamento.ano_referencia)))
    if ano:
        return int(ano)
    ano = db.scalar(select(func.max(ExercicioFinanceiro.ano)))
    if ano:
        return int(ano)
    from datetime import datetime, timezone

    return datetime.now(timezone.utc).year


def mes_fechamento_padrao(db: Session, ano: int) -> int:
    exercicio = db.get(ExercicioFinanceiro, ano)
    return exercicio.mes_fechamento if exercicio else 12


def carregar_base(db: Session, ano: int) -> list[LinhaBase]:
    colunas = ["area", "motivo", "recorrencia", "categoria", "status", "edoa", "tipo_pagamento", "centro_custo", "conta_contabil"]
    linhas = db.execute(
        select(Lancamento.valor, Lancamento.mes_referencia_num, *[getattr(Lancamento, c) for c in colunas]).where(
            Lancamento.ano_referencia == ano
        )
    ).all()

    base = []
    for linha in linhas:
        valor, mes, *textos = linha
        campos = dict(zip(colunas, textos))
        campos["mes"] = MESES_NOME[mes - 1] if mes else None
        base.append(
            LinhaBase(
                valor=float(valor or 0),
                mes=int(mes) if mes else None,
                campos=campos,
                chaves={c: chave(v) if v else "" for c, v in campos.items()},
            )
        )
    return base


def _opcoes(filtro: str | None) -> set[str] | None:
    """"A|B" -> {chave(A), chave(B)}; vazio -> None (sem filtro)."""
    if not filtro:
        return None
    return {chave(parte) for parte in filtro.split("|") if parte.strip()}


def somar(
    base: list[LinhaBase],
    *,
    edoa: str | None = None,
    area: str | None = None,
    categoria: str | None = None,
    recorrencias: set[str] | None = None,
    mes_ate: int | None = None,
    mes: int | None = None,
) -> tuple[float, int]:
    """Soma e conta os lançamentos que atendem ao critério (equivalente ao SUMIFS)."""
    edoas, areas, categorias = _opcoes(edoa), _opcoes(area), _opcoes(categoria)
    total, quantidade = 0.0, 0
    for linha in base:
        if edoas is not None and linha.chaves["edoa"] not in edoas:
            continue
        if areas is not None and linha.chaves["area"] not in areas:
            continue
        if categorias is not None and linha.chaves["categoria"] not in categorias:
            continue
        if recorrencias is not None and linha.chaves["recorrencia"] not in recorrencias:
            continue
        if mes is not None and linha.mes != mes:
            continue
        if mes_ate is not None and (linha.mes is None or linha.mes > mes_ate):
            continue
        total += linha.valor
        quantidade += 1
    return round(total, 2), quantidade


def _pct(parte: float, todo: float) -> float:
    return round(parte / todo * 100, 1) if todo else 0.0


# --------------------------------------------------------------------------
# RAP — Orçamento × Realizado
# --------------------------------------------------------------------------


def rap(db: Session, ano: int, mes_fechamento: int | None = None) -> dict:
    mes = mes_fechamento or mes_fechamento_padrao(db, ano)
    base = carregar_base(db, ano)

    itens = db.scalars(
        select(ItemOrcamento)
        .where(ItemOrcamento.ano == ano, ItemOrcamento.origem.like("RAP PAGAMENTOS%"))
        .order_by(ItemOrcamento.bloco, ItemOrcamento.ordem, ItemOrcamento.id)
    ).all()

    def realizado(item: ItemOrcamento, **extra) -> tuple[float, float]:
        """(realizado até o mês de fechamento, realizado no ano)."""
        if item.realizado_manual is not None and not extra:
            manual = float(item.realizado_manual)
            return manual, manual
        ate, _ = somar(base, edoa=item.filtro_edoa, area=item.filtro_area, mes_ate=mes, **extra)
        no_ano, _ = somar(base, edoa=item.filtro_edoa, area=item.filtro_area, **extra)
        return ate, no_ano

    def valores(budget: float, ate: float, no_ano: float) -> dict:
        previsto = round(budget / 12 * mes, 2)
        return {
            "budget": round(budget, 2),
            "previsto": previsto,
            "realizado": ate,
            "realizado_ano": no_ano,
            "gap": round(previsto - ate, 2),
            "restante": round(budget - no_ano, 2),
            "consumido_percentual": _pct(no_ano, budget),
        }

    # ---------------- Bloco 1: EDOA × Área ----------------
    grupos: dict[str, dict] = {}
    edoas_cobertos: set[str] = set()
    for item in (i for i in itens if i.bloco == 1):
        grupo = item.grupo or item.edoa or "Sem EDOA"
        destino = grupos.setdefault(grupo, {"grupo": grupo, "linhas": [], "total": None})
        filtro_recorrencia = {chave(item.filtro_recorrencia)} if item.filtro_recorrencia else None
        ate, no_ano = realizado(item) if not filtro_recorrencia else realizado(item, recorrencias=filtro_recorrencia)
        for parte in (_opcoes(item.filtro_edoa) or set()):
            edoas_cobertos.add(parte)
        destino["linhas"].append(
            {
                "id": item.id,
                "rotulo": item.rotulo,
                "nivel": item.nivel,
                "linha_planilha": item.linha_planilha,
                "regra": {
                    "edoa": item.filtro_edoa,
                    "area": item.filtro_area,
                    "recorrencia": item.filtro_recorrencia,
                    "origem": item.regra_origem or "inferida",
                    "realizado_manual": float(item.realizado_manual) if item.realizado_manual is not None else None,
                },
                **valores(float(item.budget_anual or 0), ate, no_ano),
            }
        )

    # Alertas de critério: o mesmo gasto somado em duas linhas, ou linha que
    # soma um EDOA diferente do grupo onde está.
    por_criterio: dict[tuple, list[tuple[str, dict]]] = defaultdict(list)
    for grupo in grupos.values():
        for linha in grupo["linhas"]:
            regra = linha["regra"]
            linha["alertas"] = []
            if regra["realizado_manual"] is not None:
                continue
            chave_regra = (chave(regra["edoa"] or ""), chave(regra["area"] or ""), chave(regra["recorrencia"] or ""))
            por_criterio[chave_regra].append((grupo["grupo"], linha))
            if regra["edoa"] and chave(regra["edoa"]) != chave(grupo["grupo"]) and linha["nivel"] == "area":
                linha["alertas"].append(
                    f"Soma lançamentos do EDOA {regra['edoa']}, não de {grupo['grupo']}."
                )
            if regra["origem"] == "inferida":
                linha["alertas"].append(
                    "Critério inferido pelo rótulo: na planilha esta linha não tem fórmula válida."
                )
    for repetidas in por_criterio.values():
        # Só interessa quando há dinheiro de fato sendo contado duas vezes.
        if len(repetidas) < 2 or all(abs(l["realizado_ano"]) < 0.01 for _, l in repetidas):
            continue
        for grupo_nome, linha in repetidas:
            outras = [f"{g} / {l['rotulo'] or '(total)'}" for g, l in repetidas if l is not linha]
            linha["alertas"].append(
                "Mesmo critério de soma que " + ", ".join(outras) + " — o mesmo gasto aparece duas vezes."
            )

    bloco1 = []
    budget_total = 0.0
    for grupo in grupos.values():
        linha_total = next((l for l in grupo["linhas"] if l["nivel"] == "edoa"), None)
        if linha_total is not None:
            total = {k: linha_total[k] for k in ("budget", "previsto", "realizado", "realizado_ano", "gap", "restante", "consumido_percentual")}
            total["origem"] = "linha do EDOA"
        else:
            soma = lambda k: round(sum(l[k] for l in grupo["linhas"]), 2)  # noqa: E731
            budget = soma("budget")
            total = {
                "budget": budget,
                "previsto": soma("previsto"),
                "realizado": soma("realizado"),
                "realizado_ano": soma("realizado_ano"),
                "gap": soma("gap"),
                "restante": soma("restante"),
                "consumido_percentual": _pct(soma("realizado_ano"), budget),
                "origem": "soma das áreas",
            }
        grupo["total"] = total
        budget_total += total["budget"]
        bloco1.append(grupo)

    # ---------------- Bloco 2: Honorários por área, fixo × variável ----------------
    bloco2 = []
    for item in (i for i in itens if i.bloco == 2):
        total_ate, total_ano = realizado(item)
        fixo_ate, fixo_ano = realizado(item, recorrencias=GRUPO_FIXO)
        var_ate, var_ano = realizado(item, recorrencias=GRUPO_VARIAVEL)
        bloco2.append(
            {
                "id": item.id,
                "area": item.rotulo or item.area,
                "edoa": item.filtro_edoa,
                "total": valores(float(item.budget_anual or 0), total_ate, total_ano),
                "fixo": valores(float(item.budget_fixo or 0), fixo_ate, fixo_ano),
                "variavel": valores(float(item.budget_variavel or 0), var_ate, var_ano),
                "sem_classificacao_ano": round(total_ano - fixo_ano - var_ano, 2),
            }
        )

    # Gasto em EDOA que nenhuma linha do RAP cobre.
    gasto_por_edoa: dict[str, float] = defaultdict(float)
    nome_edoa: dict[str, str] = {}
    for linha in base:
        gasto_por_edoa[linha.chaves["edoa"]] += linha.valor
        nome_edoa.setdefault(linha.chaves["edoa"], linha.campos["edoa"] or "Sem EDOA")
    sem_orcamento = [
        {"edoa": nome_edoa[k], "realizado_ano": round(v, 2)}
        for k, v in sorted(gasto_por_edoa.items(), key=lambda par: -par[1])
        if k not in edoas_cobertos and abs(v) >= 0.01
    ]

    realizado_ano_total = round(sum(l.valor for l in base), 2)
    realizado_ate_total = round(sum(l.valor for l in base if l.mes and l.mes <= mes), 2)
    previsto_total = round(budget_total / 12 * mes, 2)

    return {
        "ano": ano,
        "mes_fechamento": mes,
        "mes_fechamento_nome": MESES_NOME[mes - 1],
        "totais": {
            "budget": round(budget_total, 2),
            "previsto": previsto_total,
            "realizado": realizado_ate_total,
            "realizado_ano": realizado_ano_total,
            "gap": round(previsto_total - realizado_ate_total, 2),
            "restante": round(budget_total - realizado_ano_total, 2),
            "consumido_percentual": _pct(realizado_ano_total, budget_total),
        },
        "bloco1": bloco1,
        "bloco2": bloco2,
        "sem_orcamento": sem_orcamento,
        "observacoes": [
            f"PREVISTO = budget anual ÷ 12 × {mes} (mês de fechamento), como na planilha.",
            f"REALIZADO considera os lançamentos até {MESES_NOME[mes - 1]}; REALIZADO NO ANO, todos. "
            "A planilha soma o ano inteiro contra o previsto do mês de fechamento — por isso o GAP dela "
            "fica muito negativo quando o mês de fechamento não é atualizado.",
            "No detalhamento de honorários, REAL FIXO soma a recorrência 'Fixo' (igual à planilha) e "
            "REAL VARIÁVEL soma 'Variável pontual'. Na planilha o REAL VARIÁVEL sai sempre zero, porque "
            "a fórmula procura 'Variável' e os lançamentos dizem 'Variável pontual'. O que não é nem um "
            "nem outro ('Fixo valor variável' ou sem recorrência) aparece em OUTROS.",
            "O total geral usa a linha do EDOA quando ela existe e, senão, a soma das áreas — somar os "
            "dois níveis contaria o mesmo orçamento duas vezes.",
        ],
    }


# --------------------------------------------------------------------------
# Resultado — Categoria × DOA × mês
# --------------------------------------------------------------------------


def resultado(db: Session, ano: int, mes: int | None) -> dict:
    base = carregar_base(db, ano)
    layout = db.scalars(
        select(LinhaResultadoConfig).where(LinhaResultadoConfig.ano == ano).order_by(LinhaResultadoConfig.ordem)
    ).all()

    linhas = []
    cobertos: set[int] = set()  # índices de lançamentos já cobertos por alguma linha

    if layout:
        for config in layout:
            categorias = _opcoes(config.filtro_categoria or config.categoria)
            edoas = _opcoes(config.filtro_edoa)
            valor_mes = valor_ano = 0.0
            quantidade = 0
            for indice, linha in enumerate(base):
                if categorias is not None and linha.chaves["categoria"] not in categorias:
                    continue
                if edoas is not None and linha.chaves["edoa"] not in edoas:
                    continue
                cobertos.add(indice)
                valor_ano += linha.valor
                quantidade += 1
                if mes and linha.mes == mes:
                    valor_mes += linha.valor
            linhas.append(
                {
                    "ordem": config.ordem,
                    "categoria": config.categoria,
                    "doa": config.doa,
                    "impacto": config.impacto,
                    "valor_mes": round(valor_mes, 2),
                    "valor_ano": round(valor_ano, 2),
                    "quantidade": quantidade,
                    "regra_origem": config.regra_origem,
                    "filtro_edoa": config.filtro_edoa,
                }
            )

    # Combinações categoria × EDOA com gasto que nenhuma linha do layout mostra.
    nao_mapeados: dict[tuple[str, str], dict] = {}
    for indice, linha in enumerate(base):
        if indice in cobertos or not linha.campos["categoria"]:
            continue
        chave_par = (linha.campos["categoria"], linha.campos["edoa"] or "Sem EDOA")
        item = nao_mapeados.setdefault(
            chave_par,
            {"categoria": chave_par[0], "doa": chave_par[1], "impacto": None, "valor_mes": 0.0, "valor_ano": 0.0, "quantidade": 0},
        )
        item["valor_ano"] += linha.valor
        item["quantidade"] += 1
        if mes and linha.mes == mes:
            item["valor_mes"] += linha.valor
    extras = sorted(
        ({**v, "valor_mes": round(v["valor_mes"], 2), "valor_ano": round(v["valor_ano"], 2)} for v in nao_mapeados.values()),
        key=lambda v: -v["valor_ano"],
    )

    por_impacto: dict[str, dict] = {}
    for linha in linhas:
        grupo = por_impacto.setdefault(
            linha["impacto"] or "Sem impacto", {"impacto": linha["impacto"] or "Sem impacto", "valor_mes": 0.0, "valor_ano": 0.0}
        )
        grupo["valor_mes"] = round(grupo["valor_mes"] + linha["valor_mes"], 2)
        grupo["valor_ano"] = round(grupo["valor_ano"] + linha["valor_ano"], 2)

    sem_categoria = round(sum(l.valor for l in base if not l.campos["categoria"]), 2)

    return {
        "ano": ano,
        "mes": mes,
        "mes_nome": MESES_NOME[mes - 1] if mes else None,
        "tem_layout": bool(layout),
        "linhas": linhas,
        "nao_mapeados": extras,
        "por_impacto": sorted(por_impacto.values(), key=lambda g: -g["valor_ano"]),
        "total_mes": round(sum(l["valor_mes"] for l in linhas), 2),
        "total_ano": round(sum(l["valor_ano"] for l in linhas), 2),
        "total_nao_mapeado_ano": round(sum(e["valor_ano"] for e in extras), 2),
        "total_sem_categoria_ano": sem_categoria,
    }


# --------------------------------------------------------------------------
# Análise dinâmica (aba LGPD, para qualquer EDOA)
# --------------------------------------------------------------------------


def analise_dinamica(
    db: Session,
    ano: int,
    edoa: str | None,
    linha1: str = "area",
    linha2: str | None = "motivo",
    coluna: str = "recorrencia",
    mes_de: int | None = None,
    mes_ate: int | None = None,
) -> dict:
    for dimensao in (linha1, linha2, coluna):
        if dimensao and dimensao not in DIMENSOES:
            raise ValueError(f"Dimensão desconhecida: {dimensao}")

    edoas = _opcoes(edoa)
    base = [
        l
        for l in carregar_base(db, ano)
        if (edoas is None or l.chaves["edoa"] in edoas)
        and (mes_de is None or (l.mes and l.mes >= mes_de))
        and (mes_ate is None or (l.mes and l.mes <= mes_ate))
    ]

    def rotulo(linha: LinhaBase, dimensao: str) -> str:
        return linha.campos.get(dimensao) or SEM_VALOR

    ordem_colunas = MESES_NOME if coluna == "mes" else None
    colunas_vistas = {rotulo(l, coluna) for l in base}
    colunas = (
        [c for c in ordem_colunas if c in colunas_vistas] + sorted(colunas_vistas - set(ordem_colunas))
        if ordem_colunas
        else sorted(colunas_vistas, key=lambda c: (c == SEM_VALOR, c.lower()))
    )

    arvore: dict[str, dict] = {}
    for linha in base:
        nivel1 = arvore.setdefault(rotulo(linha, linha1), {"valores": defaultdict(float), "filhos": {}})
        nivel1["valores"][rotulo(linha, coluna)] += linha.valor
        if linha2:
            nivel2 = nivel1["filhos"].setdefault(rotulo(linha, linha2), defaultdict(float))
            nivel2[rotulo(linha, coluna)] += linha.valor

    def empacotar(nome: str, valores: dict[str, float]) -> dict:
        return {
            "rotulo": nome,
            "valores": {c: round(valores.get(c, 0.0), 2) for c in colunas},
            "total": round(sum(valores.values()), 2),
        }

    linhas = []
    for nome, dados in sorted(arvore.items(), key=lambda par: -sum(par[1]["valores"].values())):
        item = empacotar(nome, dados["valores"])
        item["filhos"] = [
            empacotar(filho, valores)
            for filho, valores in sorted(dados["filhos"].items(), key=lambda par: -sum(par[1].values()))
        ]
        linhas.append(item)

    total_colunas: dict[str, float] = defaultdict(float)
    for linha in base:
        total_colunas[rotulo(linha, coluna)] += linha.valor

    return {
        "ano": ano,
        "edoa": edoa,
        "dimensoes": {"linha1": linha1, "linha2": linha2, "coluna": coluna},
        "rotulos_dimensoes": DIMENSOES,
        "colunas": colunas,
        "linhas": linhas,
        "total": empacotar("Total Geral", total_colunas),
        "quantidade": len(base),
    }


# --------------------------------------------------------------------------
# Plano de honorários (aba Honorarios Variaveis) × realizado
# --------------------------------------------------------------------------


def _grupo_recorrencia(recorrencia: str | None) -> str:
    k = chave(recorrencia) if recorrencia else ""
    if k in GRUPO_FIXO:
        return "Fixo"
    if k in GRUPO_VARIAVEL:
        return "Variável pontual"
    if k == chave(Recorrencia.FIXO_VALOR_VARIAVEL):
        return "Fixo valor variável"
    return "Sem recorrência"


def plano_honorarios(db: Session, ano: int) -> dict:
    base = carregar_base(db, ano)
    itens = db.scalars(
        select(ItemOrcamento)
        .where(ItemOrcamento.ano == ano, ItemOrcamento.origem == "Honorários Variáveis")
        .order_by(ItemOrcamento.ordem, ItemOrcamento.id)
    ).all()

    linhas = []
    grupos: dict[tuple[str, str, str], dict] = {}
    for item in itens:
        meses = {p.mes: float(p.valor) for p in item.plano_mensal}
        plano = [round(meses.get(m, 0.0), 2) for m in range(1, 13)]
        grupo_rec = _grupo_recorrencia(item.recorrencia)
        linhas.append(
            {
                "id": item.id,
                "edoa": item.edoa,
                "area": item.area,
                "detalhamento": item.detalhamento,
                "recorrencia": item.recorrencia,
                "meses": plano,
                "soma_meses": round(sum(plano), 2),
                "budget": round(float(item.budget_anual or 0), 2),
            }
        )
        chave_grupo = (item.edoa or "Sem EDOA", item.area or "Sem área", grupo_rec)
        grupo = grupos.setdefault(
            chave_grupo,
            {"edoa": chave_grupo[0], "area": chave_grupo[1], "recorrencia": grupo_rec, "budget": 0.0, "plano_meses": [0.0] * 12},
        )
        grupo["budget"] += float(item.budget_anual or 0)
        grupo["plano_meses"] = [round(a + b, 2) for a, b in zip(grupo["plano_meses"], plano)]

    for grupo in grupos.values():
        recorrencias = {
            "Fixo": GRUPO_FIXO,
            "Variável pontual": GRUPO_VARIAVEL,
            "Fixo valor variável": {chave(Recorrencia.FIXO_VALOR_VARIAVEL)},
        }.get(grupo["recorrencia"])
        real, quantidade = somar(
            base,
            edoa=grupo["edoa"] if grupo["edoa"] != "Sem EDOA" else None,
            area=grupo["area"] if grupo["area"] != "Sem área" else None,
            recorrencias=recorrencias,
        )
        real_meses = [
            somar(
                base,
                edoa=grupo["edoa"] if grupo["edoa"] != "Sem EDOA" else None,
                area=grupo["area"] if grupo["area"] != "Sem área" else None,
                recorrencias=recorrencias,
                mes=m,
            )[0]
            for m in range(1, 13)
        ]
        grupo.update(
            {
                "budget": round(grupo["budget"], 2),
                "real": real,
                "quantidade_lancamentos": quantidade,
                "real_meses": real_meses,
                "saldo": round(grupo["budget"] - real, 2),
                "consumido_percentual": _pct(real, grupo["budget"]),
            }
        )

    return {
        "ano": ano,
        "itens": linhas,
        "grupos": sorted(grupos.values(), key=lambda g: (g["edoa"], g["area"], g["recorrencia"])),
        "budget_total": round(sum(l["budget"] for l in linhas), 2),
        "real_total": round(sum(g["real"] for g in grupos.values()), 2),
        "observacao": (
            "Na planilha a coluna REAL desta aba está quebrada (#REF!). Aqui o realizado é somado por "
            "EDOA + área + recorrência: vários itens do plano dividem o mesmo contrato, e o lançamento "
            "não diz a qual item pertence — por isso o realizado aparece por grupo, não por item."
        ),
    }
