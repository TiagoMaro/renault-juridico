"""Carga inicial: usuários padrão + planilha de exemplo importada de verdade.

Rode com:  python -m app.seed

A planilha gerada (docs/planilha-modelo.xlsx) sai no mesmo formato que os
escritórios enviam — inclusive com algumas linhas propositalmente
problemáticas, para exercitar a tela de inconsistências.
"""

from __future__ import annotations

import random
from datetime import date, timedelta
from pathlib import Path

import pandas as pd
from sqlalchemy import select

from app.core.database import SessionLocal, criar_tabelas
from app.core.security import gerar_hash_senha
from app.models.importacao import Importacao
from app.models.processo import Processo
from app.models.usuario import PerfilAcesso, Usuario
from app.services.planilha import importar

RAIZ = Path(__file__).resolve().parents[2]
DESTINO_PLANILHA = RAIZ / "docs" / "planilha-modelo.xlsx"

USUARIOS_PADRAO = [
    ("Ana Costa", "ana.costa@renaultgeely.com.br", "Gerente Jurídica", PerfilAcesso.ADMINISTRADOR, "renault@2026"),
    ("Pedro Alves", "pedro.alves@renaultgeely.com.br", "Coordenador de Contencioso", PerfilAcesso.GESTOR, "renault@2026"),
    ("Carlos Lima", "carlos.lima@renaultgeely.com.br", "Analista Jurídico", PerfilAcesso.ANALISTA, "renault@2026"),
    ("Fernanda Rocha", "fernanda.rocha@renaultgeely.com.br", "Analista Jurídica", PerfilAcesso.ANALISTA, "renault@2026"),
    ("Ricardo Mendes", "ricardo.mendes@renaultgeely.com.br", "Controladoria", PerfilAcesso.VISUALIZADOR, "renault@2026"),
]

ESCRITORIOS = [
    "Souza & Rodrigues Advogados",
    "Martins, Costa e Lima Advogados",
    "Pereira Neto Advocacia",
    "BM&A Advogados",
    "Trench Rossi e Watanabe",
]

COMARCAS_VARAS = {
    "Curitiba": ["3ª Vara do Trabalho", "2ª Vara do Trabalho", "4ª Vara Cível", "1ª Vara Empresarial"],
    "São José dos Pinhais": ["1ª Vara do Trabalho", "2ª Vara Cível"],
    "São Paulo": ["5ª Vara Cível", "2ª Vara do Consumidor", "10ª Vara Cível", "2ª Vara Empresarial"],
    "Rio de Janeiro": ["5ª Vara de Fazenda Pública", "18ª Vara Federal"],
    "Belo Horizonte": ["3ª Vara de Fazenda Pública", "7ª Vara Cível"],
    "Campinas": ["2ª Vara do Trabalho", "4ª Vara Cível"],
    "Porto Alegre": ["3ª Vara Cível", "1ª Vara do Trabalho"],
}

NOMES = [
    "João Carlos Mendes", "Maria Aparecida Silva", "Pedro Augusto Ferreira", "Gabriela Martins Costa",
    "Carlos Eduardo Lima", "Roberto Santos Oliveira", "Fernanda Cristina Alves", "Marcos Antonio Pereira",
    "Ana Paula Rodrigues", "Pedro Henrique Sousa", "Cristiane Oliveira Lima", "Diego Fernando Nascimento",
    "Tatiana Moreira Santos", "Gustavo Henrique Pimentel", "Juliana Ribeiro Campos", "Rafael Augusto Dias",
    "Patrícia Gomes Barbosa", "Luiz Fernando Teixeira", "Camila Andrade Pinto", "Bruno César Machado",
]

EMPRESAS = [
    "Auto Peças Dinâmica Ltda", "Distribuidora Paulista de Automóveis SA", "Superposto Veículos SA",
    "Banco Itaú Unibanco SA", "Transportadora Rodoexpress Ltda", "Metalúrgica Paraná Componentes Ltda",
]

ORGAOS = [
    "União Federal vs Renault Geely Brasil Ltda",
    "Fazenda Nacional vs Renault Geely Brasil Ltda",
    "Secretaria da Fazenda de Minas Gerais vs Renault",
    "Renault Geely Brasil vs Estado do Rio de Janeiro",
    "Prefeitura Municipal de Curitiba",
]

