// Importações expandidas do Firebase
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore, collection, getDocs, addDoc, doc, updateDoc, runTransaction } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// Chaves de conexão
const firebaseConfig = {
    apiKey: "ChaveAPI",
    authDomain: "brasiinha.firebaseapp.com",
    projectId: "brasiinha",
    storageBucket: "brasiinha.firebasestorage.app",
    messagingSenderId: "350909634462",
    appId: "1:350909634462:web:2089933774456a531de88f",
    measurementId: "G-ZMS60JRF0N"
};

// Inicialização Principal do Firebase 
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

document.addEventListener("DOMContentLoaded", () => {
    lucide.createIcons();
});

const loginContainer = document.getElementById('login-container');
const sistemaContainer = document.getElementById('sistema-container');
const formLogin = document.getElementById('form-login');
const msgErro = document.getElementById('mensagem-erro');
const btnLogin = document.getElementById('btn-login');

// Teste Visual do Banco
try {
    const statusText = document.getElementById("status-banco");
    statusText.innerText = "Online e Operante!";
    statusText.classList.add("text-green-600"); 
    console.log("Banco de Dados conectado com sucesso!");
} catch (erro) {
    console.error("Erro ao atualizar status visual:", erro);
}

async function verificarEInicializarBanco() {
    try {
        const produtosRef = collection(db, "produtos");
        const snapshot = await getDocs(produtosRef);
        
        if (snapshot.empty) {
            console.log(" Banco vazio detectado! Populando Firestore com os dados do protótipo...");
            
            // Cadastra a Matéria-Prima (Estoque Geral)
            const mpFrango = await addDoc(produtosRef, { nome: 'Frango Cru Inteiro', estoque: 40, unidade: 'un', tipo_estoque: 'GERAL', ativo: true });
            const mpOleo = await addDoc(produtosRef, { nome: 'Óleo de Soja (900ml)', estoque: 15, unidade: 'un', tipo_estoque: 'GERAL', ativo: true });
            const mpBatata = await addDoc(produtosRef, { nome: 'Batata Inglesa', estoque: 25, unidade: 'kg', tipo_estoque: 'GERAL', ativo: true });
            const mpEmbalagem = await addDoc(produtosRef, { nome: 'Embalagem Frango (Térmica)', estoque: 150, unidade: 'un', tipo_estoque: 'GERAL', ativo: true });

            // Cadastra os Produtos de Venda (Estoque Dia)
            await addDoc(produtosRef, {
                nome: 'Frango Assado Especial',
                preco: 45.00,
                categoria: 'Assados',
                estoque: 15,
                unidade: 'un',
                tipo_estoque: 'DIA',
                ativo: true,
                ingredientes: 'Frango inteiro, sal, alho, especiarias secretas da casa.',
                alergicos: '',
                receita: [{ id_materia: mpFrango.id, qtd: 1 }, { id_materia: mpEmbalagem.id, qtd: 1 }]
            });

            await addDoc(produtosRef, {
                nome: 'Maionese da Casa (500g)',
                preco: 18.00,
                categoria: 'Acompanhamentos',
                estoque: 8,
                unidade: 'un',
                tipo_estoque: 'DIA',
                ativo: true,
                ingredientes: 'Batata, cenoura, maionese tradicional, cheiro verde.',
                alergicos: 'Contém Ovo e derivados de Soja',
                receita: [{ id_materia: mpBatata.id, qtd: 0.25 }]
            });

            await addDoc(produtosRef, {
                nome: 'Farofa Crocante',
                preco: 12.00,
                categoria: 'Acompanhamentos',
                estoque: 25,
                unidade: 'un',
                tipo_estoque: 'DIA',
                ativo: true,
                ingredientes: 'Farinha de mandioca temperada, bacon, calabresa, cebola, alho.',
                alergicos: 'Contém Glúten (traços) e Derivados de Porco',
                receita: []
            });

            console.log(" Firestore alimentado com sucesso!");
        }
    } catch (error) {
        console.error("Erro ao popular o banco inicial:", error);
    }
}

