import React, { useEffect, useRef, useState } from "react";
import { LAYOUT_HTML } from "./layoutHtml";

/**
 * Componente Raiz React 19 do Estocaí.
 * Preserva 100% do layout Tailwind CSS, modais e estrutura visual,
 * conectando os estados de Lote e Validade (FEFO) no modal de cadastro/entrada
 * e delegando todas as operações de dados para a API REST do Express (/api/...).
 */
export default function App() {
    const initializedRef = useRef(false);
    const [destinoEstoque, setDestinoEstoque] = useState("DIA");
    const [numeroLote, setNumeroLote] = useState("");
    const [dataValidade, setDataValidade] = useState("");

    const hasStaticLayout =
        typeof document !== "undefined" && Boolean(document.getElementById("login-screen"));

    useEffect(() => {
        const selectTipo = document.getElementById("prod-tipo");
        const inputLote = document.getElementById("lote-numero-input");
        const inputValidade = document.getElementById("lote-validade-input");
        const secaoLote = document.getElementById("secao-controle-lote");
        const secaoFicha = document.getElementById("secao-ficha-tecnica");
        const tituloModal = document.getElementById("modal-titulo");
        const labelEstoque = document.getElementById("label-prod-estoque");

        const sincronizarCamposModal = (valorTipo) => {
            const val = String(valorTipo || selectTipo?.value || "DIA").trim().toUpperCase();
            const isGeral = ["GERAL", "ESTOQUE_GERAL", "MATERIA_PRIMA"].includes(val);
            setDestinoEstoque(isGeral ? "GERAL" : "DIA");

            if (isGeral) {
                if (tituloModal) tituloModal.innerText = "Novo Insumo / Entrada de Lote";
                if (labelEstoque) labelEstoque.innerText = "QUANTIDADE DO LOTE *";
                if (secaoFicha) secaoFicha.classList.add("hidden");
                if (secaoLote) secaoLote.classList.remove("hidden");
                if (inputLote) inputLote.required = true;
                if (inputValidade) inputValidade.required = true;
            } else {
                const prodId = document.getElementById("prod-id")?.value || "";
                if (tituloModal) tituloModal.innerText = prodId ? "Editar Item" : "Novo Item";
                if (labelEstoque) labelEstoque.innerText = "ESTOQUE";
                if (secaoLote) secaoLote.classList.add("hidden");
                if (secaoFicha) secaoFicha.classList.remove("hidden");
                if (inputLote) inputLote.required = false;
                if (inputValidade) inputValidade.required = false;
            }
        };

        const onTipoChange = (e) => sincronizarCamposModal(e.target.value);
        const onLoteInput = (e) => setNumeroLote(e.target.value);
        const onValidadeInput = (e) => setDataValidade(e.target.value);

        if (selectTipo) selectTipo.addEventListener("change", onTipoChange);
        if (inputLote) inputLote.addEventListener("input", onLoteInput);
        if (inputValidade) inputValidade.addEventListener("input", onValidadeInput);

        return () => {
            if (selectTipo) selectTipo.removeEventListener("change", onTipoChange);
            if (inputLote) inputLote.removeEventListener("input", onLoteInput);
            if (inputValidade) inputValidade.removeEventListener("input", onValidadeInput);
        };
    }, [destinoEstoque, numeroLote, dataValidade]);

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

    if (hasStaticLayout) {
        return null;
    }

    return <div dangerouslySetInnerHTML={{ __html: LAYOUT_HTML }} />;
}

