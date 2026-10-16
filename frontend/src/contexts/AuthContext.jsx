import React, { createContext, useContext, useEffect, useState } from 'react';
import { auth, db } from '../firebase';
import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';

const AuthContext = createContext();

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [tenantId, setTenantId] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        try {
          const userDoc = await getDoc(doc(db, 'users', user.uid));
          if (userDoc.exists() && userDoc.data()?.tenantId) {
            const tId = userDoc.data().tenantId;
            setTenantId(tId);
            localStorage.setItem('estocai_tenantId', tId);
          } else {
            const saved = localStorage.getItem('estocai_tenantId') || 'brasinha';
            setTenantId(saved);
            localStorage.setItem('estocai_tenantId', saved);
          }
        } catch (error) {
          console.error("Error fetching tenant info:", error);
          const saved = localStorage.getItem('estocai_tenantId') || 'brasinha';
          setTenantId(saved);
        }
      } else {
        setTenantId(null);
      }
      setCurrentUser(user);
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  const login = (email, password) => {
    return signInWithEmailAndPassword(auth, email, password);
  };

  const logout = () => {
    return signOut(auth);
  };

  const changeTenant = (newTenantId) => {
    const limpo = (newTenantId || '').trim().toLowerCase();
    setTenantId(limpo);
    if (limpo) {
      localStorage.setItem('estocai_tenantId', limpo);
    } else {
      localStorage.removeItem('estocai_tenantId');
    }
  };

  /** Retorna o token JWT atual para uso na API REST */
  const getToken = async () => {
    if (!auth.currentUser) return null;
    return auth.currentUser.getIdToken();
  };

  const value = {
    currentUser,
    tenantId,
    changeTenant,
    auth, // expõe a instância do auth para o api.js
    getToken,
    login,
    logout,
  };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
}
