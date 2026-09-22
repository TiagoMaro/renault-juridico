"""Motor de importação: lê a planilha, normaliza, detecta inconsistências e grava.

Fluxo (as 7 etapas exibidas na tela de importação):
    1. Arquivo recebido
    2. Validação das colunas
    3. Leitura dos processos
    4. Padronização dos dados
    5. Identificação de inconsistências
    6. Consolidação dos indicadores
    7. Dashboard atualizado
"""

from __future__ import annotations

import time
from dataclasses import dataclass, field
from datetime import datetime, timezone

import pandas as pd
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.importacao import Importacao, Inconsistencia, StatusImportacao
from app.models.processo import HistoricoAlteracao, Movimentacao, Processo
from app.models.usuario import Usuario
from app.services import normalizacao as norm
from app.services.auditoria import CAMPOS_AUDITADOS, formatar_para_historico
from app.services.leitura import PlanilhaInvalida, ler_aba

# Todos os nomes de coluna que o detector de cabeçalho deve procurar.
ALIASES_PROCESSOS = {norm.chave(a) for aliases in norm.MAPA_COLUNAS.values() for a in aliases}

@dataclass
class LinhaProcessada:
    linha: int
    dados: dict
    movimentacoes: list[dict]
    problemas: list[tuple[str, str, str | None]] = field(default_factory=list)  # (campo, problema, valor)
    descartada: bool = False


def _valor(linha: pd.Series, mapa: dict[str, str], campo: str):
    coluna = mapa.get(campo)
    if coluna is None:
        return None
    valor = linha.get(coluna)
    if valor is None or (isinstance(valor, float) and valor != valor):
        return None
    return valor


# --------------------------------------------------------------------------
# Padronização linha a linha
# --------------------------------------------------------------------------


def processar_linhas(df: pd.DataFrame, mapa: dict[str, str], escritorio: str | None) -> list[LinhaProcessada]:
    resultados: list[LinhaProcessada] = []

    for indice, linha in df.iterrows():
        # +2 = cabeçalho (1) + índice base zero, para bater com a linha do Excel.
        # O leitor devolve o índice já como o número da linha na planilha.
        numero_linha = int(indice) if isinstance(indice, (int, float)) else len(resultados) + 2
        problemas: list[tuple[str, str, str | None]] = []

        numero_autos, erro = norm.normalizar_numero_autos(_valor(linha, mapa, "numero_autos"))
        if erro:
            problemas.append(("Número dos Autos", erro, norm.texto_ou_none(_valor(linha, mapa, "numero_autos"))))

        autor_reu = norm.texto_ou_none(_valor(linha, mapa, "autor_reu"))
        if not autor_reu:
            problemas.append(("Autor/Réu", "Autor/Réu não informado", None))

        # Linha sem identificação mínima não entra no banco.
        if not numero_autos or not autor_reu:
            resultados.append(
                LinhaProcessada(linha=numero_linha, dados={}, movimentacoes=[], problemas=problemas, descartada=True)
            )
            continue

        status, erro = norm.normalizar_status(_valor(linha, mapa, "status"))
        if erro:
            problemas.append(("Status", erro, norm.texto_ou_none(_valor(linha, mapa, "status"))))

        natureza, erro = norm.normalizar_natureza(_valor(linha, mapa, "natureza"))
        if erro:
            problemas.append(("Natureza da ação", erro, norm.texto_ou_none(_valor(linha, mapa, "natureza"))))

        fase, erro = norm.normalizar_fase(_valor(linha, mapa, "fase_processual"))
        if erro:
            problemas.append(
                ("Fase processual", erro, norm.texto_ou_none(_valor(linha, mapa, "fase_processual")))
            )

        posicao, erro = norm.normalizar_posicao(_valor(linha, mapa, "posicao_renault"))
        if erro:
            problemas.append(
                ("Posição da Renault", erro, norm.texto_ou_none(_valor(linha, mapa, "posicao_renault")))
            )

        defesa, erro = norm.normalizar_defesa(_valor(linha, mapa, "defesa"))
        if erro:
            problemas.append(("Defesa", erro, norm.texto_ou_none(_valor(linha, mapa, "defesa"))))

        data_inicio, erro = norm.normalizar_data(_valor(linha, mapa, "data_inicio"))
        if erro:
            problemas.append(("Data de início", erro, norm.texto_ou_none(_valor(linha, mapa, "data_inicio"))))

        valor_causa, erro = norm.normalizar_valor(_valor(linha, mapa, "valor_causa"), "Valor da causa")
        if erro:
            problemas.append(("Valor da causa", erro, norm.texto_ou_none(_valor(linha, mapa, "valor_causa"))))

        valor_risco, erro = norm.normalizar_valor(_valor(linha, mapa, "valor_risco"), "Valor do risco")
        if erro:
            problemas.append(("Valor do risco", erro, norm.texto_ou_none(_valor(linha, mapa, "valor_risco"))))

        # Coerência entre os dois valores financeiros.
        if valor_risco > valor_causa > 0:
            problemas.append(
                (
                    "Valor do risco",
                    "Valor do risco maior que o valor da causa — revisar com o escritório",
                    f"{valor_risco:.2f} > {valor_causa:.2f}",
                )
            )

        movimentacoes_texto = norm.texto_ou_none(_valor(linha, mapa, "movimentacoes"))
        movimentacoes = norm.extrair_movimentacoes(movimentacoes_texto)
        datas_mov = [m["data"] for m in movimentacoes if m["data"]]
        ultima_movimentacao = max(datas_mov) if datas_mov else None

        risco = norm.calcular_risco(
            valor_risco,
            status=status,
            defesa_realizada=defesa,
            critico_min=settings.RISCO_CRITICO_MIN,
            alto_min=settings.RISCO_ALTO_MIN,
            medio_min=settings.RISCO_MEDIO_MIN,
            agrava_sem_defesa=settings.RISCO_AGRAVA_SEM_DEFESA,
        )

        dados = {
            "numero_autos": numero_autos,
            "status": status,
            "autor_reu": autor_reu,
            "natureza": natureza,
            "vara": norm.texto_ou_none(_valor(linha, mapa, "vara")),
            "comarca": norm.texto_ou_none(_valor(linha, mapa, "comarca")),
            "data_inicio": data_inicio,
            "posicao_renault": posicao,
            "resumo": norm.texto_ou_none(_valor(linha, mapa, "resumo")),
            "defesa_realizada": defesa,
            "fase_processual": fase,
            "movimentacoes_texto": movimentacoes_texto,
            "valor_causa": valor_causa,
            "valor_risco": valor_risco,
            "risco": risco,
            "escritorio": escritorio,
            "ultima_movimentacao": ultima_movimentacao,
        }

        resultados.append(
            LinhaProcessada(
                linha=numero_linha, dados=dados, movimentacoes=movimentacoes, problemas=problemas
            )
        )

    return resultados