NATUREZAS = ["Trabalhista", "Cível", "Consumidor", "Tributário", "Contratual", "Administrativo"]
FASES = ["Conhecimento", "Recurso", "Execução", "Cumprimento de sentença", "Encerrado"]

RESUMOS = {
    "Trabalhista": [
        "Ex-funcionário pleiteia verbas rescisórias, horas extras não remuneradas e danos morais após demissão sem justa causa.",
        "Reclamação com pedido de adicional de insalubridade referente ao período na área de pintura da fábrica.",
        "Pedido de reconhecimento de vínculo empregatício de período prestado como autônomo, com FGTS e verbas rescisórias.",
        "Reclamação coletiva de ex-funcionários demitidos na reestruturação, alegando dispensa discriminatória.",
    ],
    "Cível": [
        "Ação indenizatória decorrente de acidente de trânsito envolvendo veículo da frota da empresa.",
        "Ação de reparação de danos por acidente ocorrido nas dependências da planta industrial.",
        "Disputa contratual referente a financiamento de estoque da rede de concessionárias.",
    ],
    "Consumidor": [
        "Consumidor alega vício oculto em veículo adquirido, com defeito recorrente não sanado em garantia.",
        "Ação de indenização por negativa de cobertura de garantia de fábrica considerada indevida.",
        "Ação coletiva de consorciados questionando condições de contemplação e reajuste de parcelas.",
    ],
    "Tributário": [
        "Ação anulatória de lançamento fiscal referente a ICMS sobre operações de importação de insumos.",
        "Execução fiscal por suposta irregularidade no recolhimento de ICMS-ST em vendas a concessionárias.",
        "Execução fiscal federal sobre IPI de veículos exportados e exclusão de incentivos da base de cálculo.",
    ],
    "Contratual": [
        "Fornecedor requer indenização por rescisão de contrato de fornecimento exclusivo considerada imotivada.",
        "Ação de cobrança contra ex-concessionária com passivo de estoque e financiamento de peças.",
        "Ação de rescisão de contrato de concessão por descumprimento de metas e padrões de qualidade.",
    ],
    "Administrativo": [
        "Ação civil pública ambiental sobre descarte de resíduos industriais na planta de São José dos Pinhais.",
        "Ação de obrigação de fazer para regularização de licença de operação de unidade de distribuição.",
    ],
}

MOVIMENTACOES_MODELO = [
    "{data} - Despacho: vista à parte contrária para manifestação no prazo legal.",
    "{data} - Audiência de instrução e julgamento realizada. Ouvidas as testemunhas.",
    "{data} - Recurso ordinário interposto pela reclamada em face da sentença.",
    "{data} - Sentença proferida. Condenação parcial da empresa.",
    "{data} - Citação realizada. Prazo de defesa iniciado.",
    "{data} - Juntada de documentos pela defesa (folhas de ponto e controles de jornada).",
    "{data} - Perícia técnica designada pelo juízo.",
    "{data} - Acordo homologado em audiência de conciliação. Processo encerrado.",
]


