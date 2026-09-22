"""Normalização dos valores crus vindos da planilha do escritório.

As planilhas chegam de escritórios diferentes, cada um com sua convenção:
"ativo"/"ATIVO"/"Em andamento", "R$ 1.234,56"/"1234.56", "15/03/2021"/
"2021-03-15"/número serial do Excel, "Sim"/"S"/"X" para defesa. Este módulo
concentra toda a tradução para o padrão único do banco.

Cada função devolve `(valor_normalizado, problema)`. Quando `problema` não é
None, a linha gera uma inconsistência na tela de importação.
"""

from __future__ import annotations

import re
import unicodedata
from datetime import date, datetime, timedelta

from app.models.processo import FaixaRisco, PosicaoRenault, StatusProcesso

# --------------------------------------------------------------------------
# Utilitários de texto
# --------------------------------------------------------------------------


def remover_acentos(texto: str) -> str:
    nfkd = unicodedata.normalize("NFKD", texto)
    return "".join(c for c in nfkd if not unicodedata.combining(c))


def chave(texto: object) -> str:
    """Reduz um texto à sua forma comparável: sem acento, minúsculo, sem pontuação."""
    if texto is None:
        return ""
    limpo = remover_acentos(str(texto)).lower().strip()
    return re.sub(r"[^a-z0-9]+", " ", limpo).strip()


def texto_ou_none(valor: object) -> str | None:
    if valor is None:
        return None
    texto = str(valor).strip()
    if not texto or texto.lower() in {"nan", "nat", "none", "-", "--", "n/a", "na"}:
        return None
    return texto


# --------------------------------------------------------------------------
# Mapeamento das colunas da planilha -> campos do sistema
# --------------------------------------------------------------------------

# Cada campo aceita várias grafias; a comparação é feita pela função `chave`.
MAPA_COLUNAS: dict[str, list[str]] = {
    "status": ["status", "situacao", "situacao do processo", "status do processo"],
    "autor_reu": ["autor reu", "autor/reu", "autor", "reu", "parte", "partes", "autor e reu"],
    "numero_autos": [
        "numero autos",
        "n autos",
        "numero do processo",
        "numero processo",
        "processo",
        "autos",
        "num autos",
        "numero",
        "cnj",
    ],
    "natureza": ["natureza da acao", "natureza", "tipo de acao", "materia", "area"],
    "vara": ["vara", "juizo", "orgao julgador"],
    "comarca": ["comarca", "cidade", "foro", "localidade"],
    "data_inicio": [
        "data de inicio",
        "data inicio",
        "data de distribuicao",
        "distribuicao",
        "ajuizamento",
        "data ajuizamento",
        "inicio",
    ],
    "posicao_renault": [
        "posicao da renault",
        "posicao renault",
        "posicao",
        "polo",
        "polo renault",
        "posicao da renaut",  # grafia como veio no briefing do escritório
    ],
    "resumo": ["resumo do caso", "resumo", "objeto", "descricao", "sintese"],
    "defesa": ["defesa", "defesa realizada", "defesa apresentada", "contestacao"],
    "fase_processual": ["fase processual", "fase", "estagio", "fase do processo"],
    "movimentacoes": ["movimentacoes", "movimentacao", "andamentos", "andamento", "ultimos andamentos"],
    "valor_causa": ["valor da causa", "valor causa", "vlr causa", "valor"],
    "valor_risco": [
        "valor do risco",
        "valor risco",
        "risco",
        "vlr risco",
        "provisao",
        "exposicao",
        "contingencia",
    ],
}

CAMPOS_OBRIGATORIOS = ["numero_autos", "autor_reu"]

# Rótulos amigáveis usados nas mensagens de inconsistência.
ROTULO_CAMPO: dict[str, str] = {
    "status": "Status",
    "autor_reu": "Autor/Réu",
    "numero_autos": "Número dos Autos",
    "natureza": "Natureza da ação",
    "vara": "Vara",
    "comarca": "Comarca",
    "data_inicio": "Data de início",
    "posicao_renault": "Posição da Renault",
    "resumo": "Resumo do caso",
    "defesa": "Defesa",
    "fase_processual": "Fase processual",
    "movimentacoes": "Movimentações",
    "valor_causa": "Valor da causa",
    "valor_risco": "Valor do risco",
}


