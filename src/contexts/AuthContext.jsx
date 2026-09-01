import { createContext, useContext, useMemo, useState, useEffect } from 'react';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => localStorage.getItem('nyx_user'));
  const [role, setRole] = useState(() => localStorage.getItem('nyx_role') || 'user');
  const [token, setToken] = useState(() => localStorage.getItem('nyx_token'));

  useEffect(() => {
    if (user) localStorage.setItem('nyx_user', user);
    else localStorage.removeItem('nyx_user');
  }, [user]);

  useEffect(() => {
    if (role) localStorage.setItem('nyx_role', role);
    else localStorage.removeItem('nyx_role');
  }, [role]);

  useEffect(() => {
    if (token) localStorage.setItem('nyx_token', token);
    else localStorage.removeItem('nyx_token');
  }, [token]);

  const value = useMemo(() => ({
    user,
    setUser,
    role,
    setRole,
    token,
    setToken,
    isAuthenticated: Boolean(token && user),
    isAdmin: role === 'admin',
    logout: () => {
      setUser(null);
      setRole('user');
      setToken(null);
    },
  }), [user, role, token]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}

export default AuthContext;
