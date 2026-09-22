"""Teste ponta a ponta: login → importação da planilha → dashboard → relatórios."""

import io

import pandas as pd
import pytest
from fastapi.testclient import TestClient

from app.seed import gerar_linhas


@pytest.fixture(scope="module")
def planilha_bytes() -> bytes:
    """Planilha no formato que os escritórios enviam, incluindo linhas problemáticas."""
    buffer = io.BytesIO()
    pd.DataFrame(gerar_linhas(quantidade=30)).to_excel(buffer, index=False, engine="xlsxwriter")
    return buffer.getvalue()


def test_login_com_senha_errada_e_recusado(cliente: TestClient, admin: dict):
    resposta = cliente.post("/api/auth/login", json={"email": admin["email"], "senha": "errada"})
    assert resposta.status_code == 401


def test_rota_protegida_exige_token(cliente: TestClient):
    assert cliente.get("/api/processos").status_code == 401


def test_login_devolve_token_e_dados_do_usuario(cliente: TestClient, admin: dict):
    resposta = cliente.post("/api/auth/login", json=admin)
    assert resposta.status_code == 200
    corpo = resposta.json()
    assert corpo["access_token"]
    assert corpo["usuario"]["perfil"] == "Administrador"
    assert corpo["usuario"]["iniciais"] == "AT"


def test_preview_reconhece_as_colunas_da_planilha(
    cliente: TestClient, cabecalho_auth: dict, planilha_bytes: bytes
):
    resposta = cliente.post(
        "/api/importacoes/preview",
        headers=cabecalho_auth,
        files={"arquivo": ("planilha.xlsx", planilha_bytes, "application/vnd.ms-excel")},
    )
    assert resposta.status_code == 200, resposta.text
    corpo = resposta.json()
    assert corpo["colunas_obrigatorias_ausentes"] == []
    assert corpo["total_linhas"] == 35  # 30 geradas + 5 linhas problemáticas fixas
    assert all(coluna["reconhecida"] for coluna in corpo["colunas"])


def test_importacao_grava_processos_e_registra_inconsistencias(
    cliente: TestClient, cabecalho_auth: dict, planilha_bytes: bytes
):
    resposta = cliente.post(
        "/api/importacoes",
        headers=cabecalho_auth,
        files={"arquivo": ("planilha_escritorio.xlsx", planilha_bytes, "application/vnd.ms-excel")},
        data={"escritorio": "Souza & Rodrigues Advogados"},
    )
    assert resposta.status_code == 201, resposta.text
    corpo = resposta.json()

    importacao = corpo["importacao"]
    # A linha sem número de autos é descartada; as demais entram.
    assert importacao["registros_validos"] == 34
    assert importacao["criados"] == 34
    assert importacao["total_inconsistencias"] >= 5
    assert importacao["status"] == "Concluído com alertas"
    assert [etapa["nome"] for etapa in corpo["etapas"]][0] == "Arquivo recebido"
    assert len(corpo["etapas"]) == 7
    assert corpo["valor_risco_total"] > 0

    problemas = {i["problema"] for i in corpo["inconsistencias"]}
    assert any("Número de processo ausente" in p for p in problemas)
    assert any("Valor da causa inválido" in p for p in problemas)
    assert any("Data de início inválida" in p for p in problemas)
    assert any("Status desconhecido" in p for p in problemas)
    assert any("maior que o valor da causa" in p for p in problemas)


def test_reimportacao_atualiza_sem_duplicar(
    cliente: TestClient, cabecalho_auth: dict, planilha_bytes: bytes
):
    antes = cliente.get("/api/processos?por_pagina=1", headers=cabecalho_auth).json()["total"]

    resposta = cliente.post(
        "/api/importacoes",
        headers=cabecalho_auth,
        files={"arquivo": ("planilha_escritorio.xlsx", planilha_bytes, "application/vnd.ms-excel")},
        data={"escritorio": "Souza & Rodrigues Advogados"},
    )
    assert resposta.status_code == 201
    assert resposta.json()["importacao"]["criados"] == 0

    depois = cliente.get("/api/processos?por_pagina=1", headers=cabecalho_auth).json()["total"]
    assert depois == antes


