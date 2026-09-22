# Planilha base recebida dos escritórios

O arquivo `planilha-modelo.xlsx` (gerado pelo seed) está exatamente no formato que o
sistema espera receber. Use-o como referência ao pedir o arquivo aos escritórios.

| # | Coluna | Exemplo |
|---|---|---|
| 1 | Status | Ativo |
| 2 | Autor/Réu | João Carlos Mendes |
| 3 | Número Autos | 0001234-56.2021.5.09.0015 |
| 4 | Natureza da ação | Trabalhista |
| 5 | Vara | 3ª Vara do Trabalho |
| 6 | Comarca | Curitiba |
| 7 | Data de início | 15/03/2021 |
| 8 | Posição da Renault | passivo |
| 9 | Resumo do caso | Ex-funcionário pleiteia verbas rescisórias... |
| 10 | Defesa | Sim |
| 11 | Fase processual | Recurso |
| 12 | Movimentações | 15/12/2024 - Despacho: recurso recebido. |
| 13 | Valor da causa | R$ 450.000,00 |
| 14 | Valor do risco | R$ 185.000,00 |

## Como gerar uma nova planilha de exemplo

```bash
cd backend
python -c "from app.seed import gerar_planilha_modelo; print(gerar_planilha_modelo(quantidade=100))"
```

## Linhas problemáticas incluídas de propósito

A planilha de exemplo traz cinco linhas com defeitos, para demonstrar a tela de
inconsistências: valor da causa ilegível, data inválida, status desconhecido, valor do
risco maior que o da causa e uma linha sem número de autos (descartada).
