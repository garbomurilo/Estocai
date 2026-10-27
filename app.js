// IMPORTAÇÕES DO FIREBASE
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-app.js";
import { getFirestore, collection, getDocs, doc, getDoc, updateDoc, addDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-auth.js";
import { firebaseConfig } from './firebase-config.js'; 

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app); 

lucide.createIcons();

//INTERFACE & LOGIN OFICIAL

const loginScreen = document.getElementById('login-screen');
const dashboardScreen = document.getElementById('dashboard-screen');
const loginForm = document.getElementById('login-form');
const btnLogout = document.getElementById('btn-logout');

onAuthStateChanged(auth, (user) => {
    if (user) {
        loginScreen.classList.add('hidden');
        dashboardScreen.classList.remove('hidden');
        dashboardScreen.classList.add('flex');
        carregarProdutosPDV(); 
        if (typeof carregarClientesPDV === 'function') carregarClientesPDV();
    } else {
        dashboardScreen.classList.add('hidden');
        dashboardScreen.classList.remove('flex');
        loginScreen.classList.remove('hidden');
    }
});

loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const emailInput = loginForm.querySelectorAll('input')[0].value;
    const passwordInput = loginForm.querySelectorAll('input')[1].value;
    const btnLogin = loginForm.querySelector('button');
    
    const textoOriginal = btnLogin.innerText;
    btnLogin.innerText = "Autenticando...";
    btnLogin.disabled = true;

    try {
        await signInWithEmailAndPassword(auth, emailInput, passwordInput);
    } catch (error) {
        console.error("Erro no login:", error);
        alert("Acesso negado! Verifique seu e-mail e senha.");
    } finally {
        btnLogin.innerText = textoOriginal;
        btnLogin.disabled = false;
    }
});

if(btnLogout) {
    btnLogout.addEventListener('click', async () => {
        try { await signOut(auth); } catch (error) { console.error("Erro ao sair:", error); }
    });
}

// Nav Menu Lateral
const navBtns = document.querySelectorAll('.nav-btn');
const views = {
    'vendas': document.getElementById('view-vendas'),
    'estoque': document.getElementById('view-estoque'),
    'fidelidade': document.getElementById('view-fidelidade'),
    'usuarios': document.getElementById('view-usuarios'),
    'cardapio': document.getElementById('view-cardapio'),
    'qrcode': document.getElementById('view-qrcode')
};

navBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        navBtns.forEach(b => {
            b.classList.remove('bg-orange-50', 'text-orange-600');
            b.classList.add('text-gray-500');
        });
        btn.classList.add('bg-orange-50', 'text-orange-600');
        btn.classList.remove('text-gray-500');

        Object.values(views).forEach(view => { if (view) view.classList.add('hidden'); });

        const targetView = btn.getAttribute('data-target');
        if (views[targetView]) {
            views[targetView].classList.remove('hidden');
            lucide.createIcons(); 
            
            if (targetView === 'estoque') {
                const tabDia = document.getElementById('tab-estoque-dia');
                if(tabDia) tabDia.click();
            } else if (targetView === 'fidelidade') {
                const tabTodos = document.getElementById('tab-fidelidade-todos');
                if(tabTodos) tabTodos.click();
            } else if (targetView === 'usuarios') {
                const tabTodos = document.getElementById('tab-usuarios-todos');
                if(tabTodos) tabTodos.click();
            } else if (targetView === 'vendas') {
                carregarProdutosPDV();
                if (typeof carregarClientesPDV === 'function') carregarClientesPDV();
            }
        }
    });
});

// Venda e carrinho

const pdvProdutos = document.getElementById('pdv-produtos');
const pdvCarrinho = document.getElementById('pdv-carrinho');
const carrinhoVazio = document.getElementById('carrinho-vazio');
const pdvTotal = document.getElementById('pdv-total');
const badgeItens = document.getElementById('badge-itens');
const btnLimparCarrinho = document.getElementById('btn-limpar-carrinho');
const btnFinalizarVenda = document.getElementById('btn-finalizar-venda');

const pdvClienteSelect = document.getElementById('pdv-cliente');
const pdvClienteInfo = document.getElementById('pdv-cliente-info');
const pdvClienteStatus = document.getElementById('pdv-cliente-status');
const pdvClienteBadge = document.getElementById('pdv-cliente-badge');
const btnPdvNovoCliente = document.getElementById('btn-pdv-novo-cliente');
const btnsPagamento = document.querySelectorAll('.btn-pagamento');

let formaPagamentoSelecionada = 'PIX';
let clientesPdvCache = [];
let carrinho = [];
let totalVendidoNoDia = 0;

window.carregarProdutosPDV = async function() {
    if (!pdvProdutos) return;
    pdvProdutos.innerHTML = '<p class="text-gray-400 italic col-span-full">Carregando...</p>'; 

    try {
        const snapshot = await getDocs(collection(db, "produtos"));
        let produtosCarregados = 0;
        pdvProdutos.innerHTML = '';

        snapshot.forEach(doc => {
            const p = doc.data();
            const id = doc.id;

            if (p.tipo_estoque === 'DIA' && p.ativo && p.preco > 0) {
                produtosCarregados++;
                const btn = document.createElement('button');
                btn.className = "bg-orange-50 hover:bg-orange-100 border border-orange-100 p-4 rounded-2xl flex flex-col items-center justify-center text-center transition-all h-32 gap-2 shadow-sm active:scale-95";
                btn.innerHTML = `
                    <span class="font-bold text-gray-800 text-sm leading-tight">${p.nome}</span>
                    <span class="text-orange-600 font-black">R$ ${p.preco.toFixed(2)}</span>
                    <span class="text-[10px] text-gray-400 font-medium">${p.estoque} no estoque</span>
                `;
                btn.onclick = () => adicionarAoCarrinho(id, p.nome, p.preco, p.estoque);
                pdvProdutos.appendChild(btn);
            }
        });

        if (produtosCarregados === 0) pdvProdutos.innerHTML = '<p class="text-gray-400 italic col-span-full">Nenhum produto com preço disponível para venda.</p>';
    } catch (error) {
        console.error("Erro ao carregar PDV:", error);
    }
}

function adicionarAoCarrinho(id, nome, preco, estoqueAtual) {
    const itemExistente = carrinho.find(item => item.id === id);
    if (itemExistente) {
        if (itemExistente.quantidade >= estoqueAtual) {
            alert(`Estoque insuficiente! Você só tem ${estoqueAtual}x ${nome}.`);
            return;
        }
        itemExistente.quantidade += 1;
    } else {
        if (estoqueAtual < 1) {
            alert(`Produto esgotado no estoque!`);
            return;
        }
        carrinho.push({ id, nome, preco, quantidade: 1 });
    }
    atualizarTelaCarrinho();
}