def test_listagem_com_busca_filtro_ordenacao_e_paginacao(cliente: TestClient, cabecalho_auth: dict):
    pagina = cliente.get(
        "/api/processos?pagina=1&por_pagina=5&ordenar_por=valor_risco&direcao=desc",
        headers=cabecalho_auth,
    ).json()
    assert len(pagina["itens"]) == 5
    assert pagina["total"] >= 34
    valores = [item["valor_risco"] for item in pagina["itens"]]
    assert valores == sorted(valores, reverse=True)

    trabalhistas = cliente.get("/api/processos?natureza=Trabalhista&por_pagina=50", headers=cabecalho_auth).json()
    assert all(item["natureza"] == "Trabalhista" for item in trabalhistas["itens"])

    busca = cliente.get("/api/processos?busca=Curitiba&por_pagina=50", headers=cabecalho_auth).json()
    assert busca["total"] >= 1


def test_detalhe_traz_movimentacoes_extraidas_da_planilha(cliente: TestClient, cabecalho_auth: dict):
    lista = cliente.get("/api/processos?por_pagina=20", headers=cabecalho_auth).json()
    com_movimentacao = next(item for item in lista["itens"] if item["total_movimentacoes"] > 0)

    detalhe = cliente.get(f"/api/processos/{com_movimentacao['id']}", headers=cabecalho_auth).json()
    assert detalhe["movimentacoes"]
    assert detalhe["movimentacoes"][0]["descricao"]
    assert detalhe["resumo"]


def test_edicao_registra_historico_de_alteracoes(cliente: TestClient, cabecalho_auth: dict):
    processo = cliente.get("/api/processos?por_pagina=1", headers=cabecalho_auth).json()["itens"][0]

    resposta = cliente.put(
        f"/api/processos/{processo['id']}",
        headers=cabecalho_auth,
        json={"valor_risco": 2_500_000, "defesa_realizada": True},
    )
    assert resposta.status_code == 200
    corpo = resposta.json()
    assert corpo["valor_risco"] == 2_500_000
    assert corpo["risco"] == "Crítico"  # recalculado pela regra de faixa

    campos = {h["campo"] for h in corpo["historico"]}
    assert "Valor em Risco" in campos


def test_dashboard_calcula_indicadores_a_partir_do_banco(cliente: TestClient, cabecalho_auth: dict):
    corpo = cliente.get("/api/dashboard", headers=cabecalho_auth).json()

    kpis = corpo["kpis"]
    total = kpis["total_processos"]["valor"]
    assert total >= 34
    assert kpis["processos_ativos"]["valor"] + kpis["processos_inativos"]["valor"] == total
    assert kpis["valor_risco_total"]["valor"] > 0

    assert sum(item["quantidade"] for item in corpo["por_natureza"]) == total
    assert sum(item["quantidade"] for item in corpo["por_risco"]) == total
    assert sum(item["quantidade"] for item in corpo["por_fase"]) == total
    assert len(corpo["evolucao"]) == 12
    assert corpo["pontos_atencao"]


def test_filtro_do_dashboard_altera_os_numeros(cliente: TestClient, cabecalho_auth: dict):
    geral = cliente.get("/api/dashboard", headers=cabecalho_auth).json()
    filtrado = cliente.get("/api/dashboard?natureza=Trabalhista", headers=cabecalho_auth).json()

    assert filtrado["kpis"]["total_processos"]["valor"] <= geral["kpis"]["total_processos"]["valor"]
    assert all(item["label"] == "Trabalhista" for item in filtrado["por_natureza"])


def test_opcoes_de_filtro_vem_do_banco(cliente: TestClient, cabecalho_auth: dict):
    corpo = cliente.get("/api/processos/opcoes-filtro", headers=cabecalho_auth).json()
    assert "Trabalhista" in corpo["naturezas"]
    assert corpo["comarcas"]
    assert corpo["escritorios"] == ["Souza & Rodrigues Advogados"]


