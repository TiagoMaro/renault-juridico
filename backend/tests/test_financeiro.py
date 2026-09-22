"""Testes do módulo financeiro: leitura multi-aba, idempotência e cálculos.

A planilha usada é construída aqui, reproduzindo as características reais do
arquivo do Jurídico: cabeçalho fora da linha 1, valores com centavos, datas em
dd.mm.aaaa, espaço duro nos códigos, grafias divergentes e abas de resumo.
"""

import io

import pandas as pd
import pytest
from fastapi.testclient import TestClient


def _planilha_pagamentos() -> bytes:
    """Monta um arquivo multi-aba no mesmo formato da planilha real."""
    buffer = io.BytesIO()

    lancamentos = pd.DataFrame(
        [
            {
                "STATUS": "Pago", "CATEGORIA": "RDB - CONS", "ÁREA": "Consumidor", "PAGAMENTO": "Interno",
                "REFERÊNCIA": "1231", "MOTIVO": "Honorários", "Valor": 35720, "MÊS REFERENCIA": "Janeiro",
                "DATA PAGAMENTO": "25.03.2024", "RECORRÊNCIA": "Fixo", "DESCRIÇÃO": "Honorários fixo mensal",
                "RC": "25857678", "Nº PEDIDO": "4507978092", "Recepção": "181749609", "ITEM": "10",
                "CHAMADO": "1347508\xa0", "EDOA": "HONORÁRIOS E DESPESAS", "CENTRO DE CUSTO": " GI52000",
                "CONTA CONTÁBIL": "622600", "ENVIO PARA PAGAMENTO": "14.02.2024", "PAGO / Nº DOCUMENTO": "211418846",
            },
            {
                "STATUS": "Enviado para pagamento", "CATEGORIA": "RDB - TRAB CVP", "ÁREA": "Trabalhista",
                "PAGAMENTO": "ADIANTAMENTO", "REFERÊNCIA": "1232", "MOTIVO": "acordo", "Valor": 12953.91,
                "MÊS REFERENCIA": "Fevereiro", "DATA PAGAMENTO": "22.04.2024", "RECORRÊNCIA": "variável pontual",
                "DESCRIÇÃO": "Acordo trabalhista", "RC": None, "Nº PEDIDO": None, "Recepção": None, "ITEM": None,
                "CHAMADO": "1336967", "EDOA": "TRABALHISTA GERAL", "CENTRO DE CUSTO": "GI52015",
                "CONTA CONTÁBIL": "611205", "ENVIO PARA PAGAMENTO": "20.02.2024", "PAGO / Nº DOCUMENTO": None,
            },
            {
                # Ano digitado errado: deve virar inconsistência, sem travar a importação.
                "STATUS": "Pago", "CATEGORIA": "RDB - DIV", "ÁREA": "Outra Área", "PAGAMENTO": "Interno",
                "REFERÊNCIA": "1233", "MOTIVO": "Custas", "Valor": 520, "MÊS REFERENCIA": "Janeiro",
                "DATA PAGAMENTO": "29.01.1024", "RECORRÊNCIA": "Fixo", "DESCRIÇÃO": "Custas processuais",
                "RC": None, "Nº PEDIDO": None, "Recepção": None, "ITEM": None, "CHAMADO": None,
                "EDOA": "OUTRA ÁREA", "CENTRO DE CUSTO": "GI52000", "CONTA CONTÁBIL": "622200",
                "ENVIO PARA PAGAMENTO": "15.01.2024", "PAGO / Nº DOCUMENTO": "211418850",
            },
            # Linha sem valor: separador visual da planilha, deve ser ignorada.
            {"STATUS": None, "CATEGORIA": None, "ÁREA": None, "PAGAMENTO": None, "REFERÊNCIA": None,
             "MOTIVO": None, "Valor": None, "MÊS REFERENCIA": None, "DATA PAGAMENTO": None,
             "RECORRÊNCIA": None, "DESCRIÇÃO": None, "RC": None, "Nº PEDIDO": None, "Recepção": None,
             "ITEM": None, "CHAMADO": None, "EDOA": None, "CENTRO DE CUSTO": None, "CONTA CONTÁBIL": None,
             "ENVIO PARA PAGAMENTO": None, "PAGO / Nº DOCUMENTO": None},
        ]
    )

    adiantamentos = pd.DataFrame(
        [
            {
                "Status": "Adiantamento Baixado", "Ok na Planilha de pagamentos": "Ok", "Área": "Trabalhista",
                "Valor": 1000000, "Chamado do adiantamento": "1317767", "DOA": "TRABALHISTA",
                "Nº chamado da baixa": "1345558", "Valor Excedente": 2191.43,
                "Valor total do adiantamento": 1002191.43, "Baixa do Adiantamento": "294918121",
                "Escritório": "Escritório Alfa Advogados",
            },
            {
                "Status": "Lançar adiantamento", "Ok na Planilha de pagamentos": None, "Área": "Consumidor",
                "Valor": 400000, "Chamado do adiantamento": "1399999", "DOA": "CORPORATE",
                "Nº chamado da baixa": None, "Valor Excedente": 0, "Valor total do adiantamento": 400000,
                "Baixa do Adiantamento": None, "Escritório": "Gama Consultoria Jurídica",
            },
        ]
    )

    devolucoes = pd.DataFrame(
        [
            {
                "ÁREA": "Consumidor", "FORNECEDOR": "Beta & Associados", "CÓDIGO DO BANCO": "556159",
                "DATA TRANSF/": "2024-01-24", "PASTA BENNER": "Projuris 15424", "VALOR DEVOLVIDO": 38289.52,
                "Nº CHAMADO": "1339551", "DOCUMENTO": "294905649", "OBSERVAÇÃO": "RECLASSIFICAR PARA DOA",
            }
        ]
    )

    # RAP: três linhas de cabeçalho antes dos dados + nível EDOA e nível área.
    rap = pd.DataFrame(
        [
            ["RESTOS A PAGAR", None, None, None],
            [None, None, None, None],
            [None, None, None, None],
            ["EDOA", "ÁREA", "BUDGET \nANUAL", "REALIZADO"],
            ["HONORÁRIOS E DESPESAS", None, 5474000, 999],
            ["HONORÁRIOS E DESPESAS", "Cível", 1070000, 999],
            ["TRABALHISTA GERAL", "Trabalhista", 18300000, 999],
        ]
    )

    honorarios = pd.DataFrame(
        [
            [None, None, None, None, None, None, None],
            ["DOA", "ÁREA", "DETALHAMENTO", "RECORRÊNCIA", "JAN", "FEV", "BUDGET"],
            ["HONORÁRIOS E DESPESAS", "Tributário", "Honorários tributário", "Fixo", 17000, 17000, 204000],
        ]
    )

    mensais = pd.DataFrame(
        [
            {"Àrea": "Consumidor", "Recorrência": "Fixo", "Valor Mensal": 78000, "Anual": 468000},
            # Mesma área e recorrência, valor diferente: são contratos distintos.
            {"Àrea": "Consumidor", "Recorrência": "Fixo", "Valor Mensal": 113000, "Anual": 678000},
        ]
    )

    base = pd.DataFrame(
        {
            "Área": ["Consumidor", "Trabalhista", "Cível"],
            "PAGAMENTO": ["Interno", "Adiantamento", None],
            "Fornecedor": ["Beta & Associados", "Escritório Alfa Advogados", None],
            "Motivo": ["Honorários", "Acordo", "Custas"],
            "Fixo/Varíavel": ["Fixo", "Variável pontual", None],
            "EDOA": ["HONORÁRIOS E DESPESAS", "TRABALHISTA GERAL", None],
        }
    )

    contas = pd.DataFrame(
        [
            [None, None, None, None, None],
            [None, None, None, None, None],
            ["Jurídico", "FADM", "GI52000", "635110", "Despesas com Estudos e Honorários"],
            ["Jurídico", "FADM", "GI52000", "603204", "Despesas com Manutenção"],
        ]
    )

    resultado = pd.DataFrame([["APENAS UM FILTRO POR MESES"], ["MÊS", "Junho"]])

    with pd.ExcelWriter(buffer, engine="xlsxwriter") as writer:
        base.to_excel(writer, index=False, sheet_name="Base")
        resultado.to_excel(writer, index=False, header=False, sheet_name="Resultado")
        lancamentos.to_excel(writer, index=False, sheet_name="Controle Lançamentos")
        rap.to_excel(writer, index=False, header=False, sheet_name="RAP PAGAMENTOS")
        adiantamentos.to_excel(writer, index=False, sheet_name="Adiantamentos")
        honorarios.to_excel(writer, index=False, header=False, sheet_name="Honorarios Variaveis ")
        mensais.to_excel(writer, index=False, sheet_name="Mensais")
        devolucoes.to_excel(writer, index=False, sheet_name="Devoluções")
        contas.to_excel(writer, index=False, header=False, sheet_name="RF MENSAL")

    return buffer.getvalue()