function atualizarTelaCarrinho() {
    if (carrinhoVazio) carrinhoVazio.style.display = carrinho.length > 0 ? 'none' : 'block';
    
    const itensAntigos = pdvCarrinho.querySelectorAll('.carrinho-item');
    itensAntigos.forEach(item => item.remove());

    let valorTotal = 0;
    let qtdTotal = 0;

    carrinho.forEach((item, index) => {
        valorTotal += (item.preco * item.quantidade);
        qtdTotal += item.quantidade;

        const div = document.createElement('div');
        div.className = "carrinho-item flex justify-between items-center bg-gray-50 p-3 rounded-xl border border-gray-100";
        div.innerHTML = `
            <div class="flex-1">
                <p class="font-bold text-gray-800 text-sm">${item.nome}</p>
                <p class="text-xs text-orange-600 font-bold">R$ ${item.preco.toFixed(2)} <span class="text-gray-400 font-medium">x${item.quantidade}</span></p>
            </div>
            <div class="font-black text-gray-700 mr-3">R$ ${(item.preco * item.quantidade).toFixed(2)}</div>
            <button class="text-red-400 hover:text-red-600 p-1 bg-white rounded-md shadow-sm border border-gray-100 btn-remover" data-index="${index}">
                <i data-lucide="trash-2" class="w-4 h-4"></i>
            </button>
        `;
        pdvCarrinho.appendChild(div);
    });

    document.querySelectorAll('.btn-remover').forEach(btn => {
        btn.onclick = (e) => {
            const index = e.currentTarget.getAttribute('data-index');
            carrinho.splice(index, 1); 
            atualizarTelaCarrinho();
        };
    });

    pdvTotal.innerText = `R$ ${valorTotal.toFixed(2)}`;
    pdvTotal.setAttribute('data-valor', valorTotal);
    badgeItens.innerText = `${qtdTotal} itens`;
    lucide.createIcons();
}

if (btnLimparCarrinho) {
    btnLimparCarrinho.addEventListener('click', () => {
        if (carrinho.length > 0 && confirm("Deseja cancelar este pedido?")) {
            carrinho = [];
            atualizarTelaCarrinho();
        }
    });
}

// CARREGAR CLIENTES NO SELETOR DO PDV
window.carregarClientesPDV = async function() {
    if (!pdvClienteSelect) return;
    const selecionadoAtual = pdvClienteSelect.value;

    try {
        const snapshot = await getDocs(collection(db, "clientes"));
        clientesPdvCache = [];
        snapshot.forEach(docSnap => {
            clientesPdvCache.push({ id: docSnap.id, ...docSnap.data() });
        });

        clientesPdvCache.sort((a, b) => (a.nome || '').localeCompare(b.nome || ''));

        pdvClienteSelect.innerHTML = '<option value="">👤 Consumidor Final (Sem cadastro)</option>';
        clientesPdvCache.forEach(c => {
            const compras = c.fidelidade?.quantidade_compras_validas ?? c.compras ?? 0;
            const opt = document.createElement('option');
            opt.value = c.id;
            const cpfFormatado = typeof formatarCPF === 'function' ? formatarCPF(c.cpf) : c.cpf;
            opt.textContent = `${c.nome} (CPF: ${cpfFormatado}) • ${compras}/10 compras`;
            if (c.id === selecionadoAtual) opt.selected = true;
            pdvClienteSelect.appendChild(opt);
        });

        atualizarInfoClientePDV();
    } catch (error) {
        console.error("Erro ao carregar clientes no PDV:", error);
    }
};

function atualizarInfoClientePDV() {
    if (!pdvClienteSelect || !pdvClienteInfo) return;
    const id = pdvClienteSelect.value;
    if (!id) {
        pdvClienteInfo.classList.add('hidden');
        return;
    }

    const cliente = clientesPdvCache.find(c => c.id === id);
    if (!cliente) {
        pdvClienteInfo.classList.add('hidden');
        return;
    }

    const compras = cliente.fidelidade?.quantidade_compras_validas ?? cliente.compras ?? 0;
    const elegivel = compras >= 10 || cliente.fidelidade?.elegivel_premio === true;

    pdvClienteInfo.classList.remove('hidden');
    if (elegivel) {
        pdvClienteStatus.innerHTML = `<i data-lucide="gift" class="w-4 h-4 text-emerald-600"></i> <span class="text-emerald-700 font-bold">${compras} compras</span>`;
        pdvClienteBadge.innerHTML = `<span class="bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full text-[10px] font-black">🎁 Prêmio Disponível!</span>`;
    } else {
        const faltam = 10 - compras;
        pdvClienteStatus.innerHTML = `<i data-lucide="award" class="w-4 h-4 text-orange-500"></i> <span class="text-gray-700 font-bold">${compras}/10 compras</span>`;
        pdvClienteBadge.innerHTML = `<span class="text-orange-600 font-bold text-[11px]">${faltam} para o prêmio</span>`;
    }
    lucide.createIcons();
}

if (pdvClienteSelect) {
    pdvClienteSelect.addEventListener('change', atualizarInfoClientePDV);
}

if (btnPdvNovoCliente) {
    btnPdvNovoCliente.addEventListener('click', () => {
        if (typeof abrirModalCliente === 'function') {
            abrirModalCliente();
        }
    });
}

// Formas de Pagamento
btnsPagamento.forEach(btn => {
    btn.addEventListener('click', () => {
        btnsPagamento.forEach(b => {
            b.classList.remove('bg-orange-50', 'text-orange-700', 'border-orange-200');
            b.classList.add('bg-gray-50', 'text-gray-600', 'border-gray-200');
        });
        btn.classList.add('bg-orange-50', 'text-orange-700', 'border-orange-200');
        btn.classList.remove('bg-gray-50', 'text-gray-600', 'border-gray-200');
        formaPagamentoSelecionada = btn.getAttribute('data-pagamento') || 'PIX';
    });
});

