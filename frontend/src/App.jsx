import React, { useEffect, useMemo, useRef } from "react";
import { LAYOUT_HTML } from "./layoutHtml";

/**
 * Componente Raiz React 19 do Estocaí.
 * Preserva 100% do layout Tailwind CSS, modais e estrutura visual,
 * mantendo o DOM estável (sem desmontar ao interagir com inputs de Lote/Validade)
 * e delegando todas as operações de dados para a API REST do Express (/api/...).
 */
export default function App() {
    const initializedRef = useRef(false);
    const hasStaticLayoutRef = useRef(
        typeof document !== "undefined" && Boolean(document.getElementById("login-screen"))
    );

    const layoutMarkup = useMemo(() => ({ __html: LAYOUT_HTML }), []);

    useEffect(() => {
        if (initializedRef.current) return;
        initializedRef.current = true;

        if (window.lucide && typeof window.lucide.createIcons === "function") {
            window.lucide.createIcons();
        }

        // Carrega o controlador da aplicação que realiza as chamadas HTTP (fetch) para /api/...
        if (!document.querySelector('script[data-estocai-controller="true"]')) {
            const script = document.createElement("script");
            script.type = "module";
            script.src = `/app.js?v=${Date.now()}`;
            script.setAttribute("data-estocai-controller", "true");
            document.body.appendChild(script);
        }
    }, []);

    if (hasStaticLayoutRef.current) {
        return null;
    }

    return <div dangerouslySetInnerHTML={layoutMarkup} />;
}