def test_analises_geram_insights_com_numeros_reais(cliente: TestClient, cabecalho_auth: dict):
    corpo = cliente.get("/api/analises", headers=cabecalho_auth).json()
    assert corpo["insights"]
    assert any("%" in insight["texto"] for insight in corpo["insights"])
    assert corpo["naturezas_maior_exposicao"]


def test_historico_de_importacoes(cliente: TestClient, cabecalho_auth: dict):
    lista = cliente.get("/api/importacoes", headers=cabecalho_auth).json()
    assert len(lista) >= 2
    detalhe = cliente.get(f"/api/importacoes/{lista[0]['id']}", headers=cabecalho_auth).json()
    assert "inconsistencias" in detalhe


def test_tratamento_de_inconsistencia(cliente: TestClient, cabecalho_auth: dict):
    importacao = cliente.get("/api/importacoes", headers=cabecalho_auth).json()[0]
    detalhe = cliente.get(f"/api/importacoes/{importacao['id']}", headers=cabecalho_auth).json()
    inconsistencia = detalhe["inconsistencias"][0]

    resposta = cliente.patch(
        f"/api/importacoes/inconsistencias/{inconsistencia['id']}",
        headers=cabecalho_auth,
        json={"status": "Ignorado"},
    )
    assert resposta.status_code == 200
    assert resposta.json()["status"] == "Ignorado"


def test_exportacoes_geram_arquivos_validos(cliente: TestClient, cabecalho_auth: dict):
    excel = cliente.get("/api/relatorios/exportar/excel", headers=cabecalho_auth)
    assert excel.status_code == 200
    assert excel.content[:2] == b"PK"  # assinatura de arquivo XLSX
    assert "attachment" in excel.headers["content-disposition"]

    pdf = cliente.get("/api/relatorios/exportar/pdf", headers=cabecalho_auth)
    assert pdf.status_code == 200
    assert pdf.content[:4] == b"%PDF"

    processos = cliente.get("/api/processos/exportar?status=Ativo", headers=cabecalho_auth)
    assert processos.status_code == 200
    assert processos.content[:2] == b"PK"


def test_planilha_em_formato_invalido_e_recusada(cliente: TestClient, cabecalho_auth: dict):
    resposta = cliente.post(
        "/api/importacoes/preview",
        headers=cabecalho_auth,
        files={"arquivo": ("relatorio.txt", b"conteudo qualquer", "text/plain")},
    )
    assert resposta.status_code == 422
    assert "Formato não suportado" in resposta.json()["detail"]


def test_planilha_sem_colunas_obrigatorias_e_recusada(cliente: TestClient, cabecalho_auth: dict):
    buffer = io.BytesIO()
    pd.DataFrame([{"Comarca": "Curitiba", "Vara": "1ª Vara"}]).to_excel(
        buffer, index=False, engine="xlsxwriter"
    )
    resposta = cliente.post(
        "/api/importacoes",
        headers=cabecalho_auth,
        files={"arquivo": ("errada.xlsx", buffer.getvalue(), "application/vnd.ms-excel")},
    )
    assert resposta.status_code == 422
    assert "Colunas obrigatórias não encontradas" in resposta.json()["detail"]


def test_perfil_visualizador_nao_importa_nem_edita(cliente: TestClient, cabecalho_auth: dict):
    criacao = cliente.post(
        "/api/usuarios",
        headers=cabecalho_auth,
        json={
            "nome": "Visualizador de Teste",
            "email": "visualizador.teste@renaultgeely.com.br",
            "senha": "renault@2026",
            "perfil": "Visualizador",
            "cargo": "Controladoria",
        },
    )
    assert criacao.status_code == 201

    login = cliente.post(
        "/api/auth/login",
        json={"email": "visualizador.teste@renaultgeely.com.br", "senha": "renault@2026"},
    ).json()
    cabecalho = {"Authorization": f"Bearer {login['access_token']}"}

    # Lê normalmente...
    assert cliente.get("/api/dashboard", headers=cabecalho).status_code == 200
    # ...mas não escreve.
    assert cliente.post("/api/importacoes/preview", headers=cabecalho, files={"arquivo": ("a.xlsx", b"x")}).status_code == 403
    assert cliente.get("/api/usuarios", headers=cabecalho).status_code == 403