if (btnFinalizarVenda) {
    btnFinalizarVenda.addEventListener('click', async () => {
        if (carrinho.length === 0) { alert("O carrinho está vazio!"); return; }

        const clienteId = pdvClienteSelect ? pdvClienteSelect.value : "";
        const clienteSelecionado = clienteId ? clientesPdvCache.find(c => c.id === clienteId) : null;
        const nomeParaConfirmacao = clienteSelecionado ? clienteSelecionado.nome : "Consumidor Final";

        if (!confirm(`Confirmar venda de ${pdvTotal.innerText}?\nCliente: ${nomeParaConfirmacao}\nPagamento: ${formaPagamentoSelecionada}`)) return;

        btnFinalizarVenda.innerText = "Processando...";
        btnFinalizarVenda.disabled = true;
        const valorDaVenda = parseFloat(pdvTotal.getAttribute('data-valor')) || 0;

        try {
            // 1. Abater do estoque no Firestore
            for (const item of carrinho) {
                const produtoRef = doc(db, "produtos", item.id);
                const produtoSnap = await getDoc(produtoRef);
                if (produtoSnap.exists()) {
                    const novoEstoque = Math.max(0, produtoSnap.data().estoque - item.quantidade);
                    await updateDoc(produtoRef, { estoque: novoEstoque });
                }
            }

            // 2. Pontuar cliente no programa de fidelidade (se selecionado)
            let mensagemFidelidade = "";
            if (clienteId && clienteSelecionado) {
                const comprasAtuais = (clienteSelecionado.fidelidade?.quantidade_compras_validas ?? clienteSelecionado.compras ?? 0) + 1;
                const elegivel = comprasAtuais >= 10;
                await updateDoc(doc(db, "clientes", clienteId), {
                    "fidelidade.quantidade_compras_validas": comprasAtuais,
                    "fidelidade.elegivel_premio": elegivel,
                    "atualizado_em": new Date().toISOString()
                });

                if (elegivel) {
                    mensagemFidelidade = `\n\n🎉 Parabéns! ${clienteSelecionado.nome} atingiu ${comprasAtuais} compras e conquistou um Prêmio de Fidelidade! 🎁`;
                } else {
                    mensagemFidelidade = `\n\n⭐ +1 compra computada para ${clienteSelecionado.nome}! Saldo atual: ${comprasAtuais}/10 compras.`;
                }
            }

            // 3. Registrar o pedido no Firestore (Coleção pedidos)
            try {
                await addDoc(collection(db, "pedidos"), {
                    id_cliente: clienteId || null,
                    nome_cliente: clienteSelecionado ? clienteSelecionado.nome : "Consumidor Final",
                    cpf_cliente: clienteSelecionado ? clienteSelecionado.cpf : null,
                    data_hora: new Date().toISOString(),
                    tipo_pedido: "BALCAO",
                    status: "CONCLUIDO",
                    valor_total: valorDaVenda,
                    itens: carrinho.map(item => ({
                        id_produto: item.id,
                        nome_produto: item.nome,
                        quantidade: item.quantidade,
                        preco_unitario: item.preco,
                        subtotal: item.preco * item.quantidade
                    })),
                    pagamento: {
                        forma_pagamento: formaPagamentoSelecionada,
                        status: "PAGO"
                    }
                });
            } catch (pedErr) {
                console.warn("Aviso ao salvar pedido:", pedErr);
            }

            totalVendidoNoDia += valorDaVenda;
            alert(`✅ Venda finalizada com sucesso!\nForma de Pagamento: ${formaPagamentoSelecionada}${mensagemFidelidade}`);

            carrinho = [];
            atualizarTelaCarrinho();
            await carregarProdutosPDV();
            await carregarClientesPDV();
            if (typeof carregarClientes === 'function') carregarClientes();
        } catch (error) {
            console.error("Erro na venda:", error);
            alert("Erro ao finalizar venda e atualizar estoque.");
        } finally {
            btnFinalizarVenda.innerHTML = `<i data-lucide="check-circle" class="w-5 h-5"></i> Finalizar Venda`;
            btnFinalizarVenda.disabled = false;
            lucide.createIcons();
        }
    });
}

const btnEncerrarDia = document.getElementById('btn-encerrar-dia');
if (btnEncerrarDia) {
    btnEncerrarDia.addEventListener('click', () => {
        const dinheiroEmMaos = parseFloat(prompt("Qual o valor total em DINHEIRO você tem no caixa agora?"));
        if (isNaN(dinheiroEmMaos)) return;
        const discrepancia = dinheiroEmMaos - totalVendidoNoDia;

        if (discrepancia === 0) {
            alert(`✅ Caixa Perfeito!\nTotal Vendido: R$ ${totalVendidoNoDia.toFixed(2)}\nEm mãos: R$ ${dinheiroEmMaos.toFixed(2)}`);
        } else if (discrepancia > 0) {
            alert(`⚠️ Sobra no Caixa!\nTotal Vendido: R$ ${totalVendidoNoDia.toFixed(2)}\nEm mãos: R$ ${dinheiroEmMaos.toFixed(2)}\nDiscrepância: + R$ ${discrepancia.toFixed(2)} (Sobra)`);
        } else {
            alert(`🚨 FALTA NO CAIXA!\nTotal Vendido: R$ ${totalVendidoNoDia.toFixed(2)}\nEm mãos: R$ ${dinheiroEmMaos.toFixed(2)}\nDiscrepância: - R$ ${Math.abs(discrepancia).toFixed(2)} (Faltando)`);
        }
        
        if(confirm("Deseja zerar as vendas e encerrar o expediente?")) {
            totalVendidoNoDia = 0;
            alert("Caixa do dia zerado com sucesso!");
        }
    });
}


// INVENTÁRIO DE ESTOQUE CRUD 

const tabelaEstoque = document.getElementById('tabela-estoque');
const modalProduto = document.getElementById('modal-produto');
const formProduto = document.getElementById('form-produto');
const btnNovoItem = document.getElementById('btn-novo-item');
const btnCancelarModal = document.getElementById('btn-cancelar-modal');
const modalTitulo = document.getElementById('modal-titulo');

let estoqueAbaAtual = 'DIA'; 

async function carregarEstoque(tipoEstoque = 'DIA') {
    if (!tabelaEstoque) return;
    estoqueAbaAtual = tipoEstoque;
    tabelaEstoque.innerHTML = '<tr><td colspan="3" class="text-center py-12 text-gray-400 italic">Buscando dados no banco...</td></tr>';

    try {
        const snapshot = await getDocs(collection(db, "produtos"));
        let htmlFinal = "";
        let contagem = 0;

        snapshot.forEach(documento => {
            const p = documento.data();
            const id = documento.id;
            
            if (p.tipo_estoque === tipoEstoque) {
                contagem++;
                const subTexto = tipoEstoque === 'DIA' 
                    ? `<p class="text-[10px] text-gray-400 uppercase font-medium mt-1">${p.categoria} • R$ ${Number(p.preco || 0).toFixed(2)}</p>`
                    : `<p class="text-[10px] text-blue-400 uppercase font-bold mt-1">${p.categoria}</p>`;
                const alertaEstoque = p.estoque <= 5 ? "text-red-500" : "text-gray-700";

                htmlFinal += `
                    <tr class="hover:bg-orange-50/30 transition-colors">
                        <td class="px-6 md:px-8 py-6">
                            <p class="font-bold text-gray-800 text-sm md:text-base">${p.nome}</p>
                            ${subTexto}
                        </td>
                        <td class="px-6 md:px-8 py-6">
                            <span class="font-black text-lg ${alertaEstoque}">
                                ${p.estoque} <span class="text-sm font-medium text-gray-400">${p.unidade}</span>
                            </span>
                        </td>
                        <td class="px-6 md:px-8 py-6 text-right">
                            <div class="flex justify-end gap-2">
                                <button onclick="abrirModalEdicao('${id}')" class="p-2 text-blue-400 hover:bg-blue-50 rounded-lg transition-colors" title="Editar">
                                    <i data-lucide="edit-2" class="w-4 h-4"></i>
                                </button>
                                <button onclick="excluirProduto('${id}')" class="p-2 text-red-300 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors" title="Excluir">
                                    <i data-lucide="trash-2" class="w-4 h-4"></i>
                                </button>
                            </div>
                        </td>
                    </tr>
                `;
            }
        });
        tabelaEstoque.innerHTML = contagem === 0 ? '<tr><td colspan="3" class="text-center py-12 text-gray-400">Nenhum item nesta categoria.</td></tr>' : htmlFinal;
        lucide.createIcons();
    } catch (error) {
        console.error("Erro ao ler estoque:", error);
        tabelaEstoque.innerHTML = '<tr><td colspan="3" class="text-center py-12 text-red-500 font-bold">Erro de conexão.</td></tr>';
    }
}

const tabDia = document.getElementById('tab-estoque-dia');
const tabGeral = document.getElementById('tab-estoque-geral');

