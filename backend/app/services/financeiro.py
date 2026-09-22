"""Importador da planilha de pagamentos do Jurídico (arquivo multi-aba).

Cada aba tem um tratamento próprio:

| Aba                   | Destino                                                  |
|-----------------------|----------------------------------------------------------|
| Base                  | `dominios_financeiros` (listas de domínio)               |
| RF MENSAL             | `contas_contabeis`                                       |
| Controle Lançamentos  | `lancamentos`                                            |
| Adiantamentos         | `adiantamentos`                                          |
| Devoluções            | `devolucoes`                                             |
| RAP PAGAMENTOS        | `orcamento_itens` — budget + critério do realizado       |
| Honorarios Variaveis  | `orcamento_itens` + plano mensal                         |
| Mensais               | `orcamento_itens` (contratos recorrentes)                |
| Resultado             | `resultado_linhas` — layout e critério de cada linha     |
| LGPD                  | nada: é tabela dinâmica, recalculada pelo sistema        |

Regras gerais:

* **Os valores calculados nunca são importados.** PREVISTO, REALIZADO, GAP,
  os totais do Resultado e a tabela dinâmica LGPD saem sempre dos lançamentos.
* **O ano vem do arquivo.** "Pagamentos_Juridico_2024.xlsm" é o exercício 2024
  — inclusive os pagamentos liquidados em 2025 que estão nele.
* **Reimportar o mesmo ano substitui.** Linhas que já não estão na planilha
  saem do sistema; linhas cadastradas à mão no sistema nunca são tocadas.
"""

from __future__ import annotations

import hashlib
import re
import time
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from datetime import datetime, timezone

import pandas as pd
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.models.financeiro import (
    Adiantamento,
    ContaContabil,
    Devolucao,
    DominioFinanceiro,
    ExercicioFinanceiro,
    ItemOrcamento,
    Lancamento,
    LinhaResultadoConfig,
    PlanoMensal,
    derivar_status_adiantamento,
    derivar_status_lancamento,
)
from app.models.importacao import Importacao, Inconsistencia, StatusImportacao, TipoImportacao
from app.models.usuario import Usuario
from app.services import normalizacao as norm
from app.services.formulas import Grade, avaliar_aritmetica, carregar_grades, extrair_criterio_soma
from app.services.leitura import PlanilhaInvalida, limpar_texto, listar_abas, ler_aba

# --------------------------------------------------------------------------
# Identificação das abas
# --------------------------------------------------------------------------

# Aba -> destino interno. A comparação é por `chave()`: acento, caixa e espaço
# sobrando no nome da aba não atrapalham.
ABAS_CONHECIDAS: dict[str, str] = {
    "controle lancamentos": "lancamentos",
    "lancamentos": "lancamentos",
    "controle de lancamentos": "lancamentos",
    "adiantamentos": "adiantamentos",
    "devolucoes": "devolucoes",
    "rap pagamentos": "rap",
    "restos a pagar": "rap",
    "honorarios variaveis": "honorarios",
    "mensais": "mensais",
    "base": "base",
    "rf mensal": "contas",
    "resultado": "resultado",
}

# Abas que são só tabela dinâmica: reconhecidas, mas nada é gravado.
ABAS_DERIVADAS = {"lgpd"}

# Ordem de processamento: os domínios (Base) primeiro, porque alimentam a
# padronização das demais abas.
ORDEM_DESTINOS = [
    "base", "contas", "lancamentos", "adiantamentos", "devolucoes",
    "rap", "honorarios", "mensais", "resultado",
]

DESCRICAO_DESTINO = {
    "base": "Cadastros (listas de domínio)",
    "contas": "Plano de contas",
    "lancamentos": "Lançamentos",
    "adiantamentos": "Adiantamentos",
    "devolucoes": "Devoluções",
    "rap": "Orçamento — RAP (budget e critério do realizado)",
    "honorarios": "Orçamento — plano mensal de honorários",
    "mensais": "Orçamento — contratos recorrentes",
    "resultado": "Layout do relatório Resultado",
    "derivada": "Tabela dinâmica — recalculada pelo sistema",
}

MESES = {
    "janeiro": 1, "fevereiro": 2, "marco": 3, "abril": 4, "maio": 5, "junho": 6,
    "julho": 7, "agosto": 8, "setembro": 9, "outubro": 10, "novembro": 11, "dezembro": 12,
    "jan": 1, "fev": 2, "mar": 3, "abr": 4, "mai": 5, "jun": 6,
    "jul": 7, "ago": 8, "set": 9, "out": 10, "nov": 11, "dez": 12,
}
MESES_NOME = [
    "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
]

# --------------------------------------------------------------------------
# Mapeamento de colunas por aba
# --------------------------------------------------------------------------

COLUNAS_LANCAMENTOS = {
    "status": ["status"],
    "categoria": ["categoria"],
    "area": ["area"],
    "tipo_pagamento": ["pagamento", "tipo de pagamento"],
    "referencia": ["referencia"],
    "motivo": ["motivo"],
    "valor": ["valor"],
    "mes_referencia": ["mes referencia", "mes de referencia", "mes"],
    "data_pagamento": ["data pagamento", "data do pagamento"],
    "recorrencia": ["recorrencia"],
    "descricao": ["descricao"],
    "rc": ["rc"],
    "numero_pedido": ["n pedido", "no pedido", "numero pedido", "pedido"],
    "recepcao": ["recepcao"],
    "item": ["item"],
    "chamado": ["chamado"],
    "edoa": ["edoa"],
    "centro_custo": ["centro de custo", "centro custo"],
    "conta_contabil": ["conta contabil"],
    "envio_para_pagamento": ["envio para pagamento", "envio pagamento"],
    "documento_pago": ["pago n documento", "pago no documento", "n documento", "documento"],
}

COLUNAS_ADIANTAMENTOS = {
    "status": ["status"],
    "conferido_planilha": ["ok na planilha de pagamentos", "ok na planilha"],
    "area": ["area"],
    "valor": ["valor"],
    "chamado_adiantamento": ["chamado do adiantamento", "chamado adiantamento"],
    "doa": ["doa"],
    "chamado_baixa": ["n chamado da baixa", "chamado da baixa", "no chamado da baixa"],
    "valor_excedente": ["valor excedente"],
    "valor_total": ["valor total do adiantamento", "valor total"],
    "documento_baixa": ["baixa do adiantamento", "baixa"],
    "escritorio": ["escritorio"],
}

COLUNAS_DEVOLUCOES = {
    "area": ["area"],
    "fornecedor": ["fornecedor"],
    "codigo_banco": ["codigo do banco", "codigo banco"],
    "data_transferencia": ["data transf", "data transferencia", "data da transferencia"],
    "pasta_benner": ["pasta benner", "pasta"],
    "valor_devolvido": ["valor devolvido", "valor"],
    "chamado": ["n chamado", "no chamado", "chamado"],
    "documento": ["documento"],
    "observacao": ["observacao", "obs"],
}

COLUNAS_RAP = {
    "edoa": ["edoa"],
    "area": ["area"],
    "budget_anual": ["budget anual", "budget"],
}

COLUNAS_HONORARIOS = {
    "edoa": ["doa", "edoa"],
    "area": ["area"],
    "detalhamento": ["detalhamento"],
    "recorrencia": ["recorrencia"],
    "budget_anual": ["budget"],
}

COLUNAS_MENSAIS = {
    "area": ["area"],
    "recorrencia": ["recorrencia"],
    "valor_mensal_contratado": ["valor mensal"],
    "budget_anual": ["anual"],
}

COLUNAS_CONTAS = {
    "diretoria": ["diretoria", "juridico"],
    "grupo": ["grupo", "fadm"],
    "centro_custo": ["centro de custo", "centro custo"],
    "conta": ["conta contabil", "conta"],
    "descricao": ["descricao"],
}

COLUNAS_RESULTADO = {"categoria": ["categoria"], "doa": ["doa"], "impacto": ["impacto"]}

# Aba Base: cada coluna é uma lista de domínio independente.
COLUNAS_BASE = {
    "Área": "area",
    "PAGAMENTO": "tipo_pagamento",
    "Fornecedor": "fornecedor",
    "Motivo": "motivo",
    "Fixo/Varíavel": "recorrencia",
    "Fixo/Variável": "recorrencia",
    "EDOA": "edoa",
}

TIPOS_DOMINIO = ["area", "tipo_pagamento", "fornecedor", "motivo", "recorrencia", "edoa", "categoria"]