def mapear_colunas(colunas: list[str]) -> tuple[dict[str, str], list[str]]:
    """Casa os cabeçalhos do arquivo com os campos do sistema.

    Retorna (mapa {campo_sistema: coluna_original}, campos obrigatórios ausentes).
    """
    mapa: dict[str, str] = {}
    usadas: set[str] = set()

    for campo, aliases in MAPA_COLUNAS.items():
        aliases_norm = {chave(a) for a in aliases}
        # 1ª passada: casamento exato
        for coluna in colunas:
            if coluna in usadas:
                continue
            if chave(coluna) in aliases_norm:
                mapa[campo] = coluna
                usadas.add(coluna)
                break
        # 2ª passada: casamento por conteúdo ("valor da causa (R$)")
        if campo not in mapa:
            for coluna in colunas:
                if coluna in usadas:
                    continue
                k = chave(coluna)
                if any(alias in k or k in alias for alias in aliases_norm if len(alias) > 3):
                    mapa[campo] = coluna
                    usadas.add(coluna)
                    break

    ausentes = [ROTULO_CAMPO[c] for c in CAMPOS_OBRIGATORIOS if c not in mapa]
    return mapa, ausentes


# --------------------------------------------------------------------------
# Normalizadores de valor
# --------------------------------------------------------------------------

_NUMERO_CNJ = re.compile(r"\d{7}-?\d{2}\.?\d{4}\.?\d\.?\d{2}\.?\d{4}")


def normalizar_numero_autos(valor: object) -> tuple[str | None, str | None]:
    texto = texto_ou_none(valor)
    if not texto:
        return None, "Número de processo ausente"
    texto = re.sub(r"\s+", "", texto)
    if not re.search(r"\d", texto):
        return None, "Número de processo sem dígitos"
    # Reaplica a máscara CNJ quando vier só com dígitos (20 caracteres).
    somente_digitos = re.sub(r"\D", "", texto)
    if len(somente_digitos) == 20 and not re.search(r"[-.]", texto):
        d = somente_digitos
        texto = f"{d[0:7]}-{d[7:9]}.{d[9:13]}.{d[13]}.{d[14:16]}.{d[16:20]}"
    return texto, None


def normalizar_status(valor: object) -> tuple[str, str | None]:
    k = chave(valor)
    if not k:
        return StatusProcesso.ATIVO, "Status não informado — assumido Ativo"
    if k in {"ativo", "ativa", "em andamento", "andamento", "aberto", "em curso", "1", "sim"}:
        return StatusProcesso.ATIVO, None
    if k in {"inativo", "inativa", "encerrado", "encerrada", "arquivado", "baixado", "finalizado", "0", "nao"}:
        return StatusProcesso.INATIVO, None
    return StatusProcesso.ATIVO, f"Status desconhecido ('{valor}') — assumido Ativo"


NATUREZAS_PADRAO = {
    "trabalhista": "Trabalhista",
    "trabalho": "Trabalhista",
    "civel": "Cível",
    "civil": "Cível",
    "consumidor": "Consumidor",
    "consumerista": "Consumidor",
    "cdc": "Consumidor",
    "tributario": "Tributário",
    "fiscal": "Tributário",
    "tributaria": "Tributário",
    "contratual": "Contratual",
    "contrato": "Contratual",
    "comercial": "Contratual",
    "administrativo": "Administrativo",
    "ambiental": "Administrativo",
    "regulatorio": "Administrativo",
}


def normalizar_natureza(valor: object) -> tuple[str, str | None]:
    k = chave(valor)
    if not k:
        return "Outros", "Natureza da ação não informada"
    for termo, padrao in NATUREZAS_PADRAO.items():
        if termo in k:
            return padrao, None
    return "Outros", f"Natureza não reconhecida ('{valor}') — classificada como Outros"


FASES_PADRAO = {
    "conhecimento": "Conhecimento",
    "instrucao": "Conhecimento",
    "inicial": "Conhecimento",
    "recurso": "Recurso",
    "recursal": "Recurso",
    "apelacao": "Recurso",
    "cumprimento": "Cumprimento de sentença",
    "cumprimento de sentenca": "Cumprimento de sentença",
    "execucao": "Execução",
    "executivo": "Execução",
    "encerrado": "Encerrado",
    "arquivado": "Encerrado",
    "baixado": "Encerrado",
    "transitado": "Encerrado",
}