if(tabDia && tabGeral) {
    tabDia.addEventListener('click', () => {
        tabDia.className = "flex-1 py-3 text-sm font-bold rounded-xl transition-all flex items-center justify-center gap-2 bg-white text-orange-600 shadow-sm";
        tabGeral.className = "flex-1 py-3 text-sm font-bold rounded-xl transition-all flex items-center justify-center gap-2 text-gray-500 hover:text-gray-700";
        carregarEstoque('DIA');
    });

    tabGeral.addEventListener('click', () => {
        tabGeral.className = "flex-1 py-3 text-sm font-bold rounded-xl transition-all flex items-center justify-center gap-2 bg-white text-blue-600 shadow-sm";
        tabDia.className = "flex-1 py-3 text-sm font-bold rounded-xl transition-all flex items-center justify-center gap-2 text-gray-500 hover:text-gray-700";
        carregarEstoque('GERAL');
    });
}

function abrirModal() {
    formProduto.reset();
    document.getElementById('prod-id').value = ""; 
    modalTitulo.innerText = "Novo Item";
    document.getElementById('prod-tipo').value = estoqueAbaAtual; 
    modalProduto.classList.remove('hidden');
}

function fecharModal() {
    modalProduto.classList.add('hidden');
}

if (btnNovoItem) btnNovoItem.addEventListener('click', abrirModal);
if (btnCancelarModal) btnCancelarModal.addEventListener('click', fecharModal);

if(formProduto) {
    formProduto.addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = document.getElementById('prod-id').value;
        const btnSalvar = document.getElementById('btn-salvar-produto');
        const textoOriginal = btnSalvar.innerHTML;
        btnSalvar.innerHTML = "Salvando...";
        btnSalvar.disabled = true;

        const produtoData = {
            nome: document.getElementById('prod-nome').value,
            preco: parseFloat(document.getElementById('prod-preco').value) || 0,
            estoque: parseInt(document.getElementById('prod-estoque').value) || 0,
            categoria: document.getElementById('prod-categoria').value,
            unidade: document.getElementById('prod-unidade').value,
            tipo_estoque: document.getElementById('prod-tipo').value,
            ativo: true
        };

        try {
            if (id) { await updateDoc(doc(db, "produtos", id), produtoData); } 
            else { await addDoc(collection(db, "produtos"), produtoData); }
            fecharModal();
            carregarEstoque(estoqueAbaAtual); 
            if (typeof carregarProdutosPDV === 'function') carregarProdutosPDV(); 
        } catch (error) {
            console.error("Erro ao salvar:", error);
            alert("Erro ao salvar produto. Verifique suas permissões.");
        } finally {
            btnSalvar.innerHTML = textoOriginal;
            btnSalvar.disabled = false;
        }
    });
}

window.excluirProduto = async function(id) {
    if(confirm("Tem certeza que deseja excluir este item permanentemente?")) {
        try {
            await deleteDoc(doc(db, "produtos", id));
            carregarEstoque(estoqueAbaAtual);
            if (typeof carregarProdutosPDV === 'function') carregarProdutosPDV();
        } catch (error) {
            console.error("Erro ao excluir:", error);
        }
    }
};

window.abrirModalEdicao = async function(id) {
    try {
        const produtoSnap = await getDoc(doc(db, "produtos", id));
        if (produtoSnap.exists()) {
            const p = produtoSnap.data();
            document.getElementById('prod-id').value = id;
            document.getElementById('prod-nome').value = p.nome;
            document.getElementById('prod-preco').value = p.preco || 0;
            document.getElementById('prod-estoque').value = p.estoque;
            document.getElementById('prod-categoria').value = p.categoria;
            document.getElementById('prod-unidade').value = p.unidade;
            document.getElementById('prod-tipo').value = p.tipo_estoque;
            
            modalTitulo.innerText = "Editar Item";
            modalProduto.classList.remove('hidden');
        }
    } catch (error) {
        console.error("Erro ao buscar item:", error);
    }
};
// GERADOR DE QR CODE
const btnGerarQr = document.getElementById('btn-gerar-qr');
const inputQrUrl = document.getElementById('qr-url-input');
const qrContainer = document.getElementById('qrcode-container');
const qrImagem = document.getElementById('qrcode-imagem');
const btnImprimirQr = document.getElementById('btn-imprimir-qr');

if (btnGerarQr) {
    const urlAtual = window.location.origin + window.location.pathname.replace('index.html', '');
    const urlCardapio = urlAtual + 'cardapio.html';
    inputQrUrl.value = urlCardapio;

    btnGerarQr.addEventListener('click', () => {
        qrImagem.innerHTML = "";
        new QRCode(qrImagem, {
            text: urlCardapio, width: 220, height: 220,
            colorDark : "#1f2937", colorLight : "#ffffff",
            correctLevel : QRCode.CorrectLevel.H
        });
        qrContainer.classList.remove('hidden');
        btnImprimirQr.classList.remove('hidden');
        lucide.createIcons();
    });

    btnImprimirQr.addEventListener('click', () => {
        const printWindow = window.open('', '', 'height=600,width=800');
        const qrCanvas = qrImagem.querySelector('canvas');
        if (qrCanvas) {
            const qrDataUrl = qrCanvas.toDataURL();
            printWindow.document.write(`
                <html>
                    <head><title>QR Code</title><style>body { display: flex; flex-direction: column; justify-content: center; align-items: center; height: 100vh; margin: 0; font-family: sans-serif; text-align: center; } h1 { color: #ea580c; font-size: 40px; } img { width: 300px; height: 300px; }</style></head>
                    <body><h1>Estocaí</h1><p>Escaneie para ver o cardápio</p><img src="${qrDataUrl}" /></body>
                </html>
            `);
            printWindow.document.close();
            printWindow.focus();
            setTimeout(() => { printWindow.print(); printWindow.close(); }, 300);
        }
    });
}

// PESQUISA INVENTÁRIO
const inputPesquisaEstoque = document.getElementById('input-pesquisa-estoque');

if (inputPesquisaEstoque) {
    inputPesquisaEstoque.addEventListener('input', (e) => {
        const termoDigitado = e.target.value.toLowerCase();
        const linhasDaTabela = tabelaEstoque.querySelectorAll('tr');
        
        linhasDaTabela.forEach(linha => {
            if (linha.innerText.includes("Buscando dados") || linha.innerText.includes("Nenhum item")) return;
            
            const nomeProduto = linha.querySelector('p.font-bold')?.innerText.toLowerCase() || "";
            if (nomeProduto.includes(termoDigitado)) {
                linha.style.display = '';
            } else {
                linha.style.display = 'none';
            }
        });
    });
}

// ==========================================
// PROGRAMA DE FIDELIDADE (CRUD & PESQUISA)
// ==========================================

const tabelaFidelidade = document.getElementById('tabela-fidelidade');
const modalCliente = document.getElementById('modal-cliente');
const formCliente = document.getElementById('form-cliente');
const btnNovoCliente = document.getElementById('btn-novo-cliente');
const btnCancelarModalCliente = document.getElementById('btn-cancelar-modal-cliente');
const modalClienteTitulo = document.getElementById('modal-cliente-titulo');
const tabFidelidadeTodos = document.getElementById('tab-fidelidade-todos');
const tabFidelidadePremiados = document.getElementById('tab-fidelidade-premiados');
const inputPesquisaFidelidade = document.getElementById('input-pesquisa-fidelidade');