@pytest.fixture(scope="module")
def planilha() -> bytes:
    return _planilha_pagamentos()


def _enviar(cliente: TestClient, cabecalho: dict, conteudo: bytes, ano: int = 2024):
    return cliente.post(
        f"/api/financeiro/importacoes?ano={ano}",
        headers=cabecalho,
        files={"arquivo": ("Pagamentos_Juridico.xlsm", conteudo, "application/vnd.ms-excel.sheet.macroEnabled.12")},
    )


# --------------------------------------------------------------------------
# Leitura do arquivo
# --------------------------------------------------------------------------


def test_preview_identifica_o_destino_de_cada_aba(cliente: TestClient, cabecalho_auth: dict, planilha: bytes):
    resposta = cliente.post(
        "/api/financeiro/importacoes/preview",
        headers=cabecalho_auth,
        files={"arquivo": ("Pagamentos.xlsm", planilha, "application/vnd.ms-excel")},
    )
    assert resposta.status_code == 200, resposta.text
    abas = {a["aba"]: a for a in resposta.json()["abas"]}

    assert abas["Controle Lançamentos"]["destino"] == "lancamentos"
    assert abas["Adiantamentos"]["destino"] == "adiantamentos"
    assert abas["Devoluções"]["destino"] == "devolucoes"
    assert abas["RAP PAGAMENTOS"]["destino"] == "rap"
    assert abas["Mensais"]["destino"] == "mensais"
    assert abas["Base"]["destino"] == "base"
    assert abas["RF MENSAL"]["destino"] == "contas"
    # Do Resultado só se importa o layout (linhas e impacto); os valores são recalculados.
    assert abas["Resultado"]["destino"] == "resultado"


