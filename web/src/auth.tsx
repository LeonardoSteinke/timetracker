import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { api, ApiError, Settings, User } from './api';
import { cacheSettings, cacheUser, getCachedUser, isNetworkError } from './offline';

type AuthCtx = {
  user: User | null;
  loading: boolean;
  /** true quando a sessão veio do cache porque o servidor não respondeu. */
  offline: boolean;
  login: (username: string, password: string) => Promise<void>;
  register: (name: string, username: string, password: string, code: string) => Promise<void>;
  logout: () => Promise<void>;
};

const Ctx = createContext<AuthCtx>(null!);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(false);

  /** Guarda jornada e fuso para o app conseguir montar o dia sem conexão. */
  const sincronizarSettings = () => {
    api.get<Settings>('/api/settings').then(cacheSettings).catch(() => {});
  };

  useEffect(() => {
    api
      .get<User>('/api/auth/me')
      .then((u) => {
        setUser(u);
        cacheUser(u);
        sincronizarSettings();
      })
      .catch((e) => {
        // 401 é sessão de verdade expirada: cai no login. Falha de rede não —
        // o cookie dura 30 dias, então seguimos com o usuário do último acesso.
        if (e instanceof ApiError && e.status === 401) {
          cacheUser(null);
          return;
        }
        const cached = getCachedUser();
        if (cached) {
          setUser(cached);
          setOffline(true);
        } else {
          console.error(e);
        }
      })
      .finally(() => setLoading(false));
  }, []);

  // Ao voltar a rede, confirma a sessão de verdade com o servidor.
  useEffect(() => {
    if (!offline) return;
    const revalidar = () => {
      api
        .get<User>('/api/auth/me')
        .then((u) => {
          setUser(u);
          cacheUser(u);
          setOffline(false);
          sincronizarSettings();
        })
        .catch(() => {});
    };
    window.addEventListener('online', revalidar);
    return () => window.removeEventListener('online', revalidar);
  }, [offline]);

  const entrar = (u: User) => {
    setUser(u);
    cacheUser(u);
    setOffline(false);
    sincronizarSettings();
  };

  const login = async (username: string, password: string) => {
    entrar(await api.post<User>('/api/auth/login', { username, password }));
  };
  const register = async (name: string, username: string, password: string, code: string) => {
    entrar(await api.post<User>('/api/auth/register', { name, username, password, code }));
  };
  const logout = async () => {
    try {
      await api.post('/api/auth/logout');
    } catch (e) {
      // sem rede o cookie continua no navegador, mas sair localmente é o que o
      // usuário pediu — a sessão cai de vez na próxima vez que houver conexão
      if (!isNetworkError(e)) throw e;
    }
    cacheUser(null);
    setUser(null);
    setOffline(false);
  };

  return (
    <Ctx.Provider value={{ user, loading, offline, login, register, logout }}>{children}</Ctx.Provider>
  );
}

export const useAuth = () => useContext(Ctx);
