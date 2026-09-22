/** Sessão do usuário: login, logout, perfil e permissões. */

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { api, EVENTO_SESSAO_EXPIRADA, tokenStorage } from '../api/client';
import type { PerfilAcesso, Usuario } from '../api/types';

const NIVEL: Record<PerfilAcesso, number> = {
  Visualizador: 1,
  Analista: 2,
  Gestor: 3,
  Administrador: 4,
};

interface AuthContextValor {
  usuario: Usuario | null;
  carregando: boolean;
  autenticado: boolean;
  entrar: (email: string, senha: string) => Promise<void>;
  registrar: (dados: { nome: string; email: string; senha: string; cargo?: string; perfil?: string }) => Promise<void>;
  sair: () => void;
  /** true se o perfil do usuário for igual ou superior ao exigido. */
  podeAcessar: (perfilMinimo: PerfilAcesso) => boolean;
}

const AuthContext = createContext<AuthContextValor | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [carregando, setCarregando] = useState(true);

  // Revalida o token guardado no navegador ao abrir o sistema.
  useEffect(() => {
    if (!tokenStorage.obter()) {
      setCarregando(false);
      return;
    }
    api.auth
      .eu()
      .then(setUsuario)
      .catch(() => tokenStorage.limpar())
      .finally(() => setCarregando(false));
  }, []);

  // Token expirado no meio da navegação: volta para o login.
  useEffect(() => {
    const aoExpirar = () => setUsuario(null);
    window.addEventListener(EVENTO_SESSAO_EXPIRADA, aoExpirar);
    return () => window.removeEventListener(EVENTO_SESSAO_EXPIRADA, aoExpirar);
  }, []);

  const entrar = useCallback(async (email: string, senha: string) => {
    const resposta = await api.auth.login(email, senha);
    tokenStorage.salvar(resposta.access_token);
    setUsuario(resposta.usuario);
  }, []);

  const registrar = useCallback(
    async (dados: { nome: string; email: string; senha: string; cargo?: string; perfil?: string }) => {
      const resposta = await api.auth.registrar(dados);
      tokenStorage.salvar(resposta.access_token);
      setUsuario(resposta.usuario);
    },
    [],
  );

  const sair = useCallback(() => {
    tokenStorage.limpar();
    setUsuario(null);
  }, []);

  const valor = useMemo<AuthContextValor>(
    () => ({
      usuario,
      carregando,
      autenticado: usuario !== null,
      entrar,
      registrar,
      sair,
      podeAcessar: (perfilMinimo: PerfilAcesso) =>
        usuario ? NIVEL[usuario.perfil] >= NIVEL[perfilMinimo] : false,
    }),
    [usuario, carregando, entrar, registrar, sair],
  );

  return <AuthContext.Provider value={valor}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValor {
  const contexto = useContext(AuthContext);
  if (!contexto) throw new Error('useAuth precisa estar dentro de <AuthProvider>.');
  return contexto;
}