def test_cabecalho_fora_da_primeira_linha_e_localizado(cliente: TestClient, cabecalho_auth: dict, planilha: bytes):
    resposta = cliente.post(
        "/api/financeiro/importacoes/preview",
        headers=cabecalho_auth,
        files={"arquivo": ("Pagamentos.xlsm", planilha, "application/vnd.ms-excel")},
    )
    abas = {a["aba"]: a for a in resposta.json()["abas"]}
    assert abas["RAP PAGAMENTOS"]["linha_cabecalho"] == 4
    assert abas["Honorarios Variaveis "]["linha_cabecalho"] == 2
    assert abas["Controle Lançamentos"]["linha_cabecalho"] == 1


# --------------------------------------------------------------------------
# Importação
# --------------------------------------------------------------------------


def test_importacao_grava_cada_aba_no_lugar_certo(cliente: TestClient, cabecalho_auth: dict, planilha: bytes):
    resposta = _enviar(cliente, cabecalho_auth, planilha)
    assert resposta.status_code == 201, resposta.text
    corpo = resposta.json()

    por_aba = {a["aba"]: a for a in corpo["abas"]}
    # A 4ª linha, toda em branco, é descartada já na leitura.
    assert por_aba["Controle Lançamentos"]["criados"] == 3
    assert por_aba["Controle Lançamentos"]["linhas_lidas"] == 3
    assert por_aba["Adiantamentos"]["criados"] == 2
    assert por_aba["Devoluções"]["criados"] == 1
    assert por_aba["RF MENSAL"]["criados"] == 2

    assert corpo["total_lancamentos"] == 3
    assert corpo["valor_total_lancamentos"] == pytest.approx(35720 + 12953.91 + 520, abs=0.01)