def gerar_linhas(quantidade: int = 60, semente: int = 20260919) -> list[dict]:
    """Gera linhas no formato exato da planilha enviada pelos escritórios."""
    rng = random.Random(semente)
    hoje = date.today()
    linhas: list[dict] = []

    for indice in range(quantidade):
        natureza = rng.choices(NATUREZAS, weights=[38, 24, 15, 11, 8, 4])[0]
        comarca = rng.choice(list(COMARCAS_VARAS))
        vara = rng.choice(COMARCAS_VARAS[comarca])

        if natureza == "Tributário" or (natureza == "Administrativo" and rng.random() < 0.6):
            parte = rng.choice(ORGAOS)
        elif natureza == "Contratual":
            parte = rng.choice(EMPRESAS)
        else:
            parte = rng.choice(NOMES)

        data_inicio = hoje - timedelta(days=rng.randint(120, 2100))
        fase = rng.choices(FASES, weights=[36, 24, 16, 12, 12])[0]
        encerrado = fase == "Encerrado"
        status = "Inativo" if encerrado else "Ativo"

        # Faixas de valor por natureza — tributário e coletivo puxam os extremos.
        if natureza == "Tributário":
            valor_causa = rng.randint(800_000, 14_000_000)
        elif natureza == "Trabalhista":
            valor_causa = rng.randint(45_000, 3_200_000)
        elif natureza == "Administrativo":
            valor_causa = rng.randint(150_000, 2_400_000)
        else:
            valor_causa = rng.randint(20_000, 900_000)

        proporcao = rng.uniform(0.08, 0.45)
        valor_risco = 0 if encerrado else round(valor_causa * proporcao, 2)

        posicao = "ativo" if rng.random() < 0.18 else "passivo"
        defesa = "Não" if (not encerrado and rng.random() < 0.14) else "Sim"

        quantidade_mov = rng.randint(1, 4)
        movimentacoes = []
        data_mov = hoje - timedelta(days=rng.randint(5, 420))
        for _ in range(quantidade_mov):
            modelo = rng.choice(MOVIMENTACOES_MODELO)
            movimentacoes.append(modelo.format(data=data_mov.strftime("%d/%m/%Y")))
            data_mov -= timedelta(days=rng.randint(25, 160))

        ano = data_inicio.year
        justica = "5" if natureza == "Trabalhista" else "8"
        numero = (
            f"{indice + 1:07d}-{rng.randint(10, 99)}.{ano}.{justica}."
            f"{rng.randint(10, 26):02d}.{rng.randint(1, 9999):04d}"
        )

        linhas.append(
            {
                "Status": status,
                "Autor/Réu": parte,
                "Número Autos": numero,
                "Natureza da ação": natureza,
                "Vara": vara,
                "Comarca": comarca,
                "Data de início": data_inicio.strftime("%d/%m/%Y"),
                "Posição da Renault": posicao,
                "Resumo do caso": rng.choice(RESUMOS[natureza]),
                "Defesa": defesa,
                "Fase processual": fase,
                "Movimentações": "\n".join(movimentacoes),
                "Valor da causa": f"R$ {valor_causa:,.2f}".replace(",", "X").replace(".", ",").replace("X", "."),
                "Valor do risco": f"R$ {valor_risco:,.2f}".replace(",", "X").replace(".", ",").replace("X", "."),
            }
        )

    # --- Linhas problemáticas de propósito (exercitam as inconsistências) ---
    linhas.extend(
        [
            {  # valor da causa ilegível
                "Status": "Ativo",
                "Autor/Réu": "Sandra Regina Vieira",
                "Número Autos": "0000901-45.2023.5.09.0012",
                "Natureza da ação": "Trabalhista",
                "Vara": "2ª Vara do Trabalho",
                "Comarca": "Curitiba",
                "Data de início": "14/02/2023",
                "Posição da Renault": "passivo",
                "Resumo do caso": "Pedido de horas extras e intervalo intrajornada.",
                "Defesa": "Sim",
                "Fase processual": "Conhecimento",
                "Movimentações": "10/08/2025 - Audiência de conciliação designada.",
                "Valor da causa": "a confirmar",
                "Valor do risco": "R$ 42.000,00",
            },
            {  # data inválida + fase desconhecida
                "Status": "Ativo",
                "Autor/Réu": "Comercial de Peças Horizonte Ltda",
                "Número Autos": "0000902-77.2022.8.16.0001",
                "Natureza da ação": "Contratual",
                "Vara": "1ª Vara Empresarial",
                "Comarca": "Curitiba",
                "Data de início": "31/31/2022",
                "Posição da Renault": "ativo",
                "Resumo do caso": "Cobrança de valores de fornecimento não pagos.",
                "Defesa": "Sim",
                "Fase processual": "aguardando definição",
                "Movimentações": "02/09/2025 - Juntada de contrato pelas partes.",
                "Valor da causa": "R$ 310.000,00",
                "Valor do risco": "R$ 96.000,00",
            },
            {  # status desconhecido + defesa em branco
                "Status": "em análise",
                "Autor/Réu": "Marcelo Tadeu Fonseca",
                "Número Autos": "0000903-19.2024.8.26.0100",
                "Natureza da ação": "Consumidor",
                "Vara": "3ª Vara do Consumidor",
                "Comarca": "São Paulo",
                "Data de início": "05/05/2024",
                "Posição da Renault": "passivo",
                "Resumo do caso": "Reclamação sobre defeito em sistema elétrico do veículo.",
                "Defesa": "",
                "Fase processual": "Conhecimento",
                "Movimentações": "20/07/2025 - Contestação apresentada.",
                "Valor da causa": "R$ 68.000,00",
                "Valor do risco": "R$ 25.000,00",
            },
            {  # risco maior que a causa
                "Status": "Ativo",
                "Autor/Réu": "Sindicato dos Metalúrgicos — ação coletiva",
                "Número Autos": "0000904-52.2021.5.09.0003",
                "Natureza da ação": "Trabalhista",
                "Vara": "1ª Vara do Trabalho",
                "Comarca": "São José dos Pinhais",
                "Data de início": "18/06/2021",
                "Posição da Renault": "passivo",
                "Resumo do caso": "Ação coletiva sobre adicional de periculosidade da linha de montagem.",
                "Defesa": "Sim",
                "Fase processual": "Recurso",
                "Movimentações": "12/09/2025 - Acórdão publicado. Embargos de declaração opostos.",
                "Valor da causa": "R$ 900.000,00",
                "Valor do risco": "R$ 1.250.000,00",
            },
            {  # sem número de autos -> linha descartada
                "Status": "Ativo",
                "Autor/Réu": "Processo sem número informado",
                "Número Autos": "",
                "Natureza da ação": "Cível",
                "Vara": "4ª Vara Cível",
                "Comarca": "Curitiba",
                "Data de início": "01/03/2024",
                "Posição da Renault": "passivo",
                "Resumo do caso": "Registro incompleto enviado pelo escritório.",
                "Defesa": "Não",
                "Fase processual": "Conhecimento",
                "Movimentações": "",
                "Valor da causa": "R$ 50.000,00",
                "Valor do risco": "R$ 12.000,00",
            },
        ]
    )
    return linhas