def _aliases(mapa: dict[str, list[str]]) -> set[str]:
    return {norm.chave(a) for aliases in mapa.values() for a in aliases}


# --------------------------------------------------------------------------
# Padronização de domínios
# --------------------------------------------------------------------------

# Grafias canônicas fixas. As listas da aba Base são somadas a estas no momento
# da importação (ver `Padronizador`).
CANONICOS: dict[str, list[str]] = {
    "status": [
        "Lançar Pgto", "RC Criada", "Pedido Concluído", "Pedido Recepcionado",
        "Enviado para pagamento", "Pago",
    ],
    "tipo_pagamento": ["Interno", "Adiantamento"],
    "recorrencia": ["Fixo", "Fixo valor variável", "Variável pontual"],
    "area": [
        "Acordo Projeto SAC", "Cartório", "Cível", "Consumidor", "LGPD", "Outra área", "Outros",
        "Projuris", "RH Nossa", "Rede", "Serviços Terceirizados", "Societário", "Supramonte",
        "Trabalhista", "Tributário",
    ],
    "motivo": [
        "Acordo", "Acordo Projeto SAC", "Caso Cível", "Condenação", "Custas", "Custas Processuais",
        "Depósito Judicial", "Despesas", "Garantia Judicial - Fiscal", "Honorários", "Inicial",
        "Juros e correção", "Multa", "Outros", "Perícia", "PIF/PDV Condenação", "Projuris",
        "Recurso", "Seguro Garantia", "Serviços Terceirizados", "Supramonte",
    ],
}

_INDICE_CANONICO = {
    tipo: {norm.chave(valor): valor for valor in valores} for tipo, valores in CANONICOS.items()
}


def canonizar(valor: object, tipo: str | None = None) -> str | None:
    """Limpa o texto e, quando o domínio é conhecido, devolve a grafia canônica."""
    texto = limpar_texto(valor)
    if not texto or texto.lower() in {"nan", "nat", "none", "-", "--"}:
        return None
    if tipo and (canonico := _INDICE_CANONICO.get(tipo, {}).get(norm.chave(texto))):
        return canonico
    return texto


class Padronizador:
    """Unifica grafias diferentes do mesmo valor dentro de uma importação.

    A planilha traz "acordo", " Acordo" e "Acordo"; "JUROS E CORREÇÃO " e
    "juros e correção"; "RDB - div" e "RDB - DIV". Para cada campo, variações
    que só diferem em caixa, acento ou espaço viram uma grafia só:
      1. a grafia fixa do sistema (`CANONICOS`), se houver;
      2. senão, a grafia cadastrada na aba Base;
      3. senão, a grafia mais usada na própria planilha.
    Cada unificação é registrada para aparecer no resultado da importação.
    """

    def __init__(self, dominios: dict[str, set[str]]):
        self.dominios = {tipo: {norm.chave(v): v for v in valores} for tipo, valores in dominios.items()}
        self.escolhidos: dict[str, dict[str, str]] = defaultdict(dict)
        self.contagem: dict[tuple[str, str, str], int] = Counter()

    def preparar(self, tipo: str, valores: list[object]) -> None:
        """Olha todos os valores de uma coluna e escolhe a grafia de cada grupo."""
        frequencia: dict[str, Counter] = defaultdict(Counter)
        for bruto in valores:
            texto = limpar_texto(bruto)
            if texto:
                frequencia[norm.chave(texto)][texto] += 1

        for chave_valor, variantes in frequencia.items():
            escolhido = (
                _INDICE_CANONICO.get(tipo, {}).get(chave_valor)
                or self.dominios.get(tipo, {}).get(chave_valor)
                or variantes.most_common(1)[0][0]
            )
            self.escolhidos[tipo][chave_valor] = escolhido

    def __call__(self, tipo: str, bruto: object) -> str | None:
        texto = limpar_texto(bruto)
        if not texto or texto.lower() in {"nan", "nat", "none", "-", "--"}:
            return None
        final = self.escolhidos.get(tipo, {}).get(norm.chave(texto)) or canonizar(texto, tipo) or texto
        if final != str(bruto):
            self.contagem[(tipo, str(bruto), final)] += 1
        return final

    def resumo(self) -> list[dict]:
        """Só as unificações relevantes (não lista o simples corte de espaço)."""
        agrupado: dict[tuple[str, str], list[tuple[str, int]]] = defaultdict(list)
        for (tipo, de, para), quantidade in self.contagem.items():
            if limpar_texto(de) == para:
                continue
            agrupado[(tipo, para)].append((de, quantidade))
        return [
            {
                "campo": tipo,
                "para": para,
                "de": [f"{de!r}" for de, _ in sorted(variantes, key=lambda v: -v[1])],
                "quantidade": sum(q for _, q in variantes),
            }
            for (tipo, para), variantes in sorted(agrupado.items(), key=lambda item: -sum(q for _, q in item[1]))
        ]


def normalizar_mes(valor: object) -> tuple[str | None, int | None]:
    texto = limpar_texto(valor)
    if not texto:
        return None, None
    numero = MESES.get(norm.chave(texto))
    if numero:
        return MESES_NOME[numero - 1], numero
    # Mês vindo como número (1-12).
    try:
        possivel = int(float(texto))
        if 1 <= possivel <= 12:
            return MESES_NOME[possivel - 1], possivel
    except (TypeError, ValueError):
        pass
    return texto, None


def _identificador(*partes: object) -> str:
    """Impressão digital estável da linha — permite reimportar sem duplicar."""
    bruto = "|".join(limpar_texto(p).lower() for p in partes)
    return hashlib.sha256(bruto.encode("utf-8")).hexdigest()[:32]


def inferir_ano(nome_arquivo: str, conteudo: bytes | None = None) -> tuple[int, str]:
    """Descobre o exercício da planilha. Devolve (ano, de onde veio).

    1. Ano no nome do arquivo ("Pagamentos_Juridico_2024.xlsm").
    2. Ano mais frequente nas datas de envio/pagamento dos lançamentos.
    3. Ano corrente, como último recurso.
    """
    achou = re.search(r"(?<!\d)(20\d{2})(?!\d)", nome_arquivo or "")
    if achou:
        return int(achou.group(1)), "nome do arquivo"

    if conteudo:
        try:
            for aba in listar_abas(conteudo, nome_arquivo):
                if identificar_aba(aba) != "lancamentos":
                    continue
                df, _ = ler_aba(conteudo, nome_arquivo, aba, ALIASES_POR_DESTINO["lancamentos"])
                mapa = _mapear(list(df.columns), COLUNAS_LANCAMENTOS)
                anos: Counter[int] = Counter()
                for campo in ("envio_para_pagamento", "data_pagamento"):
                    if campo not in mapa:
                        continue
                    for bruto in df[mapa[campo]].dropna():
                        data, _ = norm.normalizar_data(bruto)
                        if data and 2000 <= data.year <= 2100:
                            anos[data.year] += 1
                if anos:
                    return anos.most_common(1)[0][0], "datas dos lançamentos"
        except PlanilhaInvalida:
            pass

    return datetime.now(timezone.utc).year, "ano corrente"


# --------------------------------------------------------------------------
# Resultado da importação
# --------------------------------------------------------------------------

CAMPOS_MONETARIOS = {
    "valor", "valor_excedente", "valor_total", "valor_devolvido",
    "budget_anual", "valor_mensal_contratado", "budget_fixo", "budget_variavel", "realizado_manual",
}


def _mesmo_valor(campo: str, atual, novo) -> bool:
    """Compara um campo já gravado com o valor recém-lido da planilha.

    Dinheiro exige tolerância: o banco devolve Decimal e a planilha produz float,
    e `Decimal("12953.91") == 12953.91` é False — o float não representa o
    centavo exatamente. Sem isso, toda reimportação marcaria milhares de linhas
    como "alteradas" sem que nada tivesse mudado.
    """
    if campo in CAMPOS_MONETARIOS:
        if atual is None or novo is None:
            return atual is None and novo is None
        return abs(float(atual or 0) - float(novo or 0)) < 0.005
    return atual == novo


def _aplicar_mudancas(objeto, dados: dict, ignorar: set[str] | None = None) -> bool:
    """Copia os campos para o objeto e diz se algo realmente mudou."""
    mudou = False
    for campo, valor_novo in dados.items():
        if ignorar and campo in ignorar:
            continue
        if not _mesmo_valor(campo, getattr(objeto, campo, None), valor_novo):
            setattr(objeto, campo, valor_novo)
            mudou = True
    return mudou