def test_valores_e_dominios_sao_padronizados(cliente: TestClient, cabecalho_auth: dict):
    lista = cliente.get("/api/financeiro/lancamentos?por_pagina=50", headers=cabecalho_auth).json()
    por_referencia = {i["referencia"]: i for i in lista["itens"]}

    # "ADIANTAMENTO" e "variável pontual" viram as grafias canônicas.
    assert por_referencia["1232"]["tipo_pagamento"] == "Adiantamento"
    assert por_referencia["1232"]["recorrencia"] == "Variável pontual"
    assert por_referencia["1232"]["motivo"] == "Acordo"  # veio "acordo"
    # Espaço duro e espaço sobrando são limpos.
    assert por_referencia["1231"]["chamado"] == "1347508"
    assert por_referencia["1231"]["centro_custo"] == "GI52000"
    # Data em dd.mm.aaaa é interpretada.
    assert por_referencia["1231"]["data_pagamento"] == "2024-03-25"
    # Centavos preservados.
    assert por_referencia["1232"]["valor"] == pytest.approx(12953.91, abs=0.001)


def test_ano_de_referencia_vem_do_arquivo_nao_da_data(cliente: TestClient, cabecalho_auth: dict):
    """A planilha é anual: todos os lançamentos do arquivo pertencem ao seu ano."""
    lista = cliente.get("/api/financeiro/lancamentos?ano=2024&por_pagina=50", headers=cabecalho_auth).json()
    assert lista["total"] == 3  # inclusive o que tem data digitada como 1024


def test_data_com_ano_impossivel_vira_inconsistencia(cliente: TestClient, cabecalho_auth: dict):
    importacoes = cliente.get("/api/importacoes", headers=cabecalho_auth).json()
    financeira = next(i for i in importacoes if "Pagamentos_Juridico" in i["arquivo"])
    detalhe = cliente.get(f"/api/importacoes/{financeira['id']}", headers=cabecalho_auth).json()

    problemas = [i["problema"] for i in detalhe["inconsistencias"]]
    assert any("1024" in p and "digitação" in p for p in problemas)


def test_reimportar_nao_duplica_e_nao_inventa_alteracao(
    cliente: TestClient, cabecalho_auth: dict, planilha: bytes
):
    antes = cliente.get("/api/financeiro/lancamentos?por_pagina=1", headers=cabecalho_auth).json()["total"]

    resposta = _enviar(cliente, cabecalho_auth, planilha)
    assert resposta.status_code == 201
    corpo = resposta.json()

    assert corpo["criados"] == 0
    # Sem tolerância na comparação de Decimal x float, valores com centavos
    # apareceriam como "alterados" em toda reimportação.
    assert corpo["atualizados"] == 0

    depois = cliente.get("/api/financeiro/lancamentos?por_pagina=1", headers=cabecalho_auth).json()["total"]
    assert depois == antes


# --------------------------------------------------------------------------
# Consultas e cálculos
# --------------------------------------------------------------------------