def normalizar_fase(valor: object) -> tuple[str, str | None]:
    k = chave(valor)
    if not k:
        return "Outros", "Fase processual não informada"
    # "cumprimento" antes de "execucao": cumprimento de sentença também é execução.
    for termo in ("cumprimento de sentenca", "cumprimento"):
        if termo in k:
            return "Cumprimento de sentença", None
    for termo, padrao in FASES_PADRAO.items():
        if termo in k:
            return padrao, None
    return "Outros", f"Fase processual não reconhecida ('{valor}')"


def normalizar_posicao(valor: object) -> tuple[str, str | None]:
    k = chave(valor)
    if not k:
        return PosicaoRenault.POLO_PASSIVO, "Posição da Renault não informada — assumido Polo Passivo"
    if "passiv" in k or k in {"re", "reu", "requerida", "requerido", "executada"}:
        return PosicaoRenault.POLO_PASSIVO, None
    if "ativ" in k or k in {"autora", "autor", "requerente", "exequente"}:
        return PosicaoRenault.POLO_ATIVO, None
    return PosicaoRenault.POLO_PASSIVO, f"Posição não reconhecida ('{valor}') — assumido Polo Passivo"


def normalizar_defesa(valor: object) -> tuple[bool, str | None]:
    k = chave(valor)
    if not k:
        return False, "Defesa não informada — assumido Não realizada"
    if k in {"sim", "s", "x", "realizada", "apresentada", "true", "1", "ok", "sim realizada"}:
        return True, None
    if k in {"nao", "n", "false", "0", "pendente", "nao realizada", "nao apresentada", "-"}:
        return False, None
    return False, f"Valor de defesa não reconhecido ('{valor}') — assumido Não"


def normalizar_valor(valor: object, rotulo: str) -> tuple[float, str | None]:
    """Converte moeda em formato brasileiro ou americano para float."""
    if valor is None:
        return 0.0, f"{rotulo} não informado"
    if isinstance(valor, (int, float)) and not isinstance(valor, bool):
        numero = float(valor)
        if numero != numero:  # NaN
            return 0.0, f"{rotulo} não informado"
        if numero < 0:
            return 0.0, f"{rotulo} negativo ('{valor}')"
        return round(numero, 2), None

    texto = texto_ou_none(valor)
    if not texto:
        return 0.0, f"{rotulo} não informado"

    limpo = texto.upper().replace("R$", "").replace("REAIS", "").strip()
    limpo = re.sub(r"[^\d,.\-]", "", limpo)
    if not limpo or limpo in {"-", ",", "."}:
        return 0.0, f"{rotulo} inválido ('{texto}')"

    tem_ponto, tem_virgula = "." in limpo, "," in limpo
    if tem_ponto and tem_virgula:
        # O separador que aparece por último é o decimal.
        if limpo.rfind(",") > limpo.rfind("."):
            limpo = limpo.replace(".", "").replace(",", ".")
        else:
            limpo = limpo.replace(",", "")
    elif tem_virgula:
        partes = limpo.split(",")
        # "1.234,56" -> decimal; "1,234" com 3 dígitos -> milhar
        limpo = limpo.replace(",", "") if len(partes[-1]) == 3 and len(partes) > 1 else limpo.replace(",", ".")
    elif tem_ponto:
        partes = limpo.split(".")
        if len(partes) > 2 or (len(partes) == 2 and len(partes[-1]) == 3):
            limpo = limpo.replace(".", "")

    try:
        numero = float(limpo)
    except ValueError:
        return 0.0, f"{rotulo} inválido ('{texto}')"

    if numero < 0:
        return 0.0, f"{rotulo} negativo ('{texto}')"
    return round(numero, 2), None


_FORMATOS_DATA = ("%d/%m/%Y", "%d-%m-%Y", "%Y-%m-%d", "%d/%m/%y", "%Y/%m/%d", "%d.%m.%Y")
_EPOCA_EXCEL = datetime(1899, 12, 30)