# --------------------------------------------------------------------------
# Persistência
# --------------------------------------------------------------------------

def gravar_resultados(
    db: Session,
    linhas: list[LinhaProcessada],
    importacao: Importacao,
    usuario: Usuario | None,
) -> tuple[int, int]:
    """Faz o upsert dos processos por Número dos Autos.

    Processo novo é criado; processo existente é atualizado e cada campo
    relevante que mudou vira um registro no histórico de alterações.
    """
    criados = atualizados = 0
    numeros = [linha.dados["numero_autos"] for linha in linhas if not linha.descartada]
    existentes = {
        p.numero_autos: p
        for p in db.query(Processo).filter(Processo.numero_autos.in_(numeros)).all()
    }

    for item in linhas:
        if item.descartada:
            continue
        dados = item.dados
        processo = existentes.get(dados["numero_autos"])

        if processo is None:
            processo = Processo(**dados, importacao_id=importacao.id)
            db.add(processo)
            db.flush()
            criados += 1
            for mov in item.movimentacoes:
                db.add(Movimentacao(processo_id=processo.id, **mov))
        else:
            mudou = False
            for campo, valor_novo in dados.items():
                valor_atual = getattr(processo, campo)
                if campo in {"valor_causa", "valor_risco"}:
                    iguais = abs(float(valor_atual or 0) - float(valor_novo or 0)) < 0.01
                else:
                    iguais = valor_atual == valor_novo
                if iguais or valor_novo is None:
                    continue
                if campo in CAMPOS_AUDITADOS:
                    db.add(
                        HistoricoAlteracao(
                            processo_id=processo.id,
                            usuario_id=usuario.id if usuario else None,
                            usuario_nome=usuario.nome if usuario else "Importação automática",
                            campo=CAMPOS_AUDITADOS[campo],
                            valor_anterior=formatar_para_historico(campo, valor_atual),
                            valor_novo=formatar_para_historico(campo, valor_novo),
                            origem="importacao",
                        )
                    )
                setattr(processo, campo, valor_novo)
                mudou = True

            # Regrava as movimentações quando a planilha trouxe informação nova.
            if item.movimentacoes:
                descricoes_atuais = {m.descricao for m in processo.movimentacoes}
                for mov in item.movimentacoes:
                    if mov["descricao"] not in descricoes_atuais:
                        db.add(Movimentacao(processo_id=processo.id, **mov))
                        mudou = True

            processo.importacao_id = importacao.id
            if mudou:
                atualizados += 1

    return criados, atualizados


# --------------------------------------------------------------------------
# Orquestração
# --------------------------------------------------------------------------