def test_filtros_de_lancamentos(cliente: TestClient, cabecalho_auth: dict):
    pagos = cliente.get("/api/financeiro/lancamentos?status=Pago&por_pagina=50", headers=cabecalho_auth).json()
    assert all(i["status"] == "Pago" for i in pagos["itens"])
    assert pagos["total"] == 2

    area = cliente.get("/api/financeiro/lancamentos?area=Trabalhista", headers=cabecalho_auth).json()
    assert area["total"] == 1
    assert area["total_valor"] == pytest.approx(12953.91, abs=0.01)

    faixa = cliente.get("/api/financeiro/lancamentos?valor_min=1000", headers=cabecalho_auth).json()
    assert all(i["valor"] >= 1000 for i in faixa["itens"])

    busca = cliente.get("/api/financeiro/lancamentos?busca=1347508", headers=cabecalho_auth).json()
    assert busca["total"] == 1


def test_dashboard_financeiro_soma_o_que_esta_no_banco(cliente: TestClient, cabecalho_auth: dict):
    corpo = cliente.get("/api/financeiro/dashboard", headers=cabecalho_auth).json()

    total = corpo["total_geral"]["valor"]
    assert total == pytest.approx(35720 + 12953.91 + 520, abs=0.01)
    assert corpo["total_pago"]["valor"] + corpo["em_processamento"]["valor"] == pytest.approx(total, abs=0.01)
    assert sum(item["valor"] for item in corpo["por_area"]) == pytest.approx(total, abs=0.01)
    assert sum(mes["valor"] for mes in corpo["por_mes"]) == pytest.approx(total, abs=0.01)
    assert len(corpo["por_mes"]) == 12  # série sempre completa

    # O adiantamento sem baixa precisa aparecer como alerta.
    assert corpo["adiantamentos_em_aberto"]["valor"] == pytest.approx(400000, abs=0.01)
    assert any("sem baixa" in alerta for alerta in corpo["alertas"])


def test_orcamento_nao_conta_o_mesmo_dinheiro_duas_vezes(cliente: TestClient, cabecalho_auth: dict):
    """A aba RAP traz o total do EDOA e a quebra por área; somar ambos duplicaria."""
    corpo = cliente.get("/api/financeiro/rap?ano=2024", headers=cabecalho_auth).json()

    grupos = {g["grupo"]: g for g in corpo["bloco1"]}
    # HONORÁRIOS E DESPESAS tem linha de nível EDOA (5.474.000) e uma de área
    # (1.070.000): vale a de nível EDOA.
    assert grupos["HONORÁRIOS E DESPESAS"]["total"]["budget"] == pytest.approx(5474000, abs=0.01)
    assert grupos["HONORÁRIOS E DESPESAS"]["total"]["origem"] == "linha do EDOA"
    # TRABALHISTA GERAL só tem linha de área: entra pela soma das áreas.
    assert grupos["TRABALHISTA GERAL"]["total"]["budget"] == pytest.approx(18300000, abs=0.01)
    assert corpo["totais"]["budget"] == pytest.approx(5474000 + 18300000, abs=0.01)
    # O REALIZADO digitado à mão (999, sem fórmula) é respeitado e sinalizado.
    linha = grupos["HONORÁRIOS E DESPESAS"]["linhas"][0]
    assert linha["regra"]["realizado_manual"] == pytest.approx(999)


def test_contratos_mensais_iguais_nao_se_sobrescrevem(cliente: TestClient, cabecalho_auth: dict):
    """Dois contratos da mesma área e recorrência, com valores diferentes, coexistem."""
    corpo = cliente.get("/api/financeiro/contratos?ano=2024", headers=cabecalho_auth).json()
    consumidor = [c for c in corpo["contratos"] if c["area"] == "Consumidor"]
    assert len(consumidor) == 2
    assert sum(c["valor_anual"] for c in consumidor) == pytest.approx(468000 + 678000, abs=0.01)


