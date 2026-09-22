"""Testes das regras de leitura da planilha — o ponto mais sensível do sistema."""

from datetime import date

import pytest

from app.services import normalizacao as norm


@pytest.mark.parametrize(
    ("entrada", "esperado"),
    [
        ("R$ 1.234.567,89", 1234567.89),
        ("1.234,56", 1234.56),
        ("1234,56", 1234.56),
        ("1,234,567.89", 1234567.89),
        ("1234.56", 1234.56),
        ("450000", 450000.0),
        (450000, 450000.0),
        (450000.5, 450000.5),
        ("R$ 1.500", 1500.0),
    ],
)
def test_valores_em_formato_brasileiro_e_americano(entrada, esperado):
    valor, problema = norm.normalizar_valor(entrada, "Valor da causa")
    assert valor == esperado
    assert problema is None


@pytest.mark.parametrize("entrada", ["a confirmar", "", None, "-"])
def test_valor_invalido_gera_inconsistencia(entrada):
    valor, problema = norm.normalizar_valor(entrada, "Valor do risco")
    assert valor == 0.0
    assert problema is not None


@pytest.mark.parametrize(
    ("entrada", "esperado"),
    [
        ("15/03/2021", date(2021, 3, 15)),
        ("2021-03-15", date(2021, 3, 15)),
        ("15-03-2021", date(2021, 3, 15)),
        ("15.03.2021", date(2021, 3, 15)),
        (44270, date(2021, 3, 15)),  # serial do Excel
    ],
)
def test_datas_em_varios_formatos(entrada, esperado):
    data, problema = norm.normalizar_data(entrada)
    assert data == esperado
    assert problema is None


def test_data_invalida_nao_quebra_a_importacao():
    data, problema = norm.normalizar_data("31/31/2022")
    assert data is None
    assert "inválida" in problema


@pytest.mark.parametrize(
    ("entrada", "esperado"),
    [("ativo", "Ativo"), ("EM ANDAMENTO", "Ativo"), ("encerrado", "Inativo"), ("Arquivado", "Inativo")],
)
def test_status_aceita_sinonimos(entrada, esperado):
    assert norm.normalizar_status(entrada)[0] == esperado


def test_status_desconhecido_assume_ativo_e_avisa():
    valor, problema = norm.normalizar_status("em análise")
    assert valor == "Ativo"
    assert problema is not None


@pytest.mark.parametrize(
    ("entrada", "esperado"),
    [("passivo", "Polo Passivo"), ("ativo", "Polo Ativo"), ("Polo Passivo", "Polo Passivo"), ("ré", "Polo Passivo")],
)
def test_posicao_da_renault(entrada, esperado):
    assert norm.normalizar_posicao(entrada)[0] == esperado


@pytest.mark.parametrize(("entrada", "esperado"), [("Sim", True), ("S", True), ("Não", False), ("n", False)])
def test_defesa_realizada(entrada, esperado):
    assert norm.normalizar_defesa(entrada)[0] is esperado


def test_natureza_e_fase_sao_padronizadas():
    assert norm.normalizar_natureza("trabalhista - rescisão")[0] == "Trabalhista"
    assert norm.normalizar_natureza("Fiscal")[0] == "Tributário"
    assert norm.normalizar_fase("cumprimento de sentença")[0] == "Cumprimento de sentença"
    assert norm.normalizar_fase("fase recursal")[0] == "Recurso"


def test_numero_de_autos_recebe_mascara_cnj():
    numero, problema = norm.normalizar_numero_autos("00012345620215090015")
    assert numero == "0001234-56.2021.5.09.0015"
    assert problema is None


def test_numero_de_autos_ausente_e_bloqueante():
    numero, problema = norm.normalizar_numero_autos("")
    assert numero is None
    assert problema == "Número de processo ausente"


def test_mapeamento_de_colunas_tolera_variacoes_de_cabecalho():
    colunas = [
        "STATUS",
        "Autor/Réu",
        "Numero Autos",
        "Natureza da ação",
        "Vara",
        "Comarca",
        "Data de Início",
        "Posição da Renaut",  # grafia do briefing original
        "Resumo do caso",
        "Defesa",
        "Fase processual",
        "Movimentações",
        "Valor da causa (R$)",
        "Valor do risco",
    ]
    mapa, ausentes = norm.mapear_colunas(colunas)
    assert ausentes == []
    assert mapa["numero_autos"] == "Numero Autos"
    assert mapa["posicao_renault"] == "Posição da Renaut"
    assert mapa["valor_causa"] == "Valor da causa (R$)"


def test_colunas_obrigatorias_ausentes_sao_reportadas():
    _, ausentes = norm.mapear_colunas(["Comarca", "Vara"])
    assert "Número dos Autos" in ausentes
    assert "Autor/Réu" in ausentes


def test_movimentacoes_sao_quebradas_e_classificadas():
    texto = (
        "15/12/2024 - Despacho: recurso recebido.\n"
        "28/11/2024 - Recurso ordinário interposto.\n"
        "10/10/2024 - Sentença proferida."
    )
    itens = norm.extrair_movimentacoes(texto)
    assert len(itens) == 3
    assert itens[0]["data"] == date(2024, 12, 15)
    assert itens[0]["tipo"] == "despacho"
    assert itens[1]["tipo"] == "recurso"
    assert itens[2]["tipo"] == "sentenca"


def test_faixa_de_risco_por_valor():
    comum = {"status": "Ativo", "defesa_realizada": True, "critico_min": 1_000_000, "alto_min": 300_000, "medio_min": 50_000}
    assert norm.calcular_risco(2_000_000, **comum) == "Crítico"
    assert norm.calcular_risco(400_000, **comum) == "Alto"
    assert norm.calcular_risco(80_000, **comum) == "Médio"
    assert norm.calcular_risco(10_000, **comum) == "Baixo"


def test_processo_ativo_sem_defesa_sobe_uma_faixa():
    base = {"critico_min": 1_000_000, "alto_min": 300_000, "medio_min": 50_000}
    com_defesa = norm.calcular_risco(80_000, status="Ativo", defesa_realizada=True, **base)
    sem_defesa = norm.calcular_risco(80_000, status="Ativo", defesa_realizada=False, **base)
    assert com_defesa == "Médio"
    assert sem_defesa == "Alto"

    # Processo encerrado não é agravado.
    inativo = norm.calcular_risco(80_000, status="Inativo", defesa_realizada=False, **base)
    assert inativo == "Médio"