@dataclass
class ResultadoAba:
    aba: str
    destino: str
    linhas_lidas: int = 0
    criados: int = 0
    atualizados: int = 0
    removidos: int = 0
    ignorados: int = 0
    linha_cabecalho: int = 1
    problemas: list[tuple[int, str, str, str | None]] = field(default_factory=list)
    mensagem: str | None = None
    # Impressões digitais vistas nesta importação — o que NÃO estiver aqui e
    # tiver vindo de importação anterior do mesmo ano sai do sistema.
    vistos: set[str] = field(default_factory=set)


def _valor_de(linha: pd.Series, mapa: dict[str, str], campo: str):
    coluna = mapa.get(campo)
    if coluna is None:
        return None
    valor = linha.get(coluna)
    if valor is None or (isinstance(valor, float) and valor != valor):
        return None
    return valor


def _mapear(colunas: list[str], definicao: dict[str, list[str]]) -> dict[str, str]:
    """Casa os cabeçalhos reais da aba com os campos do sistema."""
    mapa: dict[str, str] = {}
    usadas: set[str] = set()
    for campo, aliases in definicao.items():
        alvos = {norm.chave(a) for a in aliases}
        for coluna in colunas:
            if coluna in usadas:
                continue
            if norm.chave(coluna) in alvos:
                mapa[campo] = coluna
                usadas.add(coluna)
                break
        if campo not in mapa:  # 2ª passada: casamento por conteúdo
            for coluna in colunas:
                if coluna in usadas:
                    continue
                k = norm.chave(coluna)
                if any(alvo in k or k in alvo for alvo in alvos if len(alvo) > 3):
                    mapa[campo] = coluna
                    usadas.add(coluna)
                    break
    return mapa


# --------------------------------------------------------------------------
# Handlers por aba
# --------------------------------------------------------------------------


def importar_lancamentos(
    db: Session,
    df: pd.DataFrame,
    resultado: ResultadoAba,
    importacao: Importacao,
    ano: int,
    padronizar: Padronizador,
    valores_de_formula: dict[int, float] | None = None,
) -> None:
    mapa = _mapear(list(df.columns), COLUNAS_LANCAMENTOS)
    if "valor" not in mapa:
        raise PlanilhaInvalida("A aba de lançamentos não tem a coluna 'Valor'.")

    for campo in ("area", "motivo", "edoa", "categoria", "recorrencia", "tipo_pagamento"):
        if campo in mapa:
            padronizar.preparar(campo, df[mapa[campo]].tolist())

    # Linhas idênticas legítimas (mesmo valor, mesma data, mesmo motivo) recebem
    # um número de ocorrência, para que ambas sobrevivam ao upsert.
    ocorrencias: Counter[str] = Counter()
    preparados: list[dict] = []

    for indice, linha in df.iterrows():
        numero_linha = int(indice)
        valor_bruto = _valor_de(linha, mapa, "valor")
        # Fórmula sem resultado em cache (arquivo que não passou pelo Excel).
        if valor_bruto is None and valores_de_formula and numero_linha in valores_de_formula:
            valor_bruto = valores_de_formula[numero_linha]

        # Linha sem valor não é lançamento (separador, subtotal, linha em branco).
        if valor_bruto is None or limpar_texto(valor_bruto) == "":
            resultado.ignorados += 1
            continue

        valor, problema = norm.normalizar_valor(valor_bruto, "Valor")
        if problema:
            resultado.problemas.append((numero_linha, "Valor", problema, limpar_texto(valor_bruto)))
            if valor == 0:
                resultado.ignorados += 1
                continue

        mes_nome, mes_numero = normalizar_mes(_valor_de(linha, mapa, "mes_referencia"))
        if mes_numero is None:
            resultado.problemas.append(
                (
                    numero_linha,
                    "Mês referência",
                    "Mês de referência ausente ou inválido — o lançamento só aparece nos totais anuais",
                    limpar_texto(_valor_de(linha, mapa, "mes_referencia")) or None,
                )
            )

        bruto_data = _valor_de(linha, mapa, "data_pagamento")
        data_pagamento, erro_data = norm.normalizar_data(bruto_data, "Data de pagamento")
        if erro_data and bruto_data is not None:
            resultado.problemas.append((numero_linha, "Data de pagamento", erro_data, limpar_texto(bruto_data)))
        bruto_envio = _valor_de(linha, mapa, "envio_para_pagamento")
        envio, _ = norm.normalizar_data(bruto_envio, "Envio para pagamento")

        # Ano implausível na data costuma ser erro de digitação ("1024" por "2024").
        # Não corrigimos por conta própria — apenas apontamos para revisão.
        for rotulo, valor_data in (("Data de pagamento", data_pagamento), ("Envio para pagamento", envio)):
            if valor_data is None:
                continue
            limite = ano + 1
            if 2000 <= valor_data.year <= limite:
                continue
            mensagem = f"Ano improvável ({valor_data.year})"
            corrigido = int("2" + str(valor_data.year)[1:]) if len(str(valor_data.year)) == 4 else 0
            if 2000 <= corrigido <= limite:
                mensagem += f" — provável erro de digitação, talvez {corrigido}"
            else:
                mensagem += " — revisar a data com o responsável"
            resultado.problemas.append((numero_linha, rotulo, mensagem, valor_data.strftime("%d.%m.%Y")))

        rc = canonizar(_valor_de(linha, mapa, "rc"))
        numero_pedido = canonizar(_valor_de(linha, mapa, "numero_pedido"))
        recepcao = canonizar(_valor_de(linha, mapa, "recepcao"))
        documento_pago = canonizar(_valor_de(linha, mapa, "documento_pago"))
        edoa = padronizar("edoa", _valor_de(linha, mapa, "edoa"))
        if edoa is None:
            resultado.problemas.append(
                (numero_linha, "EDOA", "Lançamento sem EDOA — fica fora do orçamento (RAP)", None)
            )

        dados = {
            # STATUS é recalculado pela regra da planilha, não copiado da célula:
            # vale mesmo quando o arquivo não tem o resultado da fórmula em cache.
            "status": derivar_status_lancamento(rc, numero_pedido, recepcao, bruto_envio, documento_pago),
            "categoria": padronizar("categoria", _valor_de(linha, mapa, "categoria")),
            "area": padronizar("area", _valor_de(linha, mapa, "area")),
            "tipo_pagamento": padronizar("tipo_pagamento", _valor_de(linha, mapa, "tipo_pagamento")),
            "referencia": canonizar(_valor_de(linha, mapa, "referencia")),
            "motivo": padronizar("motivo", _valor_de(linha, mapa, "motivo")),
            "valor": valor,
            "mes_referencia": mes_nome,
            "mes_referencia_num": mes_numero,
            "ano_referencia": ano,
            "data_pagamento": data_pagamento,
            "envio_para_pagamento": envio,
            "recorrencia": padronizar("recorrencia", _valor_de(linha, mapa, "recorrencia")),
            "descricao": canonizar(_valor_de(linha, mapa, "descricao")),
            "rc": rc,
            "numero_pedido": numero_pedido,
            "recepcao": recepcao,
            "item": canonizar(_valor_de(linha, mapa, "item")),
            "chamado": canonizar(_valor_de(linha, mapa, "chamado")),
            "documento_pago": documento_pago,
            "edoa": edoa,
            "centro_custo": canonizar(_valor_de(linha, mapa, "centro_custo")),
            "conta_contabil": canonizar(_valor_de(linha, mapa, "conta_contabil")),
            "linha_planilha": numero_linha,
        }

        base = _identificador(
            ano, dados["referencia"], dados["valor"], dados["data_pagamento"], dados["area"],
            dados["motivo"], dados["chamado"], dados["descricao"], dados["mes_referencia"], dados["edoa"],
        )
        ocorrencias[base] += 1
        dados["fingerprint"] = _identificador(base, ocorrencias[base])
        preparados.append(dados)

    fingerprints = [d["fingerprint"] for d in preparados]
    existentes: dict[str, Lancamento] = {}
    # IN com milhares de itens estoura o limite de parâmetros do SQLite: lotes de 500.
    for inicio in range(0, len(fingerprints), 500):
        lote = fingerprints[inicio : inicio + 500]
        for item in db.scalars(select(Lancamento).where(Lancamento.fingerprint.in_(lote))):
            existentes[item.fingerprint] = item

    for dados in preparados:
        atual = existentes.get(dados["fingerprint"])
        resultado.vistos.add(dados["fingerprint"])
        if atual is None:
            db.add(Lancamento(**dados, importacao_id=importacao.id))
            resultado.criados += 1
        else:
            mudou = _aplicar_mudancas(atual, dados, ignorar={"fingerprint"})
            atual.importacao_id = importacao.id
            if mudou:
                resultado.atualizados += 1

    resultado.linhas_lidas = len(df)