def test_resultado_sem_layout_mostra_o_gasto_nao_mapeado(cliente: TestClient, cabecalho_auth: dict):
    """Sem linhas na aba Resultado, nada é escondido: tudo aparece como não mapeado."""
    corpo = cliente.get("/api/financeiro/resultado?ano=2024&mes=1", headers=cabecalho_auth).json()
    assert corpo["mes_nome"] == "Janeiro"
    assert corpo["tem_layout"] is False
    assert corpo["total_nao_mapeado_ano"] == pytest.approx(35720 + 12953.91 + 520, abs=0.01)
    # Janeiro tem dois lançamentos: 35.720 e 520.
    assert sum(e["valor_mes"] for e in corpo["nao_mapeados"]) == pytest.approx(36240, abs=0.01)


def test_adiantamentos_e_devolucoes(cliente: TestClient, cabecalho_auth: dict):
    todos = cliente.get("/api/financeiro/adiantamentos", headers=cabecalho_auth).json()
    assert len(todos) == 2

    abertos = cliente.get("/api/financeiro/adiantamentos?em_aberto=true", headers=cabecalho_auth).json()
    assert len(abertos) == 1
    assert abertos[0]["baixado"] is False

    devolucoes = cliente.get("/api/financeiro/devolucoes", headers=cabecalho_auth).json()
    assert len(devolucoes) == 1
    assert devolucoes[0]["valor_devolvido"] == pytest.approx(38289.52, abs=0.01)


def test_opcoes_de_filtro_combinam_banco_e_aba_base(cliente: TestClient, cabecalho_auth: dict):
    corpo = cliente.get("/api/financeiro/lancamentos/opcoes-filtro", headers=cabecalho_auth).json()
    assert "Consumidor" in corpo["areas"]
    # "Cível" só existe na aba Base, não nos lançamentos — ainda assim é ofertada.
    assert "Cível" in corpo["areas"]
    assert "HONORÁRIOS E DESPESAS" in corpo["edoas"]
    assert 2024 in corpo["anos"]


def test_exportacao_devolve_xlsx_no_layout_de_origem(cliente: TestClient, cabecalho_auth: dict):
    resposta = cliente.get("/api/financeiro/lancamentos/exportar?status=Pago", headers=cabecalho_auth)
    assert resposta.status_code == 200
    assert resposta.content[:2] == b"PK"

    planilha = pd.read_excel(io.BytesIO(resposta.content))
    assert "CENTRO DE CUSTO" in planilha.columns
    assert "MÊS REFERENCIA" in planilha.columns
    assert len(planilha) == 2


def test_visualizador_nao_importa_planilha_financeira(cliente: TestClient, planilha: bytes):
    from app.core.database import SessionLocal
    from app.core.security import gerar_hash_senha
    from app.models.usuario import PerfilAcesso, Usuario

    email = "visualizador.teste@renaultgeely.com.br"
    with SessionLocal() as db:
        if not db.query(Usuario).filter(Usuario.email == email).first():
            db.add(Usuario(nome="Visualizador", email=email, senha_hash=gerar_hash_senha("renault@2026"),
                           cargo="QA", perfil=PerfilAcesso.VISUALIZADOR, ativo=True))
            db.commit()
    login = cliente.post(
        "/api/auth/login",
        json={"email": "visualizador.teste@renaultgeely.com.br", "senha": "renault@2026"},
    ).json()
    cabecalho = {"Authorization": f"Bearer {login['access_token']}"}

    # Lê...
    assert cliente.get("/api/financeiro/dashboard", headers=cabecalho).status_code == 200
    # ...mas não importa.
    assert _enviar(cliente, cabecalho, planilha).status_code == 403


def test_arquivo_sem_aba_reconhecida_e_recusado(cliente: TestClient, cabecalho_auth: dict):
    buffer = io.BytesIO()
    pd.DataFrame([{"qualquer": 1}]).to_excel(buffer, index=False, sheet_name="Aleatória")

    resposta = cliente.post(
        "/api/financeiro/importacoes",
        headers=cabecalho_auth,
        files={"arquivo": ("errada.xlsx", buffer.getvalue(), "application/vnd.ms-excel")},
    )
    assert resposta.status_code == 422
    assert "Nenhuma aba reconhecida" in resposta.json()["detail"]