def importar(
    db: Session,
    conteudo: bytes,
    nome_arquivo: str,
    escritorio: str | None,
    usuario: Usuario | None,
) -> tuple[Importacao, list[dict]]:
    """Executa a importação completa e devolve (importação, etapas)."""
    inicio = time.perf_counter()
    etapas: list[dict] = []

    importacao = Importacao(
        arquivo=nome_arquivo,
        escritorio=escritorio,
        usuario_id=usuario.id if usuario else None,
        usuario_nome=usuario.nome if usuario else None,
        status=StatusImportacao.PROCESSANDO,
        data=datetime.now(timezone.utc),
    )
    db.add(importacao)
    db.flush()

    try:
        df, linha_cabecalho = ler_aba(conteudo, nome_arquivo, aliases_esperados=ALIASES_PROCESSOS)
        detalhe_leitura = f"{len(df)} linhas lidas"
        if linha_cabecalho > 1:
            detalhe_leitura += f" (cabeçalho localizado na linha {linha_cabecalho})"
        etapas.append({"nome": "Arquivo recebido", "concluida": True, "detalhe": detalhe_leitura})

        mapa, ausentes = norm.mapear_colunas(list(df.columns))
        if ausentes:
            raise PlanilhaInvalida(
                "Colunas obrigatórias não encontradas: " + ", ".join(ausentes)
            )
        reconhecidas = len(mapa)
        etapas.append(
            {
                "nome": "Validação das colunas",
                "concluida": True,
                "detalhe": f"{reconhecidas} de {len(norm.MAPA_COLUNAS)} colunas reconhecidas",
            }
        )

        linhas = processar_linhas(df, mapa, escritorio)
        validas = [linha for linha in linhas if not linha.descartada]
        etapas.append(
            {"nome": "Leitura dos processos", "concluida": True, "detalhe": f"{len(linhas)} registros"}
        )
        etapas.append(
            {
                "nome": "Padronização dos dados",
                "concluida": True,
                "detalhe": f"{len(validas)} registros válidos",
            }
        )

        total_problemas = 0
        for item in linhas:
            for campo, problema, valor in item.problemas:
                db.add(
                    Inconsistencia(
                        importacao_id=importacao.id,
                        linha=item.linha,
                        campo=campo,
                        problema=problema,
                        valor_original=valor,
                        numero_autos=item.dados.get("numero_autos"),
                        bloqueante=item.descartada,
                    )
                )
                total_problemas += 1
        etapas.append(
            {
                "nome": "Identificação de inconsistências",
                "concluida": True,
                "detalhe": f"{total_problemas} inconsistência(s)",
            }
        )

        criados, atualizados = gravar_resultados(db, linhas, importacao, usuario)
        etapas.append(
            {
                "nome": "Consolidação dos indicadores",
                "concluida": True,
                "detalhe": f"{criados} novo(s), {atualizados} atualizado(s)",
            }
        )

        importacao.total_processos = len(linhas)
        importacao.registros_validos = len(validas)
        importacao.total_inconsistencias = total_problemas
        importacao.criados = criados
        importacao.atualizados = atualizados
        importacao.status = (
            StatusImportacao.CONCLUIDO_COM_ALERTAS if total_problemas else StatusImportacao.CONCLUIDO
        )
        if not validas:
            importacao.status = StatusImportacao.ERRO
            importacao.mensagem_erro = "Nenhum registro válido encontrado na planilha."

        importacao.duracao_ms = int((time.perf_counter() - inicio) * 1000)
        etapas.append({"nome": "Dashboard atualizado", "concluida": True, "detalhe": None})

        db.commit()
        db.refresh(importacao)
        return importacao, etapas

    except PlanilhaInvalida as erro:
        importacao.status = StatusImportacao.ERRO
        importacao.mensagem_erro = str(erro)
        importacao.duracao_ms = int((time.perf_counter() - inicio) * 1000)
        db.commit()
        db.refresh(importacao)
        raise


def montar_preview(conteudo: bytes, nome_arquivo: str, limite: int = 5) -> dict:
    """Leitura prévia (sem gravar): mostra colunas reconhecidas e amostra."""
    df, linha_cabecalho = ler_aba(conteudo, nome_arquivo, aliases_esperados=ALIASES_PROCESSOS)
    mapa, ausentes = norm.mapear_colunas(list(df.columns))
    invertido = {coluna: campo for campo, coluna in mapa.items()}

    colunas = [
        {
            "coluna_planilha": coluna,
            "campo_sistema": norm.ROTULO_CAMPO.get(invertido.get(coluna, ""), None),
            "reconhecida": coluna in invertido,
        }
        for coluna in df.columns
    ]

    amostra = (
        df.head(limite)
        .astype(object)
        .where(pd.notna(df.head(limite)), None)
        .to_dict(orient="records")
    )
    amostra = [{str(k): (str(v) if v is not None else None) for k, v in linha.items()} for linha in amostra]

    return {
        "arquivo": nome_arquivo,
        "linha_cabecalho": linha_cabecalho,
        "total_linhas": int(len(df)),
        "colunas": colunas,
        "colunas_obrigatorias_ausentes": ausentes,
        "amostra": amostra,
    }