def importar_adiantamentos(
    db: Session, df: pd.DataFrame, resultado: ResultadoAba, importacao: Importacao, ano: int,
    padronizar: Padronizador,
) -> None:
    mapa = _mapear(list(df.columns), COLUNAS_ADIANTAMENTOS)

    for indice, linha in df.iterrows():
        numero_linha = int(indice)
        valor, _ = norm.normalizar_valor(_valor_de(linha, mapa, "valor"), "Valor")
        chamado = canonizar(_valor_de(linha, mapa, "chamado_adiantamento"))

        # Linha só com o status calculado ("Lançar adiantamento") e nada mais.
        if not chamado and valor == 0:
            resultado.ignorados += 1
            continue

        excedente, _ = norm.normalizar_valor(_valor_de(linha, mapa, "valor_excedente"), "Valor excedente")
        chamado_baixa = canonizar(_valor_de(linha, mapa, "chamado_baixa"))
        documento_baixa = canonizar(_valor_de(linha, mapa, "documento_baixa"))

        dados = {
            "status": derivar_status_adiantamento(chamado, chamado_baixa, documento_baixa),
            "conferido_planilha": norm.chave(_valor_de(linha, mapa, "conferido_planilha")) in {"ok", "sim", "x"},
            "area": padronizar("area", _valor_de(linha, mapa, "area")),
            "doa": canonizar(_valor_de(linha, mapa, "doa")),
            "escritorio": canonizar(_valor_de(linha, mapa, "escritorio")),
            "valor": valor,
            "valor_excedente": excedente,
            # Na planilha: =Valor + Valor Excedente. Recalculado, não copiado.
            "valor_total": round(valor + excedente, 2),
            "chamado_adiantamento": chamado,
            "chamado_baixa": chamado_baixa,
            "documento_baixa": documento_baixa,
            "ano_referencia": ano,
            "linha_planilha": numero_linha,
        }
        fingerprint = _identificador(ano, chamado, dados["valor"], dados["area"], chamado_baixa)
        resultado.vistos.add(fingerprint)
        atual = db.scalar(select(Adiantamento).where(Adiantamento.fingerprint == fingerprint))

        if atual is None:
            db.add(Adiantamento(**dados, fingerprint=fingerprint, importacao_id=importacao.id))
            resultado.criados += 1
        else:
            if _aplicar_mudancas(atual, dados):
                resultado.atualizados += 1
            atual.importacao_id = importacao.id

    resultado.linhas_lidas = len(df)


def importar_devolucoes(
    db: Session, df: pd.DataFrame, resultado: ResultadoAba, importacao: Importacao, ano: int,
    padronizar: Padronizador,
) -> None:
    mapa = _mapear(list(df.columns), COLUNAS_DEVOLUCOES)
    ocorrencias: Counter[str] = Counter()

    for indice, linha in df.iterrows():
        numero_linha = int(indice)
        valor, problema = norm.normalizar_valor(_valor_de(linha, mapa, "valor_devolvido"), "Valor devolvido")
        if valor == 0:
            resultado.ignorados += 1
            continue
        if problema:
            resultado.problemas.append((numero_linha, "Valor devolvido", problema, None))

        data, _ = norm.normalizar_data(_valor_de(linha, mapa, "data_transferencia"), "Data da transferência")

        dados = {
            "area": padronizar("area", _valor_de(linha, mapa, "area")),
            "fornecedor": canonizar(_valor_de(linha, mapa, "fornecedor")),
            "codigo_banco": canonizar(_valor_de(linha, mapa, "codigo_banco")),
            "data_transferencia": data,
            "pasta_benner": canonizar(_valor_de(linha, mapa, "pasta_benner")),
            "valor_devolvido": valor,
            "chamado": canonizar(_valor_de(linha, mapa, "chamado")),
            "documento": canonizar(_valor_de(linha, mapa, "documento")),
            "observacao": canonizar(_valor_de(linha, mapa, "observacao")),
            "ano_referencia": ano,
            "linha_planilha": numero_linha,
        }
        base = _identificador(
            ano, dados["documento"], dados["valor_devolvido"], dados["fornecedor"],
            dados["data_transferencia"], dados["pasta_benner"],
        )
        ocorrencias[base] += 1
        fingerprint = _identificador(base, ocorrencias[base])
        resultado.vistos.add(fingerprint)
        atual = db.scalar(select(Devolucao).where(Devolucao.fingerprint == fingerprint))

        if atual is None:
            db.add(Devolucao(**dados, fingerprint=fingerprint, importacao_id=importacao.id))
            resultado.criados += 1
        else:
            if _aplicar_mudancas(atual, dados):
                resultado.atualizados += 1
            atual.importacao_id = importacao.id

    resultado.linhas_lidas = len(df)


def _gravar_item_orcamento(
    db: Session,
    dados: dict,
    plano: dict[int, float] | None,
    resultado: ResultadoAba,
    importacao: Importacao,
) -> None:
    # A linha da planilha entra na impressão digital: em "Mensais" e no RAP
    # vários itens distintos compartilham EDOA, área e até o valor.
    fingerprint = _identificador(
        dados["origem"], dados.get("bloco", 1), dados.get("nivel", "edoa"),
        dados.get("grupo"), dados["edoa"], dados.get("rotulo"), dados["area"],
        dados["detalhamento"], dados["ano"], dados.get("linha_planilha"),
    )
    resultado.vistos.add(fingerprint)
    atual = db.scalar(select(ItemOrcamento).where(ItemOrcamento.fingerprint == fingerprint))

    if atual is None:
        atual = ItemOrcamento(**dados, fingerprint=fingerprint, importacao_id=importacao.id)
        db.add(atual)
        db.flush()
        resultado.criados += 1
    else:
        mudou = _aplicar_mudancas(atual, dados)
        atual.importacao_id = importacao.id
        plano_atual = {p.mes: float(p.valor) for p in atual.plano_mensal}
        if plano_atual != {m: float(v) for m, v in (plano or {}).items()}:
            atual.plano_mensal.clear()
            db.flush()
            mudou = True
        else:
            plano = None  # já está igual, não regrava
        if mudou:
            resultado.atualizados += 1

    for mes, valor in (plano or {}).items():
        db.add(PlanoMensal(item_id=atual.id, mes=mes, valor=valor))


def _numero(valor: object) -> float | None:
    """Número de uma célula, ou None se vazia. Célula vazia chega do pandas como NaN."""
    if valor is None or (isinstance(valor, str) and not valor.strip()):
        return None
    if isinstance(valor, (int, float)) and not isinstance(valor, bool):
        return None if valor != valor else float(valor)  # NaN != NaN
    convertido, problema = norm.normalizar_valor(valor, "valor")
    return None if problema else convertido


def _localizar_rotulo(grade: Grade, texto: str, limite_linhas: int = 10) -> tuple[int, int] | None:
    alvo = norm.chave(texto)
    for linha in range(1, min(limite_linhas, grade.total_linhas) + 1):
        for coluna, valor in enumerate(grade.valores[linha - 1], start=1):
            if valor is not None and norm.chave(valor) == alvo:
                return linha, coluna
    return None


def _colunas_do_cabecalho(grade: Grade, linha: int) -> dict[str, int]:
    """{chave do título: coluna} de uma linha de cabeçalho."""
    return {
        norm.chave(limpar_texto(v)): coluna
        for coluna, v in enumerate(grade.valores[linha - 1], start=1)
        if v is not None and limpar_texto(v)
    }


