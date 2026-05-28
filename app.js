// IMPORTAÇÕES DO FIREBASE
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-app.js";
import { getFirestore, collection, getDocs, doc, getDoc, updateDoc } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-auth.js";
import { firebaseConfig } from './firebase-config.js'; 

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

lucide.createIcons();

// CONTROLE DE INTERFACE & LOGIN OFICIAL
const loginScreen = document.getElementById('login-screen');
const dashboardScreen = document.getElementById('dashboard-screen');
const loginForm = document.getElementById('login-form');
const btnLogout = document.getElementById('btn-logout');

//Observador de Sessão
onAuthStateChanged(auth, (user) => {
    if (user) {
        // Logado
        loginScreen.classList.add('hidden');
        dashboardScreen.classList.remove('hidden');
        dashboardScreen.classList.add('flex');
        carregarProdutosPDV();
    } else {
        dashboardScreen.classList.add('hidden');
        dashboardScreen.classList.remove('flex');
        loginScreen.classList.remove('hidden');
    }
});

//Login
loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const emailInput = loginForm.querySelectorAll('input')[0].value;
    const passwordInput = loginForm.querySelectorAll('input')[1].value;
    const btnLogin = loginForm.querySelector('button');
    
    const textoOriginal = btnLogin.innerText;
    btnLogin.innerText = "Autenticando...";
    btnLogin.disabled = true;

    try {
        //verificação real no Firebase Auth
        await signInWithEmailAndPassword(auth, emailInput, passwordInput);

    } catch (error) {
        console.error("Erro no login:", error);
        alert("Acesso negado! Verifique seu e-mail e senha.");
    } finally {
        btnLogin.innerText = textoOriginal;
        btnLogin.disabled = false;
    }
});

//Logout
btnLogout.addEventListener('click', async () => {
    try {
        await signOut(auth);
    } catch (error) {
        console.error("Erro ao sair:", error);
    }
});

const navBtns = document.querySelectorAll('.nav-btn');
const views = {
    'vendas': document.getElementById('view-vendas'),
    'estoque': document.getElementById('view-estoque'),
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

        Object.values(views).forEach(view => {
            if (view) view.classList.add('hidden');
        });

        const targetView = btn.getAttribute('data-target');
        if (views[targetView]) {
            views[targetView].classList.remove('hidden');
            lucide.createIcons(); 
            
            if (targetView === 'estoque') {
                const tabDia = document.getElementById('tab-estoque-dia');
                if(tabDia) tabDia.click();
            } else if (targetView === 'vendas') {
                carregarProdutosPDV();
            }
        }
    });
});

// PDV (PONTO DE VENDA) E CARRINHO
const pdvProdutos = document.getElementById('pdv-produtos');
const pdvCarrinho = document.getElementById('pdv-carrinho');
const carrinhoVazio = document.getElementById('carrinho-vazio');
const pdvTotal = document.getElementById('pdv-total');
const badgeItens = document.getElementById('badge-itens');
const btnLimparCarrinho = document.getElementById('btn-limpar-carrinho');
const btnFinalizarVenda = document.getElementById('btn-finalizar-venda');

let carrinho = [];

