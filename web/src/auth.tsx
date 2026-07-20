import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { api, ApiError, User } from './api';

type AuthCtx = {
  user: User | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  register: (name: string, username: string, password: string, code: string) => Promise<void>;
  logout: () => Promise<void>;
};

const Ctx = createContext<AuthCtx>(null!);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get<User>('/api/auth/me')
      .then(setUser)
      .catch((e) => {
        if (!(e instanceof ApiError && e.status === 401)) console.error(e);
      })
      .finally(() => setLoading(false));
  }, []);

  const login = async (username: string, password: string) => {
    const u = await api.post<User>('/api/auth/login', { username, password });
    setUser(u);
  };
  const register = async (name: string, username: string, password: string, code: string) => {
    const u = await api.post<User>('/api/auth/register', { name, username, password, code });
    setUser(u);
  };
  const logout = async () => {
    await api.post('/api/auth/logout');
    setUser(null);
  };

  return <Ctx.Provider value={{ user, loading, login, register, logout }}>{children}</Ctx.Provider>;
}

export const useAuth = () => useContext(Ctx);