const clienteIdInput = document.getElementById('cliente-id');
const clienteNomeInput = document.getElementById('cliente-nome');
const clienteCpfInput = document.getElementById('cliente-cpf');
const clienteTelefoneInput = document.getElementById('cliente-telefone');
const clienteComprasInput = document.getElementById('cliente-compras');

let fidelidadeAbaAtual = 'TODOS';
let clientesCache = [];

function formatarCPF(cpf) {
    if (!cpf) return "-";
    const limpo = String(cpf).replace(/\D/g, "");
    if (limpo.length !== 11) return cpf;
    return limpo.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
}

function formatarTelefone(tel) {
    if (!tel) return "-";
    const limpo = String(tel).replace(/\D/g, "");
    if (limpo.length === 11) {
        return limpo.replace(/(\d{2})(\d{5})(\d{4})/, "($1) $2-$3");
    } else if (limpo.length === 10) {
        return limpo.replace(/(\d{2})(\d{4})(\d{4})/, "($1) $2-$3");
    }
    return tel;
}

if (clienteCpfInput) {
    clienteCpfInput.addEventListener('input', (e) => {
        let v = e.target.value.replace(/\D/g, "").slice(0, 11);
        if (v.length > 9) v = v.replace(/(\d{3})(\d{3})(\d{3})(\d{1,2})/, "$1.$2.$3-$4");
        else if (v.length > 6) v = v.replace(/(\d{3})(\d{3})(\d{1,3})/, "$1.$2.$3");
        else if (v.length > 3) v = v.replace(/(\d{3})(\d{1,3})/, "$1.$2");
        e.target.value = v;
    });
}

if (clienteTelefoneInput) {
    clienteTelefoneInput.addEventListener('input', (e) => {
        let v = e.target.value.replace(/\D/g, "").slice(0, 11);
        if (v.length > 10) v = v.replace(/(\d{2})(\d{5})(\d{4})/, "($1) $2-$3");
        else if (v.length > 6) v = v.replace(/(\d{2})(\d{4})(\d{1,4})/, "($1) $2-$3");
        else if (v.length > 2) v = v.replace(/(\d{2})(\d{1,5})/, "($1) $2");
        e.target.value = v;
    });
}

async function carregarClientes(filtro = fidelidadeAbaAtual) {
    if (!tabelaFidelidade) return;
    fidelidadeAbaAtual = filtro;
    tabelaFidelidade.innerHTML = '<tr><td colspan="3" class="text-center py-12 text-gray-400 italic">Buscando clientes no banco...</td></tr>';

    try {
        const snapshot = await getDocs(collection(db, "clientes"));
        clientesCache = [];
        snapshot.forEach(docSnap => {
            clientesCache.push({ id: docSnap.id, ...docSnap.data() });
        });

        clientesCache.sort((a, b) => (a.nome || '').localeCompare(b.nome || ''));
        renderizarTabelaClientes(clientesCache);
    } catch (error) {
        console.error("Erro ao carregar clientes:", error);
        tabelaFidelidade.innerHTML = '<tr><td colspan="3" class="text-center py-12 text-red-500 font-bold">Erro de conexão ao carregar clientes.</td></tr>';
    }
}