def test_administrador_nao_desativa_o_proprio_usuario(cliente: TestClient, cabecalho_auth: dict, admin: dict):
    eu = cliente.get("/api/auth/eu", headers=cabecalho_auth).json()
    resposta = cliente.patch(f"/api/usuarios/{eu['id']}/status", headers=cabecalho_auth)
    assert resposta.status_code == 400


def test_filtros_de_defesa_e_processos_parados(cliente: TestClient, cabecalho_auth: dict):
    pendentes = cliente.get("/api/processos?defesa=false&por_pagina=50", headers=cabecalho_auth).json()
    assert all(item["defesa_realizada"] is False for item in pendentes["itens"])

    realizadas = cliente.get("/api/processos?defesa=true&por_pagina=50", headers=cabecalho_auth).json()
    assert all(item["defesa_realizada"] is True for item in realizadas["itens"])

    varias_faixas = cliente.get(
        "/api/processos?riscos=Alto&riscos=Crítico&por_pagina=50", headers=cabecalho_auth
    ).json()
    assert all(item["risco"] in {"Alto", "Crítico"} for item in varias_faixas["itens"])

    parados = cliente.get("/api/processos?sem_movimentacao_dias=90&por_pagina=50", headers=cabecalho_auth).json()
    assert parados["total"] <= pendentes["total"] + realizadas["total"]


def test_usuario_edita_o_proprio_perfil_e_troca_a_senha(cliente: TestClient):
    email = "autoatendimento@renaultgeely.com.br"
    cliente.post(
        "/api/auth/registrar",
        json={"nome": "Usuário Autoatendimento", "email": email, "senha": "renault@2026", "perfil": "Analista"},
    )
    login = cliente.post("/api/auth/login", json={"email": email, "senha": "renault@2026"}).json()
    cabecalho = {"Authorization": f"Bearer {login['access_token']}"}

    perfil = cliente.put(
        "/api/usuarios/eu", headers=cabecalho, json={"nome": "Nome Atualizado", "cargo": "Analista Pleno"}
    )
    assert perfil.status_code == 200
    assert perfil.json()["nome"] == "Nome Atualizado"
    assert perfil.json()["cargo"] == "Analista Pleno"

    errada = cliente.put(
        "/api/usuarios/eu/senha",
        headers=cabecalho,
        json={"senha_atual": "errada", "nova_senha": "nova@2026"},
    )
    assert errada.status_code == 400

    troca = cliente.put(
        "/api/usuarios/eu/senha",
        headers=cabecalho,
        json={"senha_atual": "renault@2026", "nova_senha": "nova@2026"},
    )
    assert troca.status_code == 200

    assert cliente.post("/api/auth/login", json={"email": email, "senha": "renault@2026"}).status_code == 401
    assert cliente.post("/api/auth/login", json={"email": email, "senha": "nova@2026"}).status_code == 200


def test_usuario_desativado_nao_consegue_entrar(cliente: TestClient, cabecalho_auth: dict):
    criacao = cliente.post(
        "/api/usuarios",
        headers=cabecalho_auth,
        json={
            "nome": "Usuário Desligado",
            "email": "desligado@renaultgeely.com.br",
            "senha": "renault@2026",
            "perfil": "Analista",
        },
    )
    assert criacao.status_code == 201
    usuario_id = criacao.json()["id"]

    assert cliente.patch(f"/api/usuarios/{usuario_id}/status", headers=cabecalho_auth).status_code == 200

    recusado = cliente.post(
        "/api/auth/login", json={"email": "desligado@renaultgeely.com.br", "senha": "renault@2026"}
    )
    assert recusado.status_code == 403
