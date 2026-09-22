"""Leitura de arquivos de planilha, com detecção automática da linha de cabeçalho.

Planilhas reais raramente têm o cabeçalho na linha 1: vêm com título, logo, linha
de filtro ou linhas em branco acima. Este módulo localiza o cabeçalho sozinho,
comparando cada uma das primeiras linhas com os nomes de coluna esperados.
"""

from __future__ import annotations

import io
import re

import pandas as pd

from app.services.normalizacao import chave

EXTENSOES_SUPORTADAS = {".xlsx", ".xlsm", ".xls", ".csv"}

# Até onde procurar o cabeçalho antes de desistir.
MAX_LINHAS_BUSCA_CABECALHO = 12


class PlanilhaInvalida(Exception):
    """Arquivo ilegível, vazio ou sem as colunas mínimas."""


def extensao_de(nome_arquivo: str) -> str:
    return "." + nome_arquivo.rsplit(".", 1)[-1].lower() if "." in nome_arquivo else ""


def limpar_texto(valor: object) -> str:
    """Remove espaço duro (\\xa0), quebras de linha e espaços repetidos."""
    if valor is None or (isinstance(valor, float) and valor != valor):  # None ou NaN
        return ""
    texto = str(valor).replace("\xa0", " ").replace("\n", " ").replace("\r", " ")
    return re.sub(r"\s+", " ", texto).strip()


def listar_abas(conteudo: bytes, nome_arquivo: str) -> list[str]:
    extensao = extensao_de(nome_arquivo)
    if extensao == ".csv":
        return ["CSV"]
    try:
        return pd.ExcelFile(io.BytesIO(conteudo), engine=_motor(extensao)).sheet_names
    except Exception as erro:  # noqa: BLE001
        raise PlanilhaInvalida(f"Não foi possível abrir o arquivo: {erro}") from erro


def _motor(extensao: str) -> str:
    return "xlrd" if extensao == ".xls" else "openpyxl"


def _ler_bruto(conteudo: bytes, nome_arquivo: str, aba: str | None) -> pd.DataFrame:
    """Lê a aba inteira sem assumir cabeçalho (header=None)."""
    extensao = extensao_de(nome_arquivo)
    if extensao not in EXTENSOES_SUPORTADAS:
        raise PlanilhaInvalida(
            f"Formato não suportado ({extensao or 'sem extensão'}). Aceitos: XLSX, XLSM, XLS, CSV."
        )

    try:
        if extensao == ".csv":
            for encoding in ("utf-8-sig", "latin-1"):
                try:
                    return pd.read_csv(
                        io.BytesIO(conteudo),
                        sep=None,
                        engine="python",
                        encoding=encoding,
                        dtype=object,
                        header=None,
                    )
                except UnicodeDecodeError:
                    continue
            raise PlanilhaInvalida("Não foi possível decodificar o CSV (tente salvar como UTF-8).")

        return pd.read_excel(
            io.BytesIO(conteudo),
            sheet_name=aba if aba is not None else 0,
            dtype=object,
            header=None,
            engine=_motor(extensao),
        )
    except PlanilhaInvalida:
        raise
    except Exception as erro:  # noqa: BLE001
        raise PlanilhaInvalida(f"Não foi possível ler o arquivo: {erro}") from erro


def detectar_linha_cabecalho(bruto: pd.DataFrame, aliases_esperados: set[str]) -> int:
    """Descobre em qual linha está o cabeçalho.

    Pontua cada linha candidata: quantas células batem com um nome de coluna
    esperado (peso alto) e quantas são textos curtos e distintos, típicos de
    cabeçalho (peso baixo). Empate resolve pela linha mais acima.
    """
    melhor_linha, melhor_nota = 0, -1.0
    limite = min(MAX_LINHAS_BUSCA_CABECALHO, len(bruto))

    for indice in range(limite):
        celulas = [limpar_texto(v) for v in bruto.iloc[indice].tolist()]
        preenchidas = [c for c in celulas if c]
        if len(preenchidas) < 2:
            continue

        reconhecidas = sum(1 for c in preenchidas if chave(c) in aliases_esperados)
        # Cabeçalho costuma ser texto curto, sem números soltos e sem repetição.
        textuais = sum(1 for c in preenchidas if not _parece_numero(c) and len(c) <= 40)
        distintas = len({chave(c) for c in preenchidas}) / len(preenchidas)

        nota = reconhecidas * 10 + textuais + distintas * 2
        if nota > melhor_nota:
            melhor_linha, melhor_nota = indice, nota

    return melhor_linha


def _parece_numero(texto: str) -> bool:
    return bool(re.fullmatch(r"[-+]?[\d.,]+", texto))


def ler_aba(
    conteudo: bytes,
    nome_arquivo: str,
    aba: str | None = None,
    aliases_esperados: set[str] | None = None,
) -> tuple[pd.DataFrame, int]:
    """Devolve (DataFrame com cabeçalho correto, número da linha do cabeçalho na planilha).

    A linha devolvida é 1-based, como o Excel mostra.
    """
    bruto = _ler_bruto(conteudo, nome_arquivo, aba)
    if bruto.empty:
        raise PlanilhaInvalida("A planilha está vazia.")

    indice_cabecalho = detectar_linha_cabecalho(bruto, aliases_esperados or set())

    cabecalhos = [limpar_texto(v) for v in bruto.iloc[indice_cabecalho].tolist()]
    # Colunas sem nome viram "Coluna N" para não colidirem entre si.
    nomes: list[str] = []
    vistos: dict[str, int] = {}
    for posicao, titulo in enumerate(cabecalhos, start=1):
        nome = titulo or f"Coluna {posicao}"
        if nome in vistos:
            vistos[nome] += 1
            nome = f"{nome} ({vistos[nome]})"
        else:
            vistos[nome] = 1
        nomes.append(nome)

    dados = bruto.iloc[indice_cabecalho + 1 :].copy()
    dados.columns = nomes
    # O índice vira o número real da linha no Excel ANTES de descartar as linhas
    # vazias — senão cada linha em branco no meio desloca a numeração e a
    # inconsistência aponta para a linha errada.
    dados.index = range(indice_cabecalho + 2, indice_cabecalho + 2 + len(dados))
    dados = dados.dropna(how="all").dropna(axis=1, how="all")

    return dados, indice_cabecalho + 1