def _criterio_da_celula(
    grade: Grade, linha: int, coluna: int, padronizar: Padronizador
) -> tuple[dict[str, str | None], float | None, str, str | None]:
    """Lê a célula de REALIZADO e devolve (filtros, realizado_manual, origem, observação)."""
    formula = grade.formula(linha, coluna)
    criterio = extrair_criterio_soma(formula, grade)

    if criterio is None:
        manual = _numero(formula)
        if manual is not None:
            return {}, manual, "manual", f"realizado digitado à mão na planilha ({manual:,.2f})"
        return {}, None, "sem_regra", "célula de realizado vazia na planilha"

    if not criterio.valido:
        return {}, None, "sem_regra", criterio.observacao

    filtros = {
        "edoa": padronizar("edoa", criterio.filtros.get("edoa")),
        "area": padronizar("area", criterio.filtros.get("area")),
        "recorrencia": padronizar("recorrencia", criterio.filtros.get("recorrencia")),
    }
    return filtros, None, "formula", None


def importar_rap(
    db: Session, grade: Grade, resultado: ResultadoAba, importacao: Importacao, ano: int,
    padronizar: Padronizador,
) -> int | None:
    """Importa o budget e o CRITÉRIO do realizado de cada linha da aba RAP.

    Devolve o MÊS FECHAMENTO lido da aba (ou None).

    A aba tem dois blocos empilhados:
      * bloco 1 — EDOA × ÁREA: budget anual; linhas com ÁREA em branco são o
        total do EDOA, com ÁREA preenchida são a quebra dentro dele (somar os
        dois níveis contaria o mesmo dinheiro duas vezes);
      * bloco 2 — HONORÁRIOS E DESPESAS por área, com budget separado em
        fixo e variável.
    """
    mes_fechamento = None
    if (posicao := _localizar_rotulo(grade, "MÊS FECHAMENTO")) is not None:
        linha, coluna = posicao
        bruto = grade.valor(linha, coluna + 1)
        if isinstance(bruto, (int, float)) and 1 <= int(bruto) <= 12:
            mes_fechamento = int(bruto)
        else:
            _, mes_fechamento = normalizar_mes(bruto)

    # Localiza os cabeçalhos dos dois blocos.
    cabecalhos: list[int] = []
    for linha in range(1, grade.total_linhas + 1):
        chaves = _colunas_do_cabecalho(grade, linha)
        if any(k.startswith("budget") for k in chaves) and ("edoa" in chaves or "area" in chaves):
            cabecalhos.append(linha)
    if not cabecalhos:
        raise PlanilhaInvalida("Aba RAP sem cabeçalho reconhecível (EDOA / ÁREA / BUDGET).")
    resultado.linha_cabecalho = cabecalhos[0]

    ordem = 0
    for numero_bloco, linha_cabecalho in enumerate(cabecalhos, start=1):
        colunas = _colunas_do_cabecalho(grade, linha_cabecalho)
        col_edoa = colunas.get("edoa")
        col_area = colunas.get("area")
        col_budget = next((c for k, c in colunas.items() if k.startswith("budget anual") or k == "budget"), None)
        col_realizado = next((c for k, c in colunas.items() if k.startswith("realizado") or k.startswith("real total")), None)
        col_budget_var = next((c for k, c in colunas.items() if k.startswith("budget variavel")), None)
        col_budget_fixo = next((c for k, c in colunas.items() if k.startswith("budget fixo")), None)

        # Bloco 2: o EDOA é o título logo acima do cabeçalho ("HONORÁRIOS E DESPESAS").
        edoa_do_bloco = None
        if col_edoa is None and linha_cabecalho > 1:
            acima = [v for v in grade.valores[linha_cabecalho - 2] if v not in (None, "")]
            edoa_do_bloco = padronizar("edoa", acima[0]) if acima else None

        fim = cabecalhos[numero_bloco] - 1 if numero_bloco < len(cabecalhos) else grade.total_linhas
        grupo_atual = None

        for linha in range(linha_cabecalho + 1, fim + 1):
            bruto_grupo = grade.valor(linha, col_edoa) if col_edoa else None
            rotulo = limpar_texto(grade.valor(linha, col_area)) if col_area else ""
            budget = _numero(grade.valor(linha, col_budget)) if col_budget else None

            if bruto_grupo not in (None, ""):
                grupo_atual = limpar_texto(bruto_grupo)
            grupo = grupo_atual if col_edoa else edoa_do_bloco

            # Linha de total (sem rótulo nenhum) ou título do próximo bloco.
            if not rotulo and bruto_grupo in (None, ""):
                if budget is not None:
                    resultado.ignorados += 1  # subtotal da planilha: o sistema recalcula
                continue
            # Título solto (ex.: "HONORÁRIOS E DESPESAS" acima do bloco 2): sem
            # budget, sem área e sem fórmula de realizado.
            sem_realizado = col_realizado is None or grade.formula(linha, col_realizado) in (None, "")
            if budget is None and not rotulo and sem_realizado:
                continue
            if not grupo:
                resultado.ignorados += 1
                continue

            filtros, manual, origem, observacao = (
                _criterio_da_celula(grade, linha, col_realizado, padronizar)
                if col_realizado
                else ({}, None, "sem_regra", None)
            )
            if origem != "formula":
                # Sem fórmula: critério inferido pelo grupo (e área, se casar com uma área real).
                filtros = {"edoa": padronizar("edoa", grupo) if col_edoa else edoa_do_bloco}
                if rotulo and padronizar.escolhidos.get("area", {}).get(norm.chave(rotulo)):
                    filtros["area"] = padronizar("area", rotulo)
                if origem == "sem_regra":
                    origem = "inferida"
            if observacao:
                resultado.problemas.append((linha, "Realizado", observacao, limpar_texto(grade.formula(linha, col_realizado)) if col_realizado else None))

            ordem += 1
            _gravar_item_orcamento(
                db,
                {
                    "origem": "RAP PAGAMENTOS" if numero_bloco == 1 else "RAP PAGAMENTOS (honorários por área)",
                    "bloco": numero_bloco,
                    # Bloco 1: sem ÁREA = total do EDOA; com ÁREA = quebra. Bloco 2 é todo por área.
                    "nivel": "area" if (rotulo or numero_bloco > 1) else "edoa",
                    "grupo": grupo,
                    "rotulo": rotulo or None,
                    "ordem": ordem,
                    "edoa": filtros.get("edoa") or grupo,
                    "area": filtros.get("area"),
                    "detalhamento": None,
                    "recorrencia": None,
                    "ano": ano,
                    "budget_anual": budget or 0,
                    "budget_fixo": _numero(grade.valor(linha, col_budget_fixo)) if col_budget_fixo else None,
                    "budget_variavel": _numero(grade.valor(linha, col_budget_var)) if col_budget_var else None,
                    "valor_mensal_contratado": None,
                    "filtro_edoa": filtros.get("edoa"),
                    "filtro_area": filtros.get("area"),
                    "filtro_recorrencia": filtros.get("recorrencia"),
                    "realizado_manual": manual,
                    "regra_origem": origem,
                    "linha_planilha": linha,
                },
                None,
                resultado,
                importacao,
            )
            resultado.linhas_lidas += 1

    return mes_fechamento