async function carregarProdutosPDV() {
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

        if (produtosCarregados === 0) {
            pdvProdutos.innerHTML = '<p class="text-gray-400 italic col-span-full">Nenhum produto com preço disponível para venda.</p>';
        }
    } catch (error) {
        console.error("Erro ao carregar PDV:", error);
        pdvProdutos.innerHTML = '<p class="text-red-500 col-span-full">Erro ao conectar com o banco de dados.</p>';
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

if (btnFinalizarVenda) {
    btnFinalizarVenda.addEventListener('click', async () => {
        if (carrinho.length === 0) {
            alert("O carrinho está vazio!");
            return;
        }

        if (!confirm("Confirmar venda e abater estoque?")) return;

        btnFinalizarVenda.innerText = "Processando...";
        btnFinalizarVenda.disabled = true;

        try {
            for (const item of carrinho) {
                const produtoRef = doc(db, "produtos", item.id);
                const produtoSnap = await getDoc(produtoRef);

                if (produtoSnap.exists()) {
                    const novoEstoque = produtoSnap.data().estoque - item.quantidade;
                    await updateDoc(produtoRef, { estoque: novoEstoque });
                }
            }
            alert("Venda finalizada com sucesso!");
            carrinho = [];
            atualizarTelaCarrinho();
            await carregarProdutosPDV();
        } catch (error) {
            console.error("Erro na venda:", error);
            alert("Erro ao atualizar o estoque.");
        } finally {
            btnFinalizarVenda.innerHTML = `<i data-lucide="check-circle" class="w-5 h-5"></i> Finalizar Venda`;
            btnFinalizarVenda.disabled = false;
            lucide.createIcons();
        }
    });
}

// INVENTÁRIO DE ESTOQUE
async function carregarEstoque(tipoEstoque = 'DIA') {
    const tabela = document.getElementById('tabela-estoque');
    if (!tabela) return;

    tabela.innerHTML = '<tr><td colspan="3" class="text-center py-12 text-gray-400 italic">Buscando dados no banco...</td></tr>';

    try {
        const snapshot = await getDocs(collection(db, "produtos"));
        let htmlFinal = "";
        let contagem = 0;

        snapshot.forEach(doc => {
            const p = doc.data();
            
            if (p.tipo_estoque === tipoEstoque) {
                contagem++;
                
                const subTexto = tipoEstoque === 'DIA' 
                    ? `<p class="text-[10px] text-gray-400 uppercase font-medium mt-1">${p.categoria} • R$ ${p.preco?.toFixed(2)}</p>`
                    : `<p class="text-[10px] text-blue-400 uppercase font-bold mt-1">Matéria-Prima</p>`;
                
                const nomeAtivoClass = p.ativo ? "text-gray-800" : "text-gray-400 line-through";
                const alertaEstoque = p.estoque < 5 ? "text-red-500" : "text-gray-700";

                htmlFinal += `
                    <tr class="hover:bg-orange-50/30 transition-colors">
                        <td class="px-6 md:px-8 py-6">
                            <p class="font-bold ${nomeAtivoClass} text-sm md:text-base">${p.nome}</p>
                            ${subTexto}
                        </td>
                        <td class="px-6 md:px-8 py-6">
                            <span class="font-black text-lg ${alertaEstoque}">
                                ${p.estoque} <span class="text-sm font-medium text-gray-400">${p.unidade}</span>
                            </span>
                        </td>
                        <td class="px-6 md:px-8 py-6 text-right">
                            <div class="flex justify-end gap-2">
                                <button class="p-2 text-blue-400 hover:bg-blue-50 rounded-lg transition-colors" title="Editar">
                                    <i data-lucide="edit-2" class="w-4 h-4"></i>
                                </button>
                                <button class="p-2 text-red-300 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors" title="Excluir">
                                    <i data-lucide="trash-2" class="w-4 h-4"></i>
                                </button>
                            </div>
                        </td>
                    </tr>
                `;
            }
        });

        if (contagem === 0) {
            tabela.innerHTML = '<tr><td colspan="3" class="text-center py-12 text-gray-400">Nenhum item nesta categoria.</td></tr>';
        } else {
            tabela.innerHTML = htmlFinal;
        }
        lucide.createIcons();
    } catch (error) {
        console.error("Erro ao ler estoque:", error);
        tabela.innerHTML = '<tr><td colspan="3" class="text-center py-12 text-red-500 font-bold">Erro de conexão.</td></tr>';
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
            text: urlCardapio,
            width: 220,
            height: 220,
            colorDark : "#1f2937",
            colorLight : "#ffffff",
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
                    <head>
                        <title>QR Code - O Brasinha</title>
                        <style>
                            body { display: flex; flex-direction: column; justify-content: center; align-items: center; height: 100vh; margin: 0; font-family: sans-serif; text-align: center; }
                            h1 { color: #ea580c; font-size: 40px; margin-bottom: 10px; }
                            p { color: #666; font-size: 20px; margin-bottom: 30px; }
                            img { width: 300px; height: 300px; }
                        </style>
                    </head>
                    <body>
                        <h1>O Brasinha</h1>
                        <p>Escaneie para ver o cardápio</p>
                        <img src="${qrDataUrl}" />
                    </body>
                </html>
            `);
            printWindow.document.close();
            printWindow.focus();
            
            setTimeout(() => {
                printWindow.print();
                printWindow.close();
            }, 300);
        }
    });
}