function renderizarTabelaClientes(lista) {
    if (!tabelaFidelidade) return;

    let filtrados = lista;
    if (fidelidadeAbaAtual === 'PREMIADOS') {
        filtrados = lista.filter(c => {
            const compras = c.fidelidade?.quantidade_compras_validas ?? c.compras ?? 0;
            return compras >= 10 || c.fidelidade?.elegivel_premio === true;
        });
    }

    if (filtrados.length === 0) {
        tabelaFidelidade.innerHTML = `<tr><td colspan="3" class="text-center py-12 text-gray-400">
            ${fidelidadeAbaAtual === 'PREMIADOS' ? 'Nenhum cliente elegível ao prêmio no momento.' : 'Nenhum cliente cadastrado ainda. Clique em "Novo Cliente" para começar.'}
        </td></tr>`;
        return;
    }

    let htmlFinal = "";
    filtrados.forEach(c => {
        const compras = c.fidelidade?.quantidade_compras_validas ?? c.compras ?? 0;
        const elegivel = compras >= 10 || c.fidelidade?.elegivel_premio === true;
        const porcentagem = Math.min(100, Math.round((compras / 10) * 100));

        const partesNome = (c.nome || 'C').trim().split(' ');
        const iniciais = partesNome.length > 1 
            ? (partesNome[0][0] + partesNome[partesNome.length - 1][0]).toUpperCase()
            : partesNome[0].slice(0, 2).toUpperCase();

        const badgePremio = elegivel 
            ? `<span class="bg-emerald-100 text-emerald-700 font-bold px-2.5 py-0.5 rounded-full text-xs flex items-center gap-1 shadow-sm"><i data-lucide="gift" class="w-3.5 h-3.5"></i> Elegível</span>`
            : `<span class="bg-orange-50 text-orange-600 font-bold px-2 py-0.5 rounded-full text-[11px]">${10 - compras} compras para prêmio</span>`;

        const barraCor = elegivel ? "bg-emerald-500" : "bg-orange-500";
        const destaquePontos = elegivel ? "text-emerald-600 font-black" : "text-gray-800 font-black";

        const nomeEscapado = (c.nome || '').replace(/'/g, "\\'");

        const botaoResgatar = elegivel ? `
            <button onclick="resgatarPremioCliente('${c.id}', '${nomeEscapado}')" class="px-2.5 py-1.5 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 font-bold text-xs rounded-xl flex items-center gap-1 transition-all shadow-sm" title="Resgatar prêmio">
                <i data-lucide="gift" class="w-3.5 h-3.5"></i> Resgatar
            </button>
        ` : '';

        htmlFinal += `
            <tr class="hover:bg-orange-50/30 transition-colors cliente-linha" data-nome="${(c.nome || '').toLowerCase()}" data-cpf="${String(c.cpf || '').replace(/\D/g, '')}" data-telefone="${String(c.telefone || '').replace(/\D/g, '')}">
                <td class="px-6 md:px-8 py-5">
                    <div class="flex items-center gap-3">
                        <div class="w-10 h-10 rounded-2xl ${elegivel ? 'bg-emerald-100 text-emerald-700' : 'bg-orange-100 text-orange-600'} flex items-center justify-center font-black text-sm shrink-0 shadow-sm">
                            ${iniciais}
                        </div>
                        <div>
                            <p class="font-bold text-gray-800 text-sm md:text-base">${c.nome}</p>
                            <div class="flex flex-wrap items-center gap-3 mt-1 text-xs text-gray-400 font-medium">
                                <span class="flex items-center gap-1">
                                    <i data-lucide="credit-card" class="w-3.5 h-3.5 text-gray-400"></i> ${formatarCPF(c.cpf)}
                                </span>
                                <span class="flex items-center gap-1">
                                    <i data-lucide="phone" class="w-3.5 h-3.5 text-gray-400"></i> ${formatarTelefone(c.telefone)}
                                </span>
                            </div>
                        </div>
                    </div>
                </td>
                <td class="px-6 md:px-8 py-5">
                    <div class="flex flex-col gap-1.5 max-w-xs">
                        <div class="flex items-center gap-2">
                            <span class="text-base ${destaquePontos}">${compras}</span>
                            <span class="text-xs text-gray-400 font-medium">/ 10 compras</span>
                            ${badgePremio}
                        </div>
                        <div class="w-full bg-gray-100 h-2 rounded-full overflow-hidden">
                            <div class="${barraCor} h-full rounded-full transition-all duration-300" style="width: ${porcentagem}%"></div>
                        </div>
                    </div>
                </td>
                <td class="px-6 md:px-8 py-5 text-right">
                    <div class="flex justify-end items-center gap-1.5">
                        <button onclick="adicionarCompraCliente('${c.id}', '${nomeEscapado}')" class="px-2.5 py-1.5 bg-orange-50 text-orange-600 hover:bg-orange-100 font-bold text-xs rounded-xl flex items-center gap-1 transition-all" title="Registrar +1 Compra">
                            <i data-lucide="plus-circle" class="w-3.5 h-3.5"></i> +1 Compra
                        </button>
                        ${botaoResgatar}
                        <button onclick="abrirModalEdicaoCliente('${c.id}')" class="p-2 text-blue-500 hover:bg-blue-50 rounded-xl transition-colors" title="Editar dados">
                            <i data-lucide="edit-2" class="w-4 h-4"></i>
                        </button>
                        <button onclick="excluirCliente('${c.id}', '${nomeEscapado}')" class="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-colors" title="Excluir">
                            <i data-lucide="trash-2" class="w-4 h-4"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    });

    tabelaFidelidade.innerHTML = htmlFinal;
    lucide.createIcons();
}

if (tabFidelidadeTodos && tabFidelidadePremiados) {
    tabFidelidadeTodos.addEventListener('click', () => {
        tabFidelidadeTodos.className = "flex-1 py-3 text-sm font-bold rounded-xl transition-all flex items-center justify-center gap-2 bg-white text-orange-600 shadow-sm";
        tabFidelidadePremiados.className = "flex-1 py-3 text-sm font-bold rounded-xl transition-all flex items-center justify-center gap-2 text-gray-500 hover:text-gray-700";
        carregarClientes('TODOS');
    });

    tabFidelidadePremiados.addEventListener('click', () => {
        tabFidelidadePremiados.className = "flex-1 py-3 text-sm font-bold rounded-xl transition-all flex items-center justify-center gap-2 bg-white text-emerald-600 shadow-sm";
        tabFidelidadeTodos.className = "flex-1 py-3 text-sm font-bold rounded-xl transition-all flex items-center justify-center gap-2 text-gray-500 hover:text-gray-700";
        carregarClientes('PREMIADOS');
    });
}

function abrirModalCliente() {
    formCliente.reset();
    clienteIdInput.value = "";
    clienteComprasInput.value = 0;
    modalClienteTitulo.innerText = "Novo Cliente";
    modalCliente.classList.remove('hidden');
}

function fecharModalCliente() {
    modalCliente.classList.add('hidden');
}

if (btnNovoCliente) btnNovoCliente.addEventListener('click', abrirModalCliente);
if (btnCancelarModalCliente) btnCancelarModalCliente.addEventListener('click', fecharModalCliente);

if (formCliente) {
    formCliente.addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = clienteIdInput.value;
        const btnSalvar = document.getElementById('btn-salvar-cliente');
        const textoOriginal = btnSalvar.innerHTML;
        btnSalvar.innerHTML = "Salvando...";
        btnSalvar.disabled = true;

        const comprasQtd = parseInt(clienteComprasInput.value) || 0;
        const clienteData = {
            nome: clienteNomeInput.value.trim(),
            cpf: clienteCpfInput.value.trim(),
            telefone: clienteTelefoneInput.value.trim(),
            fidelidade: {
                quantidade_compras_validas: comprasQtd,
                elegivel_premio: comprasQtd >= 10
            },
            atualizado_em: new Date().toISOString()
        };

        try {
            let novoId = id;
            if (id) {
                await updateDoc(doc(db, "clientes", id), clienteData);
            } else {
                clienteData.criado_em = new Date().toISOString();
                const docRef = await addDoc(collection(db, "clientes"), clienteData);
                novoId = docRef.id;
            }
            fecharModalCliente();
            carregarClientes(fidelidadeAbaAtual);
            if (typeof carregarClientesPDV === 'function') {
                await carregarClientesPDV();
                if (pdvClienteSelect && novoId) {
                    pdvClienteSelect.value = novoId;
                    atualizarInfoClientePDV();
                }
            }
        } catch (error) {
            console.error("Erro ao salvar cliente:", error);
            alert("Erro ao salvar dados do cliente.");
        } finally {
            btnSalvar.innerHTML = textoOriginal;
            btnSalvar.disabled = false;
        }
    });
}

window.abrirModalEdicaoCliente = async function(id) {
    try {
        const docSnap = await getDoc(doc(db, "clientes", id));
        if (docSnap.exists()) {
            const c = docSnap.data();
            clienteIdInput.value = id;
            clienteNomeInput.value = c.nome || "";
            clienteCpfInput.value = formatarCPF(c.cpf || "");
            clienteTelefoneInput.value = formatarTelefone(c.telefone || "");
            clienteComprasInput.value = c.fidelidade?.quantidade_compras_validas ?? c.compras ?? 0;

            modalClienteTitulo.innerText = "Editar Cliente";
            modalCliente.classList.remove('hidden');
        }
    } catch (error) {
        console.error("Erro ao buscar cliente:", error);
    }
};

window.excluirCliente = async function(id, nome) {
    if (confirm(`Tem certeza que deseja excluir o cliente "${nome}"?`)) {
        try {
            await deleteDoc(doc(db, "clientes", id));
            carregarClientes(fidelidadeAbaAtual);
        } catch (error) {
            console.error("Erro ao excluir cliente:", error);
            alert("Erro ao excluir cliente.");
        }
    }
};

window.adicionarCompraCliente = async function(id, nome) {
    try {
        const docRef = doc(db, "clientes", id);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
            const c = docSnap.data();
            const comprasAtuais = (c.fidelidade?.quantidade_compras_validas ?? c.compras ?? 0) + 1;
            await updateDoc(docRef, {
                "fidelidade.quantidade_compras_validas": comprasAtuais,
                "fidelidade.elegivel_premio": comprasAtuais >= 10
            });
            carregarClientes(fidelidadeAbaAtual);
        }
    } catch (error) {
        console.error("Erro ao adicionar compra:", error);
    }
};

window.resgatarPremioCliente = async function(id, nome) {
    if (confirm(`Confirmar resgate do prêmio de fidelidade para ${nome}?\n\nSerão deduzidas 10 compras do saldo.`)) {
        try {
            const docRef = doc(db, "clientes", id);
            const docSnap = await getDoc(docRef);
            if (docSnap.exists()) {
                const c = docSnap.data();
                const comprasAtuais = Math.max(0, (c.fidelidade?.quantidade_compras_validas ?? c.compras ?? 10) - 10);
                await updateDoc(docRef, {
                    "fidelidade.quantidade_compras_validas": comprasAtuais,
                    "fidelidade.elegivel_premio": comprasAtuais >= 10
                });
                alert(`🎉 Prêmio resgatado com sucesso para ${nome}!`);
                carregarClientes(fidelidadeAbaAtual);
            }
        } catch (error) {
            console.error("Erro ao resgatar prêmio:", error);
        }
    }
};

if (inputPesquisaFidelidade) {
    inputPesquisaFidelidade.addEventListener('input', (e) => {
        const termo = e.target.value.toLowerCase().trim();
        const termoNumeros = termo.replace(/\D/g, '');
        const linhas = tabelaFidelidade.querySelectorAll('.cliente-linha');

        linhas.forEach(linha => {
            const nome = linha.getAttribute('data-nome') || '';
            const cpf = linha.getAttribute('data-cpf') || '';
            const tel = linha.getAttribute('data-telefone') || '';

            const matchNome = nome.includes(termo);
            const matchCpf = termoNumeros.length > 0 && cpf.includes(termoNumeros);
            const matchTel = termoNumeros.length > 0 && tel.includes(termoNumeros);

            if (matchNome || matchCpf || matchTel || termo === '') {
                linha.style.display = '';
            } else {
                linha.style.display = 'none';
            }
        });
    });
}

// ==========================================
// GESTÃO DE USUÁRIOS - ADMIN (CRUD & PESQUISA)
// ==========================================

const tabelaUsuarios = document.getElementById('tabela-usuarios');
const modalUsuario = document.getElementById('modal-usuario');
const formUsuario = document.getElementById('form-usuario');
const btnNovoUsuario = document.getElementById('btn-novo-usuario');
const btnCancelarModalUsuario = document.getElementById('btn-cancelar-modal-usuario');
const modalUsuarioTitulo = document.getElementById('modal-usuario-titulo');

const tabUsuariosTodos = document.getElementById('tab-usuarios-todos');
const tabUsuariosAdmin = document.getElementById('tab-usuarios-admin');
const tabUsuariosCaixa = document.getElementById('tab-usuarios-caixa');
const tabUsuariosEstoquista = document.getElementById('tab-usuarios-estoquista');
const inputPesquisaUsuarios = document.getElementById('input-pesquisa-usuarios');

const usuarioIdInput = document.getElementById('usuario-id');
const usuarioNomeInput = document.getElementById('usuario-nome');
const usuarioEmailInput = document.getElementById('usuario-email');
const usuarioCargoInput = document.getElementById('usuario-cargo');
const usuarioStatusInput = document.getElementById('usuario-status');
const usuarioSenhaInput = document.getElementById('usuario-senha');
const labelSenha = document.getElementById('label-senha');
const hintSenha = document.getElementById('hint-senha');

let usuariosFiltroAtual = 'TODOS';
let usuariosCache = [];

const CARGOS_CONFIG = {
    'ADMIN': {
        label: 'Administrador',
        corBadge: 'bg-purple-50 text-purple-700 border-purple-100',
        corAvatar: 'bg-purple-100 text-purple-700',
        icone: 'shield'
    },
    'CAIXA': {
        label: 'Operador de Caixa',
        corBadge: 'bg-emerald-50 text-emerald-700 border-emerald-100',
        corAvatar: 'bg-emerald-100 text-emerald-700',
        icone: 'shopping-cart'
    },
    'ESTOQUISTA': {
        label: 'Estoquista',
        corBadge: 'bg-blue-50 text-blue-700 border-blue-100',
        corAvatar: 'bg-blue-100 text-blue-700',
        icone: 'package'
    }
};

async function carregarUsuarios(filtro = usuariosFiltroAtual) {
    if (!tabelaUsuarios) return;
    usuariosFiltroAtual = filtro;
    tabelaUsuarios.innerHTML = '<tr><td colspan="4" class="text-center py-12 text-gray-400 italic">Buscando colaboradores no banco...</td></tr>';

    try {
        const snapshot = await getDocs(collection(db, "usuarios"));
        usuariosCache = [];

        // Se a coleção estiver vazia, cria os 3 perfis iniciais para demonstração (UC05)
        if (snapshot.empty) {
            const seedUsuarios = [
                { nome: "Administrador Geral", email: "admin@estocai.com", cargo: "ADMIN", ativo: true, criado_em: new Date().toISOString() },
                { nome: "Operador de Caixa", email: "caixa@estocai.com", cargo: "CAIXA", ativo: true, criado_em: new Date().toISOString() },
                { nome: "Responsável de Estoque", email: "estoque@estocai.com", cargo: "ESTOQUISTA", ativo: true, criado_em: new Date().toISOString() }
            ];

            for (const u of seedUsuarios) {
                const docRef = await addDoc(collection(db, "usuarios"), u);
                usuariosCache.push({ id: docRef.id, ...u });
            }
        } else {
            snapshot.forEach(docSnap => {
                usuariosCache.push({ id: docSnap.id, ...docSnap.data() });
            });
        }

        usuariosCache.sort((a, b) => (a.nome || '').localeCompare(b.nome || ''));
        renderizarTabelaUsuarios(usuariosCache);
    } catch (error) {
        console.error("Erro ao carregar usuários:", error);
        tabelaUsuarios.innerHTML = '<tr><td colspan="4" class="text-center py-12 text-red-500 font-bold">Erro de conexão ao carregar usuários.</td></tr>';
    }
}

function renderizarTabelaUsuarios(lista) {
    if (!tabelaUsuarios) return;

    let filtrados = lista;
    if (usuariosFiltroAtual !== 'TODOS') {
        filtrados = lista.filter(u => u.cargo === usuariosFiltroAtual);
    }

    if (filtrados.length === 0) {
        tabelaUsuarios.innerHTML = `<tr><td colspan="4" class="text-center py-12 text-gray-400">
            Nenhum colaborador encontrado nesta categoria.
        </td></tr>`;
        return;
    }

    let htmlFinal = "";
    filtrados.forEach(u => {
        const cargoCfg = CARGOS_CONFIG[u.cargo] || CARGOS_CONFIG['CAIXA'];
        const ativo = u.ativo !== false;

        const partesNome = (u.nome || 'U').trim().split(' ');
        const iniciais = partesNome.length > 1
            ? (partesNome[0][0] + partesNome[partesNome.length - 1][0]).toUpperCase()
            : partesNome[0].slice(0, 2).toUpperCase();

        const statusBadge = ativo
            ? `<button onclick="alternarStatusUsuario('${u.id}', true)" class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-green-50 text-green-700 border border-green-200 hover:bg-green-100 transition-all shadow-sm" title="Clique para desativar"><span class="w-2 h-2 rounded-full bg-green-500"></span> Ativo</button>`
            : `<button onclick="alternarStatusUsuario('${u.id}', false)" class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-gray-100 text-gray-500 border border-gray-200 hover:bg-gray-200 transition-all shadow-sm" title="Clique para ativar"><span class="w-2 h-2 rounded-full bg-gray-400"></span> Inativo</button>`;

        const nomeEscapado = (u.nome || '').replace(/'/g, "\\'");

        htmlFinal += `
            <tr class="hover:bg-orange-50/30 transition-colors usuario-linha" data-nome="${(u.nome || '').toLowerCase()}" data-email="${(u.email || '').toLowerCase()}" data-cargo="${(cargoCfg.label || '').toLowerCase()}">
                <td class="px-6 md:px-8 py-5">
                    <div class="flex items-center gap-3">
                        <div class="w-10 h-10 rounded-2xl ${cargoCfg.corAvatar} flex items-center justify-center font-black text-sm shrink-0 shadow-sm">
                            ${iniciais}
                        </div>
                        <div>
                            <p class="font-bold text-gray-800 text-sm md:text-base">${u.nome}</p>
                            <p class="text-xs text-gray-400 font-medium flex items-center gap-1 mt-0.5">
                                <i data-lucide="mail" class="w-3 h-3 text-gray-400"></i> ${u.email}
                            </p>
                        </div>
                    </div>
                </td>
                <td class="px-6 md:px-8 py-5">
                    <span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border ${cargoCfg.corBadge} shadow-sm">
                        <i data-lucide="${cargoCfg.icone}" class="w-3.5 h-3.5"></i> ${cargoCfg.label}
                    </span>
                </td>
                <td class="px-6 md:px-8 py-5">
                    ${statusBadge}
                </td>
                <td class="px-6 md:px-8 py-5 text-right">
                    <div class="flex justify-end items-center gap-2">
                        <button onclick="abrirModalEdicaoUsuario('${u.id}')" class="p-2 text-blue-500 hover:bg-blue-50 rounded-xl transition-colors" title="Editar dados e permissões">
                            <i data-lucide="edit-2" class="w-4 h-4"></i>
                        </button>
                        <button onclick="excluirUsuario('${u.id}', '${nomeEscapado}')" class="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-colors" title="Excluir usuário">
                            <i data-lucide="trash-2" class="w-4 h-4"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    });

    tabelaUsuarios.innerHTML = htmlFinal;
    lucide.createIcons();
}

// Alternar abas de filtro de usuários
const tabsConfig = [
    { el: tabUsuariosTodos, filtro: 'TODOS' },
    { el: tabUsuariosAdmin, filtro: 'ADMIN' },
    { el: tabUsuariosCaixa, filtro: 'CAIXA' },
    { el: tabUsuariosEstoquista, filtro: 'ESTOQUISTA' }
];

tabsConfig.forEach(({ el, filtro }) => {
    if (el) {
        el.addEventListener('click', () => {
            tabsConfig.forEach(t => {
                if (t.el) {
                    t.el.className = "flex-1 min-w-[100px] py-2.5 text-xs md:text-sm font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 text-gray-500 hover:text-gray-700";
                }
            });
            el.className = "flex-1 min-w-[100px] py-2.5 text-xs md:text-sm font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 bg-white text-orange-600 shadow-sm";
            carregarUsuarios(filtro);
        });
    }
});

// Modal de Usuário
function abrirModalNovoUsuario() {
    formUsuario.reset();
    usuarioIdInput.value = "";
    modalUsuarioTitulo.innerText = "Novo Usuário";
    labelSenha.innerText = "Senha Provisória";
    hintSenha.innerText = "(mínimo 6 caracteres)";
    usuarioSenhaInput.required = true;
    modalUsuario.classList.remove('hidden');
}

function fecharModalUsuario() {
    modalUsuario.classList.add('hidden');
}

if (btnNovoUsuario) btnNovoUsuario.addEventListener('click', abrirModalNovoUsuario);
if (btnCancelarModalUsuario) btnCancelarModalUsuario.addEventListener('click', fecharModalUsuario);

if (formUsuario) {
    formUsuario.addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = usuarioIdInput.value;
        const btnSalvar = document.getElementById('btn-salvar-usuario');
        const textoOriginal = btnSalvar.innerHTML;
        btnSalvar.innerHTML = "Salvando...";
        btnSalvar.disabled = true;

        const dadosUsuario = {
            nome: usuarioNomeInput.value.trim(),
            email: usuarioEmailInput.value.trim().toLowerCase(),
            cargo: usuarioCargoInput.value,
            ativo: usuarioStatusInput.value === 'true',
            atualizado_em: new Date().toISOString()
        };

        try {
            if (id) {
                // Se preencheu senha na edição, atualiza
                if (usuarioSenhaInput.value.trim()) {
                    dadosUsuario.senha_atualizada = true;
                }
                await updateDoc(doc(db, "usuarios", id), dadosUsuario);
            } else {
                dadosUsuario.criado_em = new Date().toISOString();
                await addDoc(collection(db, "usuarios"), dadosUsuario);
            }
            fecharModalUsuario();
            carregarUsuarios(usuariosFiltroAtual);
        } catch (error) {
            console.error("Erro ao salvar usuário:", error);
            alert("Erro ao salvar usuário. Verifique suas permissões.");
        } finally {
            btnSalvar.innerHTML = textoOriginal;
            btnSalvar.disabled = false;
        }
    });
}

window.abrirModalEdicaoUsuario = async function(id) {
    try {
        const docSnap = await getDoc(doc(db, "usuarios", id));
        if (docSnap.exists()) {
            const u = docSnap.data();
            usuarioIdInput.value = id;
            usuarioNomeInput.value = u.nome || "";
            usuarioEmailInput.value = u.email || "";
            usuarioCargoInput.value = u.cargo || "CAIXA";
            usuarioStatusInput.value = u.ativo !== false ? "true" : "false";
            usuarioSenhaInput.value = "";
            usuarioSenhaInput.required = false;
            labelSenha.innerText = "Nova Senha";
            hintSenha.innerText = "(deixe em branco para manter a atual)";

            modalUsuarioTitulo.innerText = "Editar Usuário";
            modalUsuario.classList.remove('hidden');
        }
    } catch (error) {
        console.error("Erro ao buscar dados do usuário:", error);
    }
};

window.alternarStatusUsuario = async function(id, statusAtual) {
    try {
        await updateDoc(doc(db, "usuarios", id), {
            ativo: !statusAtual,
            atualizado_em: new Date().toISOString()
        });
        carregarUsuarios(usuariosFiltroAtual);
    } catch (error) {
        console.error("Erro ao alterar status do usuário:", error);
        alert("Erro ao alterar status.");
    }
};

window.excluirUsuario = async function(id, nome) {
    if (confirm(`Tem certeza que deseja revogar o acesso e excluir permanentemente o usuário "${nome}"?`)) {
        try {
            await deleteDoc(doc(db, "usuarios", id));
            carregarUsuarios(usuariosFiltroAtual);
        } catch (error) {
            console.error("Erro ao excluir usuário:", error);
            alert("Erro ao excluir usuário.");
        }
    }
};

// Pesquisa dinâmica de usuários
if (inputPesquisaUsuarios) {
    inputPesquisaUsuarios.addEventListener('input', (e) => {
        const termo = e.target.value.toLowerCase().trim();
        const linhas = tabelaUsuarios.querySelectorAll('.usuario-linha');

        linhas.forEach(linha => {
            const nome = linha.getAttribute('data-nome') || '';
            const email = linha.getAttribute('data-email') || '';
            const cargo = linha.getAttribute('data-cargo') || '';

            const match = nome.includes(termo) || email.includes(termo) || cargo.includes(termo);

            if (match || termo === '') {
                linha.style.display = '';
            } else {
                linha.style.display = 'none';
            }
        });
    });
}