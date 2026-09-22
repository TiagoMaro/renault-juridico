"""Relatórios, fórmulas e cadastros do financeiro, com a planilha modelo.

A planilha modelo (app/services/modelo_financeiro.py) tem o mesmo layout e as
mesmas fórmulas da planilha real do Jurídico, com dados fictícios. Usa o ano
2023 para não se misturar com os dados de test_financeiro.py.
"""

import io

import pytest
from fastapi.testclient import TestClient
from openpyxl import load_workbook

from app.models.financeiro import derivar_status_adiantamento, derivar_status_lancamento
from app.services.formulas import Grade, avaliar_aritmetica, extrair_criterio_soma
from app.services.modelo_financeiro import gerar_planilha_financeira

ANO = 2023
NOME = f"Pagamentos_Juridico_{ANO}.xlsx"


@pytest.fixture(scope="module")
def modelo() -> tuple[bytes, list[dict]]:
    return gerar_planilha_financeira(ANO)


@pytest.fixture(scope="module")
def importado(cliente: TestClient, cabecalho_auth: dict, modelo) -> dict:
    conteudo, _ = modelo
    resposta = cliente.post(
        "/api/financeiro/importacoes",
        headers=cabecalho_auth,
        files={"arquivo": (NOME, conteudo, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
    )
    assert resposta.status_code == 201, resposta.text
    return resposta.json()


def _total(lancamentos: list[dict], **filtro) -> float:
    def bate(l: dict) -> bool:
        for letra, valor in filtro.items():
            if str(l.get(letra) or "").strip().lower() != str(valor).strip().lower():
                return False
        return True

    return round(sum(l["G"] for l in lancamentos if bate(l)), 2)


# --------------------------------------------------------------------------
# Unidades: fórmulas e status
# --------------------------------------------------------------------------


def test_status_segue_a_formula_da_planilha():
    assert derivar_status_lancamento(None, None, None, None, None) == "Lançar Pgto"
    assert derivar_status_lancamento("123", None, None, None, None) == "RC Criada"
    assert derivar_status_lancamento("123", "450", None, None, None) == "Pedido Concluído"
    assert derivar_status_lancamento("123", "450", "18", None, None) == "Pedido Recepcionado"
    assert derivar_status_lancamento(None, None, None, "10.02.2024", None) == "Enviado para pagamento"
    assert derivar_status_lancamento(None, None, None, None, "2114") == "Pago"

    assert derivar_status_adiantamento(None, None, None) == "Lançar adiantamento"
    assert derivar_status_adiantamento("1317", None, None) == "Adiantamento Lançado"
    assert derivar_status_adiantamento("1317", "1345", None) == "Baixa lançada"
    assert derivar_status_adiantamento("1317", "1345", "2949") == "Adiantamento Baixado"


def test_criterio_do_sumifs_resolve_referencias():
    grade = Grade(
        nome="RAP PAGAMENTOS",
        valores=[[None, None, None], [None, "CORPORATE", "Cível"], [None, "DEPÓSITO", None]],
        formulas=[[None, None, None], [None, "CORPORATE", "Cível"], [None, "DEPÓSITO", None]],
    )
    cl = "'Controle Lançamentos'"
    formula = f"=SUMIFS({cl}!G:G,{cl}!C:C,'RAP PAGAMENTOS'!C2,{cl}!Q:Q,'RAP PAGAMENTOS'!$B$2)"
    criterio = extrair_criterio_soma(formula, grade)
    assert criterio.valido and criterio.filtros == {"area": "Cível", "edoa": "CORPORATE"}

    literal = extrair_criterio_soma(f'=SUMIFS({cl}!G:G,{cl}!C:C,"consumidor",{cl}!Q:Q,$B$2)', grade)
    assert literal.filtros["area"] == "consumidor"

    vazia = extrair_criterio_soma(f"=SUMIFS({cl}!G:G,{cl}!C:C,C3,{cl}!Q:Q,$B$2)", grade)
    assert not vazia.valido and "vazia" in vazia.observacao

    quebrada = extrair_criterio_soma(f"=SUMIFS({cl}!G:G,{cl}!#REF!,#REF!)", grade)
    assert not quebrada.valido

    assert extrair_criterio_soma(1234, grade) is None


def test_aritmetica_simples_sem_eval():
    assert avaliar_aritmetica("=7457.5+8011.26") == pytest.approx(15468.76)
    assert avaliar_aritmetica("=(10*3)/2") == 15
    assert avaliar_aritmetica("=A1+2") is None
    assert avaliar_aritmetica("=__import__('os')") is None


# --------------------------------------------------------------------------
# Importação da planilha modelo
# --------------------------------------------------------------------------


def test_preview_do_modelo(cliente: TestClient, cabecalho_auth: dict, modelo):
    conteudo, _ = modelo
    resposta = cliente.post(
        "/api/financeiro/importacoes/preview",
        headers=cabecalho_auth,
        files={"arquivo": (NOME, conteudo, "application/vnd.ms-excel")},
    )
    assert resposta.status_code == 200, resposta.text
    corpo = resposta.json()
    assert corpo["ano_detectado"] == ANO
    destinos = {a["aba"]: a["destino"] for a in corpo["abas"]}
    assert destinos["Controle Lançamentos"] == "lancamentos"
    assert destinos["LGPD"] == "derivada"
    assert destinos["Honorarios Variaveis "] == "honorarios"
    # Nenhuma coluna "nan" vinda de célula vazia do cabeçalho.
    assert not any("nan" in c.lower() for a in corpo["abas"] for c in a["colunas"])


def test_importa_todas_as_abas(importado: dict, modelo):
    _, lancamentos = modelo
    por_aba = {a["aba"]: a for a in importado["abas"]}
    assert por_aba["Controle Lançamentos"]["criados"] == len(lancamentos)
    assert por_aba["Adiantamentos"]["criados"] == 4
    assert por_aba["Devoluções"]["criados"] == 2
    # RF MENSAL não tem cabeçalho: a primeira conta não pode virar título.
    assert por_aba["RF MENSAL"]["criados"] + por_aba["RF MENSAL"]["atualizados"] >= 2
    assert importado["mes_fechamento"] == 2
    # A linha do RAP que usa célula vazia como critério é apontada.
    assert por_aba["RAP PAGAMENTOS"]["problemas"] >= 2  # realizado digitado + critério vazio


def test_rf_mensal_primeira_conta_nao_se_perde(cliente: TestClient, cabecalho_auth: dict, importado: dict):
    contas = cliente.get("/api/financeiro/cadastros/contas", headers=cabecalho_auth).json()
    assert any(c["conta"] == "635110" and c["centro_custo"] == "GI52000" for c in contas)


def test_status_e_valores_vem_das_colunas(cliente: TestClient, cabecalho_auth: dict, importado: dict, modelo):
    _, lancamentos = modelo
    corpo = cliente.get(f"/api/financeiro/lancamentos?ano={ANO}&por_pagina=500", headers=cabecalho_auth).json()
    assert corpo["total"] == len(lancamentos)
    # Status recalculado pela regra da coluna A (a planilha modelo não tem cache).
    pagos_esperados = sum(1 for l in lancamentos if l.get("U"))
    assert sum(1 for i in corpo["itens"] if i["status"] == "Pago") == pagos_esperados


# --------------------------------------------------------------------------
# RAP
# --------------------------------------------------------------------------


def test_rap_realizado_segue_a_formula(cliente: TestClient, cabecalho_auth: dict, importado: dict, modelo):
    _, lancamentos = modelo
    corpo = cliente.get(f"/api/financeiro/rap?ano={ANO}", headers=cabecalho_auth).json()
    assert corpo["mes_fechamento"] == 2
    linhas = {(g["grupo"], l["rotulo"]): l for g in corpo["bloco1"] for l in g["linhas"]}

    # SUMIF só por EDOA
    assert linhas[("CARTÓRIO", None)]["realizado_ano"] == pytest.approx(_total(lancamentos, Q="CARTÓRIO"))
    # SUMIFS área + EDOA
    assert linhas[("HONORÁRIOS E DESPESAS", "Cível")]["realizado_ano"] == pytest.approx(
        _total(lancamentos, C="Cível", Q="HONORÁRIOS E DESPESAS")
    )
    # "TRIBUTÁRIO" na planilha soma o EDOA CORPORATE — e o sistema avisa.
    tributario = linhas[("TRIBUTÁRIO", "Tributário")]
    assert tributario["realizado_ano"] == pytest.approx(_total(lancamentos, C="Tributário", Q="CORPORATE"))
    assert any("CORPORATE" in a for a in tributario["alertas"])
    # Duas linhas com o mesmo critério: alerta de dupla contagem.
    assert any("duas vezes" in a for a in linhas[("DEPÓSITO JUDICIAL", "Consumidor")]["alertas"])
    # Realizado digitado à mão (3) é mantido.
    assert linhas[("SISTEMAS", None)]["realizado_ano"] == pytest.approx(3)


def test_rap_previsto_usa_o_mes_de_fechamento(cliente: TestClient, cabecalho_auth: dict, importado: dict):
    corpo = cliente.get(f"/api/financeiro/rap?ano={ANO}&mes_fechamento=6", headers=cabecalho_auth).json()
    cartorio = next(g for g in corpo["bloco1"] if g["grupo"] == "CARTÓRIO")["total"]
    assert cartorio["previsto"] == pytest.approx(140000 / 12 * 6, abs=0.01)
    # Realizado até junho = ano inteiro (a planilha modelo vai até junho).
    assert cartorio["realizado"] == pytest.approx(cartorio["realizado_ano"])


def test_rap_bloco2_variavel_nao_fica_zerado(cliente: TestClient, cabecalho_auth: dict, importado: dict, modelo):
    _, lancamentos = modelo
    corpo = cliente.get(f"/api/financeiro/rap?ano={ANO}", headers=cabecalho_auth).json()
    civel = next(b for b in corpo["bloco2"] if b["area"] == "Cível")
    esperado = _total(lancamentos, C="Cível", Q="HONORÁRIOS E DESPESAS", J="Variável pontual")
    assert esperado > 0
    assert civel["variavel"]["realizado_ano"] == pytest.approx(esperado)
    assert civel["fixo"]["realizado_ano"] == pytest.approx(
        _total(lancamentos, C="Cível", Q="HONORÁRIOS E DESPESAS", J="Fixo")
    )


def test_mes_de_fechamento_e_linha_do_orcamento_editaveis(cliente: TestClient, cabecalho_auth: dict, importado: dict):
    assert cliente.put(f"/api/financeiro/exercicios/{ANO}", headers=cabecalho_auth, json={"mes_fechamento": 4}).status_code == 200
    corpo = cliente.get(f"/api/financeiro/rap?ano={ANO}", headers=cabecalho_auth).json()
    assert corpo["mes_fechamento"] == 4

    # Corrige a linha do DEPÓSITO JUDICIAL (critério em célula vazia).
    linha = next(l for g in corpo["bloco1"] for l in g["linhas"] if g["grupo"] == "DEPÓSITO JUDICIAL" and l["rotulo"] is None)
    resposta = cliente.put(
        f"/api/financeiro/orcamento/itens/{linha['id']}",
        headers=cabecalho_auth,
        json={"filtro_edoa": "CORPORATE", "filtro_area": "Tributário"},
    )
    assert resposta.status_code == 200 and resposta.json()["regra_origem"] == "manual"
    corpo = cliente.get(f"/api/financeiro/rap?ano={ANO}", headers=cabecalho_auth).json()
    corrigida = next(l for g in corpo["bloco1"] for l in g["linhas"] if l["id"] == linha["id"])
    assert corrigida["realizado_ano"] > 0
    cliente.put(f"/api/financeiro/exercicios/{ANO}", headers=cabecalho_auth, json={"mes_fechamento": 2})


# --------------------------------------------------------------------------
# Resultado, análise e honorários
# --------------------------------------------------------------------------


def test_resultado_com_layout(cliente: TestClient, cabecalho_auth: dict, importado: dict, modelo):
    _, lancamentos = modelo
    corpo = cliente.get(f"/api/financeiro/resultado?ano={ANO}&mes=3", headers=cabecalho_auth).json()
    assert corpo["tem_layout"] is True
    linhas = {(l["categoria"], l["doa"]): l for l in corpo["linhas"]}
    trab = linhas[("RDB - TRAB CVP", "TRABALHISTA GERAL")]
    assert trab["impacto"] == "MASSA"
    assert trab["valor_ano"] == pytest.approx(_total(lancamentos, B="RDB - TRAB CVP", Q="TRABALHISTA GERAL"))
    assert trab["valor_mes"] == pytest.approx(
        _total(lancamentos, B="RDB - TRAB CVP", Q="TRABALHISTA GERAL", H="Março")
    )
    # "ACORDOS CONSUMIDOR + SAC" não tem fórmula: critério inferido para os dois EDOAs.
    acordos = linhas[("RDB - CONS", "ACORDOS CONSUMIDOR + SAC")]
    assert acordos["regra_origem"] == "inferida"
    assert acordos["valor_ano"] == pytest.approx(
        _total(lancamentos, B="RDB - CONS", Q="ACORDOS CONSUMIDOR") + _total(lancamentos, B="RDB - CONS", Q="ACORDOS SAC")
    )
    # Gasto que nenhuma linha mostra não some.
    assert corpo["total_nao_mapeado_ano"] > 0


def test_analise_por_edoa_reproduz_a_aba_lgpd(cliente: TestClient, cabecalho_auth: dict, importado: dict, modelo):
    _, lancamentos = modelo
    corpo = cliente.get(f"/api/financeiro/analise?ano={ANO}", headers=cabecalho_auth).json()
    assert corpo["edoa"] == "LGPD GERAL & TERCEIROS"
    assert corpo["total"]["total"] == pytest.approx(_total(lancamentos, Q="LGPD GERAL & TERCEIROS"))
    assert set(corpo["colunas"]) == {"Fixo", "Variável pontual"}

    por_mes = cliente.get(
        f"/api/financeiro/analise?ano={ANO}&edoa=&linha1=edoa&linha2=&coluna=mes", headers=cabecalho_auth
    ).json()
    assert por_mes["colunas"][0] == "Janeiro"
    assert por_mes["total"]["total"] == pytest.approx(_total(lancamentos))

    assert cliente.get(f"/api/financeiro/analise?ano={ANO}&coluna=xyz", headers=cabecalho_auth).status_code == 422


def test_plano_de_honorarios_calcula_o_real(cliente: TestClient, cabecalho_auth: dict, importado: dict, modelo):
    _, lancamentos = modelo
    corpo = cliente.get(f"/api/financeiro/plano-honorarios?ano={ANO}", headers=cabecalho_auth).json()
    assert len(corpo["itens"]) == 5
    # Mês digitado como fórmula ("=2500.5") é calculado.
    mao_de_obra = next(i for i in corpo["itens"] if i["detalhamento"].startswith("Mão de obra"))
    assert mao_de_obra["meses"][0] == pytest.approx(2500.5)
    grupo = next(g for g in corpo["grupos"] if g["area"] == "Tributário" and g["recorrencia"] == "Fixo")
    assert grupo["real"] == pytest.approx(_total(lancamentos, C="Tributário", Q="HONORÁRIOS E DESPESAS", J="Fixo"))


def test_contratos_mensais(cliente: TestClient, cabecalho_auth: dict, importado: dict):
    corpo = cliente.get(f"/api/financeiro/contratos?ano={ANO}", headers=cabecalho_auth).json()
    tipos = {c["tipo"] for c in corpo["contratos"]}
    assert tipos == {"Escritório", "Sistema"}
    assert corpo["total_mensal"] > 0


# --------------------------------------------------------------------------
# Reimportação e lançamentos manuais
# --------------------------------------------------------------------------


def test_reimportar_remove_o_que_saiu_da_planilha_e_preserva_o_manual(
    cliente: TestClient, cabecalho_auth: dict, importado: dict, modelo
):
    conteudo, lancamentos = modelo

    manual = cliente.post(
        "/api/financeiro/lancamentos",
        headers=cabecalho_auth,
        json={
            "categoria": "RDB - DIV", "area": "Cível", "motivo": "Custas", "valor": 123.45,
            "mes_referencia": "Maio", "ano_referencia": ANO, "edoa": "HONORÁRIOS E DESPESAS", "rc": "999",
        },
    )
    assert manual.status_code == 201, manual.text
    assert manual.json()["status"] == "RC Criada"
    assert manual.json()["manual"] is True

    wb = load_workbook(io.BytesIO(conteudo))
    wb["Controle Lançamentos"].delete_rows(2, 1)  # some a primeira linha
    buffer = io.BytesIO()
    wb.save(buffer)

    resposta = cliente.post(
        "/api/financeiro/importacoes",
        headers=cabecalho_auth,
        files={"arquivo": (NOME, buffer.getvalue(), "application/vnd.ms-excel")},
    )
    assert resposta.status_code == 201, resposta.text
    aba = next(a for a in resposta.json()["abas"] if a["aba"] == "Controle Lançamentos")
    assert aba["removidos"] == 1
    assert aba["criados"] == 0

    corpo = cliente.get(f"/api/financeiro/lancamentos?ano={ANO}&por_pagina=500", headers=cabecalho_auth).json()
    assert corpo["total"] == len(lancamentos) - 1 + 1  # -1 removido, +1 manual

    # Editar recalcula o status; excluir devolve 204.
    identificador = manual.json()["id"]
    editado = cliente.put(
        f"/api/financeiro/lancamentos/{identificador}", headers=cabecalho_auth, json={"documento_pago": "2114"}
    )
    assert editado.status_code == 200 and editado.json()["status"] == "Pago"
    assert cliente.delete(f"/api/financeiro/lancamentos/{identificador}", headers=cabecalho_auth).status_code == 204


def test_crud_de_adiantamento_e_devolucao(cliente: TestClient, cabecalho_auth: dict, importado: dict):
    novo = cliente.post(
        "/api/financeiro/adiantamentos",
        headers=cabecalho_auth,
        json={"area": "Cível", "valor": 1000, "escritorio": "Escritório Teste", "chamado_adiantamento": "77", "ano_referencia": ANO},
    )
    assert novo.status_code == 201, novo.text
    assert novo.json()["status"] == "Adiantamento Lançado"
    ident = novo.json()["id"]
    baixado = cliente.put(
        f"/api/financeiro/adiantamentos/{ident}",
        headers=cabecalho_auth,
        json={"chamado_baixa": "78", "documento_baixa": "79"},
    )
    assert baixado.json()["status"] == "Adiantamento Baixado"
    assert cliente.delete(f"/api/financeiro/adiantamentos/{ident}", headers=cabecalho_auth).status_code == 204

    devolucao = cliente.post(
        "/api/financeiro/devolucoes",
        headers=cabecalho_auth,
        json={"area": "Cível", "fornecedor": "Escritório Teste", "valor_devolvido": 50, "ano_referencia": ANO},
    )
    assert devolucao.status_code == 201, devolucao.text
    assert cliente.delete(f"/api/financeiro/devolucoes/{devolucao.json()['id']}", headers=cabecalho_auth).status_code == 204


# --------------------------------------------------------------------------
# Cadastros, modelo e integração com o importador de processos
# --------------------------------------------------------------------------


def test_cadastros_de_dominio_e_contas(cliente: TestClient, cabecalho_auth: dict, importado: dict):
    corpo = cliente.get("/api/financeiro/cadastros/dominios", headers=cabecalho_auth).json()
    areas = next(t for t in corpo["tipos"] if t["tipo"] == "area")
    assert any(i["valor"] == "Consumidor" and i["uso"] for i in areas["itens"])

    criado = cliente.post("/api/financeiro/cadastros/dominios", headers=cabecalho_auth, json={"tipo": "area", "valor": "Ambiental"})
    assert criado.status_code == 201
    duplicado = cliente.post("/api/financeiro/cadastros/dominios", headers=cabecalho_auth, json={"tipo": "area", "valor": " ambiental "})
    assert duplicado.status_code == 409
    assert cliente.delete(f"/api/financeiro/cadastros/dominios/{criado.json()['id']}", headers=cabecalho_auth).status_code == 204

    conta = cliente.post(
        "/api/financeiro/cadastros/contas",
        headers=cabecalho_auth,
        json={"centro_custo": "GI59999", "conta": "600001", "descricao": "Teste"},
    )
    assert conta.status_code == 201
    assert cliente.post(
        "/api/financeiro/cadastros/contas", headers=cabecalho_auth, json={"centro_custo": "GI59999", "conta": "600001"}
    ).status_code == 409
    assert cliente.delete(f"/api/financeiro/cadastros/contas/{conta.json()['id']}", headers=cabecalho_auth).status_code == 204


def test_anos_disponiveis(cliente: TestClient, cabecalho_auth: dict, importado: dict):
    corpo = cliente.get("/api/financeiro/anos", headers=cabecalho_auth).json()
    assert ANO in [a["ano"] for a in corpo["anos"]]
    assert len(corpo["meses"]) == 12


def test_download_do_modelo(cliente: TestClient, cabecalho_auth: dict):
    resposta = cliente.get("/api/financeiro/importacoes/modelo?ano=2025", headers=cabecalho_auth)
    assert resposta.status_code == 200
    assert resposta.content[:2] == b"PK"
    assert "2025" in resposta.headers["content-disposition"]


def test_importador_de_processos_redireciona_a_planilha_financeira(cliente: TestClient, cabecalho_auth: dict, modelo):
    conteudo, _ = modelo
    resposta = cliente.post(
        "/api/importacoes/preview",
        headers=cabecalho_auth,
        files={"arquivo": (NOME, conteudo, "application/vnd.ms-excel")},
    )
    assert resposta.status_code == 422
    assert "Financeiro" in resposta.json()["detail"]