async function carregarCardapioReal() {
    const listaProdutosContainer = document.getElementById("lista-produtos");
    if (!listaProdutosContainer) return;

    listaProdutosContainer.innerHTML = '<p class="text-gray-400 italic col-span-full text-center py-6">Consultando Cloud Firestore...</p>';

    try {
        const produtosRef = collection(db, "produtos");
        const snapshot = await getDocs(produtosRef);
        
        let produtosDia = [];

        // Filtra documentos que são do tipo DIA
        snapshot.forEach(doc => {
            const data = doc.data();
            if (data.tipo_estoque === 'DIA' && data.ativo) {
                produtosDia.push({ id: doc.id, ...data });
            }
        });

        if (produtosDia.length === 0) {
            listaProdutosContainer.innerHTML = '<div class="text-center py-20 text-gray-400 col-span-full">Nenhum produto cadastrado ou ativo no cardápio.</div>';
            return;
        }

        const categorias = [...new Set(produtosDia.map(p => p.categoria))];
        let htmlFinal = "";

        categorias.forEach(cat => {
            htmlFinal += `
                <div class="col-span-full mt-6">
                    <h3 class="text-xs font-black text-orange-400 uppercase tracking-[0.2em] mb-2 ml-2">${cat}</h3>
                    <div class="h-[1px] bg-gray-100 w-full mb-4"></div>
                </div>
            `;
            
            const produtosDaCategoria = produtosDia.filter(p => p.categoria === cat);
            
            produtosDaCategoria.forEach(product => {
                const alertHtml = product.alergicos ? `
                    <div class="mt-2 inline-flex items-start gap-1 p-2 bg-red-50 rounded-lg border border-red-100">
                        <i data-lucide="alert-circle" class="w-3 h-3 text-red-500 mt-[2px] shrink-0"></i>
                        <span class="text-[10px] text-red-700 uppercase tracking-widest">
                            Obs: <strong class="font-black">${product.alergicos}</strong>
                        </span>
                    </div>
                ` : '';

                htmlFinal += `
                    <div class="bg-white p-6 rounded-[32px] border border-orange-50 shadow-sm flex justify-between items-start group transition-all hover:border-orange-200">
                        <div class="space-y-2 pr-4 flex-1">
                            <p class="font-bold text-gray-800 text-lg leading-tight">${product.nome}</p>
                            <p class="text-xs text-gray-500 leading-relaxed mt-1">${product.ingredientes || ''}</p>
                            ${alertHtml}
                            <p class="text-2xl font-black text-orange-600 mt-3 block">R$ ${product.preco.toFixed(2)}</p>
                        </div>
                        <button class="p-3 bg-gray-50 text-gray-400 rounded-2xl hover:bg-orange-600 hover:text-white transition-all opacity-0 group-hover:opacity-100 shrink-0" title="Editar Item">
                            <i data-lucide="edit-2" class="w-4 h-4"></i>
                        </button>
                    </div>
                `;
            });
        });

        listaProdutosContainer.innerHTML = htmlFinal;
        lucide.createIcons();
        
    } catch (error) {
        console.error("Erro ao renderizar cardápio do Firestore:", error);
        listaProdutosContainer.innerHTML = '<p class="text-red-500 font-bold text-center col-span-full">Erro crítico ao carregar dados do banco de dados.</p>';
    }
}

formLogin.addEventListener('submit', (e) => {
    e.preventDefault();
    
    const email = document.getElementById('email').value;
    const senha = document.getElementById('senha').value;
    btnLogin.innerText = "Verificando...";

    signInWithEmailAndPassword(auth, email, senha)
        .then(() => {
            msgErro.innerText = "";
            btnLogin.innerText = "ENTRAR NO SISTEMA";
        })
        .catch((error) => {
            msgErro.innerText = "E-mail ou senha inválidos.";
            btnLogin.innerText = "ENTRAR NO SISTEMA";
            console.error(error);
        });
});

document.getElementById('btn-sair').addEventListener('click', () => {
    signOut(auth).catch((error) => console.error("Erro ao deslogar:", error));
});

onAuthStateChanged(auth, async (user) => {
    if (user) {
        loginContainer.classList.add('hidden');
        sistemaContainer.classList.remove('hidden');
        
        // Verifica se precisa criar os dados iniciais no Firestore
        await verificarEInicializarBanco();
        
        lucide.createIcons();
    } else {
        loginContainer.classList.remove('hidden');
        sistemaContainer.classList.add('hidden');
        document.getElementById('senha').value = ''; 
    }
});

// Lógica de Navegação
const navBtns = document.querySelectorAll('.nav-btn');
const views = {
    inicio: document.getElementById('view-inicio'),
    vendas: document.getElementById('view-vendas'),
    cardapio: document.getElementById('view-cardapio'),
    estoque: document.getElementById('view-estoque'),
    clientes: document.getElementById('view-clientes')
};

navBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
        const targetView = e.currentTarget.getAttribute('data-view');
        
        navBtns.forEach(b => {
            b.classList.remove('bg-orange-600', 'text-white', 'shadow-md');
            b.classList.add('text-gray-400');
        });
        
        e.currentTarget.classList.remove('text-gray-400');
        e.currentTarget.classList.add('bg-orange-600', 'text-white', 'shadow-md');

        Object.values(views).forEach(v => {
            if (v) v.classList.add('hidden');
        });
        
        if (views[targetView]) {
            views[targetView].classList.remove('hidden');
            lucide.createIcons(); 
            
            if (targetView === 'cardapio') {
                carregarCardapioReal();
            } else if (targetView === 'estoque') {
                const tabDia = document.getElementById('tab-estoque-dia');
                if(tabDia) tabDia.click();
            }
        }
    });

});

// LÓGICA DO QR CODE
const btnShowQr = document.getElementById('btn-show-qr');
const btnCloseQr = document.getElementById('btn-close-qr');
const modalQr = document.getElementById('modal-qr');
const qrCodeImg = document.getElementById('qr-code-img');

if (btnShowQr) {
    btnShowQr.addEventListener('click', () => {
        //aponta para o cardapio.html
        const urlCardapio = window.location.origin + "/cardapio.html";
        
        //Consome uma API pública para gerar o desenho do QR Code em tempo real
        qrCodeImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(urlCardapio)}&color=ea580c`;
        
        modalQr.classList.remove('hidden');
    });
}

if (btnCloseQr) {
    btnCloseQr.addEventListener('click', () => {
        modalQr.classList.add('hidden');
    });
}

// GESTÃO DE ESTOQUE
async function carregarEstoque(tipoEstoque = 'DIA') {
    const tabela = document.getElementById('tabela-estoque');
    if (!tabela) return;

    tabela.innerHTML = '<tr><td colspan="3" class="text-center py-12 text-gray-400 italic">Buscando dados no Firestore...</td></tr>';

    try {
        const snapshot = await getDocs(collection(db, "produtos"));
        let htmlFinal = "";
        let contagem = 0;

        snapshot.forEach(doc => {
            const p = doc.data();
            
            // Filtra se queremos exibir 'DIA' ou 'GERAL'
            if (p.tipo_estoque === tipoEstoque) {
                contagem++;
                
                // Formatação condicional baseada no tipo de estoque
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
                                <button class="p-2 text-blue-400 hover:bg-blue-50 rounded-lg transition-colors" title="Editar Item">
                                    <i data-lucide="edit-2" class="w-4 h-4"></i>
                                </button>
                                <button class="p-2 text-red-300 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors" title="Excluir Item">
                                    <i data-lucide="trash-2" class="w-4 h-4"></i>
                                </button>
                            </div>
                        </td>
                    </tr>
                `;
            }
        });

        if (contagem === 0) {
            tabela.innerHTML = '<tr><td colspan="3" class="text-center py-12 text-gray-400">Nenhum item encontrado nesta categoria.</td></tr>';
        } else {
            tabela.innerHTML = htmlFinal;
        }
        
        lucide.createIcons();

    } catch (error) {
        console.error("Erro ao ler estoque:", error);
        tabela.innerHTML = '<tr><td colspan="3" class="text-center py-12 text-red-500 font-bold">Erro ao carregar banco de dados.</td></tr>';
    }
}

// Lógica de clique nas Abas
const tabDia = document.getElementById('tab-estoque-dia');
const tabGeral = document.getElementById('tab-estoque-geral');

if(tabDia && tabGeral) {
    tabDia.addEventListener('click', () => {
        // Estilo Ativo para DIA
        tabDia.className = "flex-1 py-3 text-sm font-bold rounded-xl transition-all flex items-center justify-center gap-2 bg-white text-orange-600 shadow-sm";
        tabGeral.className = "flex-1 py-3 text-sm font-bold rounded-xl transition-all flex items-center justify-center gap-2 text-gray-500 hover:text-gray-700";
        carregarEstoque('DIA');
    });

    tabGeral.addEventListener('click', () => {
        // Estilo Ativo para GERAL
        tabGeral.className = "flex-1 py-3 text-sm font-bold rounded-xl transition-all flex items-center justify-center gap-2 bg-white text-blue-600 shadow-sm";
        tabDia.className = "flex-1 py-3 text-sm font-bold rounded-xl transition-all flex items-center justify-center gap-2 text-gray-500 hover:text-gray-700";
        carregarEstoque('GERAL');
    });
}
