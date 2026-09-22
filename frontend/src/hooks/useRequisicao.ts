/** Hook genérico de carregamento de dados da API: dados + carregando + erro + recarregar. */

import { useCallback, useEffect, useRef, useState } from 'react';

import { ApiError } from '../api/client';

interface Estado<T> {
  dados: T | null;
  carregando: boolean;
  erro: string | null;
  recarregar: () => void;
}

export function useRequisicao<T>(
  requisicao: () => Promise<T>,
  dependencias: unknown[] = [],
): Estado<T> {
  const [dados, setDados] = useState<T | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [gatilho, setGatilho] = useState(0);

  // Mantém a referência estável mesmo com função recriada a cada render.
  const requisicaoRef = useRef(requisicao);
  requisicaoRef.current = requisicao;

  useEffect(() => {
    let ativo = true;
    setCarregando(true);
    setErro(null);

    requisicaoRef
      .current()
      .then(resultado => {
        if (ativo) setDados(resultado);
      })
      .catch((problema: unknown) => {
        if (!ativo) return;
        // 401 é tratado globalmente (volta para o login) — não vira erro de tela.
        if (problema instanceof ApiError && problema.status === 401) return;
        setErro(problema instanceof Error ? problema.message : 'Erro inesperado.');
      })
      .finally(() => {
        if (ativo) setCarregando(false);
      });

    return () => {
      ativo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...dependencias, gatilho]);

  const recarregar = useCallback(() => setGatilho(valor => valor + 1), []);

  return { dados, carregando, erro, recarregar };
}
