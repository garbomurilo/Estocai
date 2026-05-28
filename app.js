// IMPORTAÇÕES DO FIREBASE
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-app.js";
import { getFirestore, collection, getDocs } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";
import { firebaseConfig } from './firebase-config.js'; 

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Inicia os ícones
lucide.createIcons();


// CONTROLE DE INTERFACE (Login e Navegação)
const loginScreen = document.getElementById('login-screen');
const dashboardScreen = document.getElementById('dashboard-screen');
const loginForm = document.getElementById('login-form');
const btnLogout = document.getElementById('btn-logout');

// Login
loginForm.addEventListener('submit', (e) => {
    e.preventDefault();
    loginScreen.classList.add('hidden');
    dashboardScreen.classList.remove('hidden');
    dashboardScreen.classList.add('flex');
});

// Logout
btnLogout.addEventListener('click', () => {
    dashboardScreen.classList.add('hidden');
    dashboardScreen.classList.remove('flex');
    loginScreen.classList.remove('hidden');
});

// Lógica das Abas do Menu Lateral
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
            }
        }
    });
});

//GESTÃO DE ESTOQUE (Firebase)
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
        tabela.innerHTML = '<tr><td colspan="3" class="text-center py-12 text-red-500 font-bold">Erro ao conectar com o servidor.</td></tr>';
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