def importar_resultado(
    db: Session, grade: Grade, resultado: ResultadoAba, importacao: Importacao, ano: int,
    padronizar: Padronizador, edoas_conhecidos: set[str],
) -> None:
    """Importa o LAYOUT da aba Resultado: categoria, DOA, impacto e o critério de cada linha.

    O mês escolhido na aba (célula MÊS) não é gravado — no sistema ele é um filtro da tela.
    """
    linha_cabecalho = None
    for linha in range(1, min(15, grade.total_linhas) + 1):
        chaves = _colunas_do_cabecalho(grade, linha)
        if "categoria" in chaves and "doa" in chaves:
            linha_cabecalho = linha
            break
    if linha_cabecalho is None:
        raise PlanilhaInvalida("Aba Resultado sem cabeçalho CATEGORIA / DOA.")
    resultado.linha_cabecalho = linha_cabecalho

    colunas = _colunas_do_cabecalho(grade, linha_cabecalho)
    col_categoria, col_doa = colunas["categoria"], colunas["doa"]
    col_impacto = colunas.get("impacto")
    col_mensal = next((c for k, c in colunas.items() if "gasto mensal" in k), None)

    # Reimportação substitui o layout do ano inteiro.
    db.execute(delete(LinhaResultadoConfig).where(LinhaResultadoConfig.ano == ano))

    indice_edoa = {norm.chave(e): e for e in edoas_conhecidos}
    ordem = 0
    for linha in range(linha_cabecalho + 1, grade.total_linhas + 1):
        categoria = limpar_texto(grade.valor(linha, col_categoria))
        if not categoria:
            continue  # linha de total
        doa = limpar_texto(grade.valor(linha, col_doa)) or None

        filtro_categoria = padronizar("categoria", categoria)
        filtro_edoa: str | None = padronizar("edoa", doa) if doa else None
        origem = "inferida"

        criterio = extrair_criterio_soma(grade.formula(linha, col_mensal), grade) if col_mensal else None
        if criterio is not None and criterio.valido:
            origem = "formula"
            filtro_categoria = padronizar("categoria", criterio.filtros.get("categoria")) or filtro_categoria
            filtro_edoa = padronizar("edoa", criterio.filtros.get("edoa")) if "edoa" in criterio.filtros else None
        elif doa and "+" in doa:
            # "ACORDOS CONSUMIDOR + SAC": cada parte vira o EDOA que a contém.
            partes = []
            for parte in (p.strip() for p in doa.split("+")):
                k = norm.chave(parte)
                exato = indice_edoa.get(k)
                contem = [e for kk, e in indice_edoa.items() if k and k in kk]
                if exato or len(contem) == 1:
                    partes.append(exato or contem[0])
            filtro_edoa = "|".join(partes) if partes else filtro_edoa
            resultado.problemas.append(
                (linha, "Critério", f"Linha sem fórmula na planilha — critério inferido do rótulo: {' + '.join(partes) or doa}", doa)
            )

        ordem += 1
        db.add(
            LinhaResultadoConfig(
                ano=ano,
                ordem=ordem,
                categoria=categoria,
                doa=doa,
                impacto=limpar_texto(grade.valor(linha, col_impacto)) or None if col_impacto else None,
                filtro_categoria=filtro_categoria,
                filtro_edoa=filtro_edoa,
                regra_origem=origem,
                importacao_id=importacao.id,
            )
        )
        resultado.criados += 1
        resultado.linhas_lidas += 1


def importar_honorarios(
    db: Session, df: pd.DataFrame, resultado: ResultadoAba, importacao: Importacao, ano: int,
    padronizar: Padronizador,
) -> None:
    mapa = _mapear(list(df.columns), COLUNAS_HONORARIOS)
    colunas_mes = {}
    for coluna in df.columns:
        numero = MESES.get(norm.chave(coluna))
        if numero:
            colunas_mes[numero] = coluna

    ordem = 0
    for indice, linha in df.iterrows():
        detalhamento = canonizar(_valor_de(linha, mapa, "detalhamento"))
        edoa = padronizar("edoa", _valor_de(linha, mapa, "edoa"))
        budget, _ = norm.normalizar_valor(_valor_de(linha, mapa, "budget_anual"), "Budget")
        plano: dict[int, float] = {}
        for mes, coluna in colunas_mes.items():
            valor = _numero(linha.get(coluna))
            if valor:
                plano[mes] = valor

        # Linha de total: sem EDOA e sem detalhamento.
        if not detalhamento and not edoa:
            resultado.ignorados += 1
            continue

        soma_meses = round(sum(plano.values()), 2)
        if plano and budget and abs(soma_meses - budget) >= 0.01:
            resultado.problemas.append(
                (
                    int(indice),
                    "Budget",
                    f"Budget ({budget:,.2f}) diferente da soma dos meses ({soma_meses:,.2f})",
                    detalhamento,
                )
            )

        ordem += 1
        _gravar_item_orcamento(
            db,
            {
                "origem": "Honorários Variáveis",
                "bloco": 1,
                "nivel": "area",
                "grupo": edoa,
                "rotulo": detalhamento,
                "ordem": ordem,
                "edoa": edoa,
                "area": padronizar("area", _valor_de(linha, mapa, "area")),
                "detalhamento": detalhamento,
                "recorrencia": padronizar("recorrencia", _valor_de(linha, mapa, "recorrencia")),
                "ano": ano,
                "budget_anual": budget if budget else soma_meses,
                "valor_mensal_contratado": None,
                "linha_planilha": int(indice),
            },
            plano,
            resultado,
            importacao,
        )

    resultado.linhas_lidas = len(df)