def normalizar_data(valor: object, rotulo: str = "Data de início") -> tuple[date | None, str | None]:
    if valor is None:
        return None, f"{rotulo} não informada"
    if isinstance(valor, datetime):
        return valor.date(), None
    if isinstance(valor, date):
        return valor, None
    # Número serial do Excel
    if isinstance(valor, (int, float)) and not isinstance(valor, bool):
        if valor != valor:  # NaN
            return None, f"{rotulo} não informada"
        if 1 <= float(valor) <= 80_000:
            return (_EPOCA_EXCEL + timedelta(days=float(valor))).date(), None
        return None, f"{rotulo} inválida ('{valor}')"

    texto = texto_ou_none(valor)
    if not texto:
        return None, f"{rotulo} não informada"
    texto = texto.split(" ")[0].strip()
    for formato in _FORMATOS_DATA:
        try:
            return datetime.strptime(texto, formato).date(), None
        except ValueError:
            continue
    return None, f"{rotulo} inválida ('{texto}')"


# --------------------------------------------------------------------------
# Movimentações
# --------------------------------------------------------------------------

TIPOS_MOVIMENTACAO = {
    "audiencia": "audiencia",
    "audiência": "audiencia",
    "despacho": "despacho",
    "decisao": "despacho",
    "recurso": "recurso",
    "apelacao": "recurso",
    "agravo": "recurso",
    "sentenca": "sentenca",
    "acordao": "sentenca",
    "acordo": "sentenca",
    "citacao": "citacao",
    "intimacao": "citacao",
    "notificacao": "citacao",
    "penhora": "outros",
    "pericia": "outros",
}

_DATA_NO_TEXTO = re.compile(r"(\d{2}[/-]\d{2}[/-]\d{4}|\d{4}-\d{2}-\d{2})")


def classificar_movimentacao(descricao: str) -> str:
    k = chave(descricao)
    for termo, tipo in TIPOS_MOVIMENTACAO.items():
        if chave(termo) in k:
            return tipo
    return "outros"


def extrair_movimentacoes(valor: object) -> list[dict]:
    """Quebra a coluna "Movimentações" em itens individuais.

    Aceita separação por quebra de linha, ponto-e-vírgula ou marcador. Quando a
    linha começa com uma data, ela vira a data da movimentação.
    """
    texto = texto_ou_none(valor)
    if not texto:
        return []

    # Quebra por linha, ponto-e-vírgula, barra vertical ou marcador no início
    # da linha. Um hífen no meio da frase NÃO separa — em "15/12/2024 - Despacho"
    # ele apenas liga a data à descrição.
    bruto = re.split(r"[\n\r;]+|(?:\s\|\s)|(?m:^\s*[-•*]\s+)", texto)
    itens: list[dict] = []
    for parte in bruto:
        descricao = parte.strip(" -•*\t")
        if len(descricao) < 4:
            continue
        data_encontrada = None
        achou = _DATA_NO_TEXTO.search(descricao)
        if achou:
            data_encontrada, _ = normalizar_data(achou.group(1))
        itens.append(
            {
                "data": data_encontrada,
                "tipo": classificar_movimentacao(descricao),
                "descricao": descricao[:2000],
            }
        )
    return itens


# --------------------------------------------------------------------------
# Faixa de risco
# --------------------------------------------------------------------------

_ORDEM_RISCO = [FaixaRisco.BAIXO, FaixaRisco.MEDIO, FaixaRisco.ALTO, FaixaRisco.CRITICO]


def calcular_risco(
    valor_risco: float,
    *,
    status: str,
    defesa_realizada: bool,
    critico_min: float,
    alto_min: float,
    medio_min: float,
    agrava_sem_defesa: bool = True,
) -> str:
    """Classifica a exposição do processo em uma faixa de risco.

    Regra: faixa base pelo valor do risco; processo ATIVO sem defesa registrada
    sobe uma faixa (o prazo perdido é, por si só, um agravante).
    """
    if valor_risco >= critico_min:
        faixa = FaixaRisco.CRITICO
    elif valor_risco >= alto_min:
        faixa = FaixaRisco.ALTO
    elif valor_risco >= medio_min:
        faixa = FaixaRisco.MEDIO
    else:
        faixa = FaixaRisco.BAIXO

    if agrava_sem_defesa and status == StatusProcesso.ATIVO and not defesa_realizada:
        indice = _ORDEM_RISCO.index(faixa)
        faixa = _ORDEM_RISCO[min(indice + 1, len(_ORDEM_RISCO) - 1)]

    return faixa