def gerar_planilha_modelo(destino: Path = DESTINO_PLANILHA, quantidade: int = 60) -> Path:
    destino.parent.mkdir(parents=True, exist_ok=True)
    df = pd.DataFrame(gerar_linhas(quantidade))
    with pd.ExcelWriter(destino, engine="xlsxwriter") as writer:
        df.to_excel(writer, index=False, sheet_name="Processos")
        planilha = writer.sheets["Processos"]
        for posicao, coluna in enumerate(df.columns):
            largura = 42 if coluna in {"Resumo do caso", "Movimentações"} else 22
            planilha.set_column(posicao, posicao, largura)
    return destino


def criar_usuarios(db) -> None:
    for nome, email, cargo, perfil, senha in USUARIOS_PADRAO:
        if db.scalar(select(Usuario).where(Usuario.email == email)):
            continue
        db.add(
            Usuario(
                nome=nome,
                email=email,
                senha_hash=gerar_hash_senha(senha),
                cargo=cargo,
                perfil=perfil,
                ativo=True,
            )
        )
    db.commit()


def executar(quantidade: int = 60, importar_planilha: bool = True) -> None:
    criar_tabelas()
    caminho = gerar_planilha_modelo(quantidade=quantidade)
    print(f"Planilha de exemplo gerada em: {caminho}")

    with SessionLocal() as db:
        criar_usuarios(db)
        print(f"Usuários padrão: {len(USUARIOS_PADRAO)} (senha de todos: renault@2026)")

        if not importar_planilha:
            return

        if db.scalar(select(Importacao).limit(1)):
            total = db.scalar(select(Processo).limit(1))
            if total:
                print("Banco já possui dados importados — seed não repetiu a importação.")
                return

        admin = db.scalar(select(Usuario).where(Usuario.perfil == PerfilAcesso.ADMINISTRADOR))
        importacao, _etapas = importar(
            db,
            caminho.read_bytes(),
            "planilha_escritorios_exemplo.xlsx",
            "Souza & Rodrigues Advogados",
            admin,
        )
        print(
            f"Importação concluída: {importacao.registros_validos} registros válidos, "
            f"{importacao.criados} criados, {importacao.total_inconsistencias} inconsistências."
        )


if __name__ == "__main__":
    executar()