def importar_mensais(
    db: Session, df: pd.DataFrame, resultado: ResultadoAba, importacao: Importacao, ano: int,
    padronizar: Padronizador,
) -> None:
    mapa = _mapear(list(df.columns), COLUNAS_MENSAIS)

    # A aba tem uma segunda tabela ao lado (sistemas: Projuris, Softplan,
    # Supramonte), com cabeçalhos repetidos "Area | Valor | Anual" — o leitor
    # os renomeia para "Valor (2)" e "Anual (2)".
    lateral = None
    if mapa.get("area") is not None:
        repetidas = [c for c in df.columns if norm.chave(c).startswith("area") and c != mapa["area"]]
        valor2 = next((c for c in df.columns if norm.chave(c) == "valor 2"), None)
        anual2 = next((c for c in df.columns if norm.chave(c) == "anual 2"), None)
        if repetidas and valor2:
            lateral = (repetidas[-1], valor2, anual2)

    ordem = 0
    for indice, linha in df.iterrows():
        area = padronizar("area", _valor_de(linha, mapa, "area"))
        mensal = _numero(_valor_de(linha, mapa, "valor_mensal_contratado")) or 0
        anual = _numero(_valor_de(linha, mapa, "budget_anual")) or 0

        if area and (mensal or anual):
            recorrencia = padronizar("recorrencia", _valor_de(linha, mapa, "recorrencia"))
            ordem += 1
            _gravar_item_orcamento(
                db,
                {
                    "origem": "Mensais",
                    "bloco": 1,
                    "nivel": "area",
                    "grupo": area,
                    "rotulo": f"{area} — {recorrencia or 'recorrente'}",
                    "ordem": ordem,
                    "edoa": None,
                    "area": area,
                    "detalhamento": (
                        f"Contrato mensal — {area}"
                        + (f" ({recorrencia})" if recorrencia else "")
                        + (f" · {mensal:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".") if mensal else "")
                    ),
                    "recorrencia": recorrencia,
                    "ano": ano,
                    "budget_anual": anual or mensal * 12,
                    "valor_mensal_contratado": mensal or None,
                    "linha_planilha": int(indice),
                },
                None,
                resultado,
                importacao,
            )
        else:
            resultado.ignorados += 1

        if lateral:
            nome = limpar_texto(linha.get(lateral[0]))
            valor_sistema = _numero(linha.get(lateral[1]))
            if nome and valor_sistema:
                anual_sistema = _numero(linha.get(lateral[2])) if lateral[2] else None
                observacao = limpar_texto(linha.iloc[list(df.columns).index(lateral[2]) + 1]) if lateral[2] and list(df.columns).index(lateral[2]) + 1 < len(df.columns) else ""
                ordem += 1
                _gravar_item_orcamento(
                    db,
                    {
                        "origem": "Mensais (sistemas)",
                        "bloco": 1,
                        "nivel": "area",
                        "grupo": "Sistemas",
                        "rotulo": f"{nome}" + (f" — {observacao}" if observacao else ""),
                        "ordem": ordem,
                        "edoa": "SISTEMAS",
                        "area": None,
                        "detalhamento": f"{nome}" + (f" — {observacao}" if observacao else ""),
                        "recorrencia": None,
                        "ano": ano,
                        "budget_anual": anual_sistema or valor_sistema,
                        "valor_mensal_contratado": valor_sistema,
                        "linha_planilha": int(indice),
                    },
                    None,
                    resultado,
                    importacao,
                )

    resultado.linhas_lidas = len(df)


def importar_contas(db: Session, df: pd.DataFrame, resultado: ResultadoAba) -> None:
    # A aba RF MENSAL não tem cabeçalho: a "linha de cabeçalho" detectada é, na
    # verdade, a primeira conta. Quando os títulos parecem dados (um centro de
    # custo "GI52000" ou um número de conta), essa linha volta a ser dado.
    titulos = [str(c) for c in df.columns]
    if any(re.fullmatch(r"GI\d+|\d{5,}", t.strip()) for t in titulos):
        primeira = pd.DataFrame([titulos], columns=df.columns, index=[(df.index.min() if len(df) else 2) - 1])
        df = pd.concat([primeira, df])
        resultado.linha_cabecalho = 0  # 0 = aba sem cabeçalho
    mapa = _mapear(list(df.columns), COLUNAS_CONTAS)

    for _indice, linha in df.iterrows():
        # A aba não tem cabeçalho claro: as colunas vêm posicionais.
        valores = [limpar_texto(v) for v in linha.tolist() if limpar_texto(v)]
        if len(valores) < 4:
            resultado.ignorados += 1
            continue

        centro = canonizar(_valor_de(linha, mapa, "centro_custo")) or valores[2]
        conta = canonizar(_valor_de(linha, mapa, "conta")) or valores[3]
        if not centro or not conta:
            resultado.ignorados += 1
            continue

        existente = db.scalar(
            select(ContaContabil).where(ContaContabil.centro_custo == centro, ContaContabil.conta == conta)
        )
        descricao = canonizar(_valor_de(linha, mapa, "descricao")) or (valores[4] if len(valores) > 4 else None)
        if existente:
            if existente.descricao != descricao:
                existente.descricao = descricao
                resultado.atualizados += 1
            continue

        db.add(
            ContaContabil(
                diretoria=valores[0] if valores else None,
                grupo=valores[1] if len(valores) > 1 else None,
                centro_custo=centro,
                conta=conta,
                descricao=descricao,
            )
        )
        db.flush()
        resultado.criados += 1

    resultado.linhas_lidas = len(df)


def importar_base(db: Session, df: pd.DataFrame, resultado: ResultadoAba) -> dict[str, set[str]]:
    """Cada coluna da aba Base é uma lista de domínio independente.

    Devolve {tipo: {valores}} para alimentar a padronização das outras abas.
    """
    indice_colunas = {norm.chave(c): c for c in df.columns}
    encontrados: dict[str, set[str]] = defaultdict(set)

    for titulo, tipo in COLUNAS_BASE.items():
        coluna = indice_colunas.get(norm.chave(titulo))
        if coluna is None:
            continue
        for bruto in df[coluna].dropna():
            valor = canonizar(bruto, tipo)
            if not valor or valor in encontrados[tipo]:
                continue
            encontrados[tipo].add(valor)
            existe = db.scalar(
                select(DominioFinanceiro).where(DominioFinanceiro.tipo == tipo, DominioFinanceiro.valor == valor)
            )
            if existe:
                continue
            db.add(DominioFinanceiro(tipo=tipo, valor=valor))
            resultado.criados += 1

    resultado.linhas_lidas = len(df)
    return encontrados


# --------------------------------------------------------------------------
# Orquestração
# --------------------------------------------------------------------------

ALIASES_POR_DESTINO = {
    "lancamentos": _aliases(COLUNAS_LANCAMENTOS),
    "adiantamentos": _aliases(COLUNAS_ADIANTAMENTOS),
    "devolucoes": _aliases(COLUNAS_DEVOLUCOES),
    "rap": _aliases(COLUNAS_RAP),
    "honorarios": _aliases(COLUNAS_HONORARIOS) | {norm.chave(m) for m in MESES},
    "mensais": _aliases(COLUNAS_MENSAIS),
    "contas": _aliases(COLUNAS_CONTAS),
    "base": {norm.chave(t) for t in COLUNAS_BASE},
    "resultado": _aliases(COLUNAS_RESULTADO),
}


def identificar_aba(nome: str) -> str | None:
    k = norm.chave(nome)
    if k in ABAS_DERIVADAS:
        return "derivada"
    if destino := ABAS_CONHECIDAS.get(k):
        return destino
    # Casamento por conteúdo: "Controle Lançamentos 2024", "Devoluções (2)"...
    for alias, destino in ABAS_CONHECIDAS.items():
        if len(alias) > 4 and (alias in k or (len(k) > 4 and k in alias)):
            return destino
    return None


def parece_planilha_financeira(conteudo: bytes, nome_arquivo: str) -> bool:
    """True se o arquivo tem a estrutura da planilha de pagamentos (várias abas conhecidas)."""
    try:
        abas = listar_abas(conteudo, nome_arquivo)
    except PlanilhaInvalida:
        return False
    destinos = {identificar_aba(a) for a in abas}
    return "lancamentos" in destinos or len(destinos & {"rap", "adiantamentos", "devolucoes", "base"}) >= 2


def analisar_arquivo(conteudo: bytes, nome_arquivo: str) -> dict:
    """Pré-visualização: o que o sistema fará com cada aba, sem gravar nada."""
    ano, origem_ano = inferir_ano(nome_arquivo, conteudo)
    analise = []
    for aba in listar_abas(conteudo, nome_arquivo):
        destino = identificar_aba(aba)
        item = {
            "aba": aba,
            "destino": destino,
            "descricao": DESCRICAO_DESTINO.get(destino or "", "Aba não reconhecida — será ignorada."),
            "linhas": 0,
            "linha_cabecalho": 1,
            "colunas": [],
        }
        if destino in (None, "derivada"):
            item["observacao"] = (
                "Tabela dinâmica — o sistema recalcula estes números a partir dos lançamentos."
                if destino == "derivada"
                else "Aba não reconhecida — será ignorada."
            )
            analise.append(item)
            continue

        try:
            df, linha_cabecalho = ler_aba(
                conteudo, nome_arquivo, aba, aliases_esperados=ALIASES_POR_DESTINO.get(destino, set())
            )
            item["linhas"] = int(len(df))
            item["linha_cabecalho"] = linha_cabecalho
            item["colunas"] = [str(c) for c in df.columns if not str(c).startswith("Coluna ")][:30]
        except PlanilhaInvalida as erro:
            item["observacao"] = str(erro)
        analise.append(item)

    return {"ano_detectado": ano, "origem_ano": origem_ano, "abas": analise}


def _preencher_formulas_simples(conteudo: bytes, aba: str, df: pd.DataFrame, linha_cabecalho: int) -> pd.DataFrame:
    """Preenche células com fórmula aritmética simples ("=8757.54", "=10*3") sem valor em cache.

    Arquivo salvo pelo Excel já traz o resultado; um gerado por script, não.
    """
    grade = carregar_grades(conteudo, [aba]).get(aba)
    if grade is None or linha_cabecalho < 1 or linha_cabecalho > grade.total_linhas:
        return df
    titulos = [limpar_texto(v) for v in grade.valores[linha_cabecalho - 1]]
    posicao = {}
    for coluna in df.columns:
        if coluna in titulos:
            posicao[coluna] = titulos.index(coluna) + 1
    df = df.copy()
    for indice in df.index:
        for coluna, numero_coluna in posicao.items():
            atual = df.at[indice, coluna]
            if atual is None or (isinstance(atual, float) and atual != atual):
                valor = avaliar_aritmetica(grade.formula(int(indice), numero_coluna))
                if valor is not None:
                    df.at[indice, coluna] = valor
    return df


def _valores_de_formula_lancamentos(conteudo: bytes, aba: str, df: pd.DataFrame) -> dict[int, float]:
    """Valor de fórmulas simples na coluna Valor quando o arquivo não tem o cache.

    Só é acionado se houver linha com dados mas Valor vazio — o caso de um
    arquivo gerado por script, que nunca passou pelo Excel.
    """
    mapa = _mapear(list(df.columns), COLUNAS_LANCAMENTOS)
    coluna_valor = mapa.get("valor")
    if coluna_valor is None:
        return {}
    vazios = df[df[coluna_valor].isna()]
    outras = [c for c in mapa.values() if c != coluna_valor and c != mapa.get("status")]
    if vazios.empty or not outras or vazios[outras].notna().any(axis=1).sum() == 0:
        return {}

    grade = carregar_grades(conteudo, [aba]).get(aba)
    if grade is None:
        return {}
    indice_coluna = list(df.columns).index(coluna_valor) + 1
    # A coluna no DataFrame pode ter se deslocado por colunas vazias removidas:
    # localiza pelo título na linha de cabeçalho da grade.
    for linha in range(1, 13):
        titulos = [limpar_texto(v) for v in grade.valores[linha - 1]] if linha <= grade.total_linhas else []
        if coluna_valor in titulos:
            indice_coluna = titulos.index(coluna_valor) + 1
            break

    calculados: dict[int, float] = {}
    for numero_linha in vazios.index:
        valor = avaliar_aritmetica(grade.formula(int(numero_linha), indice_coluna))
        if valor is not None:
            calculados[int(numero_linha)] = valor
    return calculados


MODELOS_RECONCILIAVEIS = {
    "lancamentos": Lancamento,
    "adiantamentos": Adiantamento,
    "devolucoes": Devolucao,
}


def _remover_ausentes(db: Session, destino: str, resultado: ResultadoAba, ano: int) -> None:
    """Tira do sistema o que veio de importação anterior do mesmo ano e sumiu da planilha.

    Nunca toca em registro criado à mão no sistema (importacao_id vazio).
    """
    if destino in MODELOS_RECONCILIAVEIS:
        modelo = MODELOS_RECONCILIAVEIS[destino]
        candidatos = db.scalars(
            select(modelo).where(modelo.ano_referencia == ano, modelo.importacao_id.isnot(None))
        ).all()
    elif destino in {"rap", "honorarios", "mensais"}:
        origens = {
            "rap": ["RAP PAGAMENTOS", "RAP PAGAMENTOS (honorários por área)", "RAP PAGAMENTOS (por área)"],
            "honorarios": ["Honorários Variáveis"],
            "mensais": ["Mensais", "Mensais (sistemas)"],
        }[destino]
        candidatos = db.scalars(
            select(ItemOrcamento).where(
                ItemOrcamento.ano == ano,
                ItemOrcamento.origem.in_(origens),
                ItemOrcamento.importacao_id.isnot(None),
            )
        ).all()
    else:
        return

    for registro in candidatos:
        if registro.fingerprint not in resultado.vistos:
            db.delete(registro)
            resultado.removidos += 1


def importar_planilha_financeira(
    db: Session,
    conteudo: bytes,
    nome_arquivo: str,
    usuario: Usuario | None,
    ano: int | None = None,
) -> tuple[Importacao, list[ResultadoAba], dict]:
    """Percorre todas as abas do arquivo e grava cada uma no seu destino.

    Devolve (importação, resultado por aba, informações extras para a tela).
    """
    inicio = time.perf_counter()
    origem_ano = "informado"
    if ano is None:
        ano, origem_ano = inferir_ano(nome_arquivo, conteudo)

    importacao = Importacao(
        tipo=TipoImportacao.FINANCEIRO,
        arquivo=nome_arquivo,
        usuario_id=usuario.id if usuario else None,
        usuario_nome=usuario.nome if usuario else None,
        status=StatusImportacao.PROCESSANDO,
        data=datetime.now(timezone.utc),
    )
    db.add(importacao)
    db.flush()

    resultados: list[ResultadoAba] = []
    extras: dict = {"ano": ano, "origem_ano": origem_ano, "mes_fechamento": None, "padronizacoes": []}

    try:
        abas = listar_abas(conteudo, nome_arquivo)
        destinos = {aba: identificar_aba(aba) for aba in abas}
        ordenadas = sorted(
            abas,
            key=lambda a: ORDEM_DESTINOS.index(destinos[a]) if destinos[a] in ORDEM_DESTINOS else 99,
        )

        # RAP e Resultado precisam das fórmulas, não só dos valores.
        abas_com_formula = [a for a in abas if destinos[a] in {"rap", "resultado"}]
        grades = carregar_grades(conteudo, abas_com_formula) if abas_com_formula else {}

        # Domínios já cadastrados + os que vierem da aba Base.
        dominios: dict[str, set[str]] = defaultdict(set)
        for dominio in db.scalars(select(DominioFinanceiro)):
            dominios[dominio.tipo].add(dominio.valor)
        padronizar = Padronizador(dominios)
        edoas_vistos: set[str] = set()
        reconhecidas = 0

        for aba in ordenadas:
            destino = destinos[aba]
            if destino is None:
                resultados.append(ResultadoAba(aba=aba, destino="ignorada", mensagem="Aba não reconhecida."))
                continue
            if destino == "derivada":
                resultados.append(
                    ResultadoAba(
                        aba=aba,
                        destino="calculada",
                        mensagem="Tabela dinâmica — recalculada pelo sistema em Financeiro → Análise por EDOA.",
                    )
                )
                continue

            resultado = ResultadoAba(aba=aba, destino=destino)
            try:
                if destino in {"rap", "resultado"}:
                    grade = grades.get(aba)
                    if grade is None:
                        raise PlanilhaInvalida("Não foi possível ler a aba.")
                    if destino == "rap":
                        extras["mes_fechamento"] = importar_rap(db, grade, resultado, importacao, ano, padronizar)
                    else:
                        edoas = edoas_vistos | set(padronizar.escolhidos.get("edoa", {}).values()) | dominios.get("edoa", set())
                        importar_resultado(db, grade, resultado, importacao, ano, padronizar, edoas)
                else:
                    df, linha_cabecalho = ler_aba(
                        conteudo, nome_arquivo, aba, aliases_esperados=ALIASES_POR_DESTINO.get(destino, set())
                    )
                    resultado.linha_cabecalho = linha_cabecalho

                    if destino == "base":
                        for tipo, valores in importar_base(db, df, resultado).items():
                            dominios[tipo] |= valores
                        padronizar = Padronizador(dominios)
                    elif destino == "contas":
                        importar_contas(db, df, resultado)
                    elif destino == "lancamentos":
                        formulas = _valores_de_formula_lancamentos(conteudo, aba, df)
                        importar_lancamentos(db, df, resultado, importacao, ano, padronizar, formulas)
                        edoas_vistos |= set(padronizar.escolhidos.get("edoa", {}).values())
                    elif destino == "adiantamentos":
                        importar_adiantamentos(db, df, resultado, importacao, ano, padronizar)
                    elif destino == "devolucoes":
                        importar_devolucoes(db, df, resultado, importacao, ano, padronizar)
                    elif destino == "honorarios":
                        df = _preencher_formulas_simples(conteudo, aba, df, linha_cabecalho)
                        importar_honorarios(db, df, resultado, importacao, ano, padronizar)
                    elif destino == "mensais":
                        df = _preencher_formulas_simples(conteudo, aba, df, linha_cabecalho)
                        importar_mensais(db, df, resultado, importacao, ano, padronizar)

                db.flush()
                _remover_ausentes(db, destino, resultado, ano)
                reconhecidas += 1
            except PlanilhaInvalida as erro:
                resultado.mensagem = str(erro)
            except Exception as erro:  # noqa: BLE001 — uma aba ruim não derruba as outras
                db.rollback()
                raise PlanilhaInvalida(f"Erro ao processar a aba '{aba}': {erro}") from erro

            resultados.append(resultado)

        if reconhecidas == 0:
            raise PlanilhaInvalida(
                "Nenhuma aba reconhecida. Esperado: Controle Lançamentos, Adiantamentos, "
                "Devoluções, RAP PAGAMENTOS, Honorários Variáveis, Mensais, Resultado, Base ou RF MENSAL."
            )

        # Exercício: ano + mês de fechamento (lido da aba RAP, se houver).
        exercicio = db.get(ExercicioFinanceiro, ano)
        if exercicio is None:
            exercicio = ExercicioFinanceiro(ano=ano, mes_fechamento=extras["mes_fechamento"] or 12)
            db.add(exercicio)
        elif extras["mes_fechamento"]:
            exercicio.mes_fechamento = extras["mes_fechamento"]
        exercicio.arquivo_origem = nome_arquivo

        total_problemas = 0
        for resultado in resultados:
            for linha, campo, problema, valor in resultado.problemas:
                db.add(
                    Inconsistencia(
                        importacao_id=importacao.id,
                        aba=resultado.aba,
                        linha=linha,
                        campo=campo,
                        problema=problema,
                        valor_original=valor,
                    )
                )
                total_problemas += 1

        extras["padronizacoes"] = padronizar.resumo()

        importacao.total_processos = sum(r.linhas_lidas for r in resultados)
        importacao.registros_validos = sum(r.criados + r.atualizados for r in resultados)
        importacao.criados = sum(r.criados for r in resultados)
        importacao.atualizados = sum(r.atualizados for r in resultados)
        importacao.total_inconsistencias = total_problemas
        importacao.status = (
            StatusImportacao.CONCLUIDO_COM_ALERTAS if total_problemas else StatusImportacao.CONCLUIDO
        )
        importacao.duracao_ms = int((time.perf_counter() - inicio) * 1000)

        db.commit()
        db.refresh(importacao)
        return importacao, resultados, extras

    except PlanilhaInvalida as erro:
        db.rollback()
        falha = Importacao(
            tipo=TipoImportacao.FINANCEIRO,
            arquivo=nome_arquivo,
            usuario_id=usuario.id if usuario else None,
            usuario_nome=usuario.nome if usuario else None,
            status=StatusImportacao.ERRO,
            mensagem_erro=str(erro),
            duracao_ms=int((time.perf_counter() - inicio) * 1000),
            data=datetime.now(timezone.utc),
        )
        db.add(falha)
        db.commit()
        raise
