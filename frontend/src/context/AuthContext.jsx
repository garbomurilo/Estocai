import React, { createContext, useContext, useEffect, useState } from "react";
import {
    onAuthStateChanged,
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    signOut
} from "firebase/auth";
import { auth } from "../firebase";
import { AuthAPI } from "../services/api";

const AuthContext = createContext(null);

export function useAuth() {
    return useContext(AuthContext);
}

export function AuthProvider({ children }) {
    const [usuario, setUsuario] = useState(null);
    const [carregando, setCarregando] = useState(true);

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
            if (!firebaseUser) {
                setUsuario(null);
                setCarregando(false);
                return;
            }
            try {
                const idToken = await firebaseUser.getIdToken();
                const perfil = await AuthAPI.login(idToken);
                setUsuario(perfil);
            } catch (err) {
                console.error("[AuthContext] Sessão bloqueada ou pendente:", err.message);
                setUsuario(null);
            } finally {
                setCarregando(false);
            }
        });
        return unsubscribe;
    }, []);

    const login = async (email, senha) => {
        const cred = await signInWithEmailAndPassword(auth, email, senha);
        const idToken = await cred.user.getIdToken();
        try {
            const perfil = await AuthAPI.login(idToken);
            setUsuario(perfil);
            return perfil;
        } catch (err) {
            await signOut(auth);
            setUsuario(null);
            throw err;
        }
    };

    const registrar = async ({ nome, nomeFantasia, email, senha }) => {
        const cred = await createUserWithEmailAndPassword(auth, email, senha);
        const resposta = await AuthAPI.register({
            uid: cred.user.uid,
            nome,
            nomeFantasia,
            email
        });
        await signOut(auth);
        setUsuario(null);
        return resposta;
    };

    const logout = async () => {
        await signOut(auth);
        setUsuario(null);
    };

    return (
        <AuthContext.Provider value={{ usuario, carregando, login, registrar, logout }}>
            {children}
        </AuthContext.Provider>
    );
}

