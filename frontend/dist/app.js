// IMPORTAÇÕES DO FIREBASE (Apenas Auth no Front-end para obter idToken; 100% dos dados trafegam via API REST Node.js/Express)
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-app.js";
import { 
    getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged, createUserWithEmailAndPassword 
} from "https://www.gstatic.com/firebasejs/9.6.1/firebase-auth.js";
import { firebaseConfig } from './firebase-config.js'; 

const app = initializeApp(firebaseConfig);
const auth = getAuth(app); 

// Base URL da API: funciona tanto em http://localhost:3000 quanto via Live Server (ex: porta 5500)
const API_BASE_URL = (window.location.port && window.location.port !== '3000')
    ? 'http://localhost:3000'
    : '';

// Helper centralizado para chamadas autenticadas com Token JWT à API REST
async function apiRequest(endpoint, options = {}) {
    const user = auth.currentUser;
    if (!user) {
        throw new Error("Usuário não autenticado.");
    }
    const token = await user.getIdToken();
    const headers = {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`,
        ...(options.headers || {})
    };

    const config = {
        method: options.method || "GET",
        headers
    };

    if (options.body !== undefined) {
        config.body = typeof options.body === "string" ? options.body : JSON.stringify(options.body);
    }

    const url = endpoint.startsWith('http') ? endpoint : `${API_BASE_URL}${endpoint}`;
    const response = await fetch(url, config);
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
        throw new Error(data.error || `Erro HTTP ${response.status}`);
    }
    return data;
}

// MULTI-TENANT HELPERS: Garante o isolamento completo dos dados por negócio (/tenants/{tenantId})
export function getTenantId() {
    return window.usuarioAtual?.tenantId || auth.currentUser?.uid || 'default';
}

export function getCardapioUrl() {
    const tid = getTenantId();
    const baseUrl = window.location.origin + window.location.pathname.replace('index.html', '') + 'cardapio.html';
    return `${baseUrl}?tenant=${encodeURIComponent(tid)}`;
}

export function atualizarLinksCardapio() {
    const url = getCardapioUrl();
    const inputQrUrl = document.getElementById('qr-url-input');
    if (inputQrUrl) inputQrUrl.value = url;

    const linksCardapio = document.querySelectorAll('a[href*="cardapio.html"]');
    linksCardapio.forEach(link => {
        link.href = url;
    });
}

// CONFIGURAÇÃO DOS CARGOS / PERFIS DO SISTEMA (CRITÉRIO 6 - RBAC)
export const CARGOS_CONFIG = {
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
        label: 'Repositor de Estoque',
        corBadge: 'bg-blue-50 text-blue-700 border-blue-100',
        corAvatar: 'bg-blue-100 text-blue-700',
        icone: 'package'
    }
};

export function normalizarCargo(cargo) {
    const valor = String(cargo || '').trim().toUpperCase();
    if (valor === 'ADMIN' || valor === 'ADM') return 'ADMIN';
    if (valor === 'ESTOQUISTA' || valor === 'REPOSITOR') return 'ESTOQUISTA';
    if (valor === 'CAIXA') return 'CAIXA';
    return '';
}

export function isPerfilPermitidoNaView(cargo, viewName) {
    const role = normalizarCargo(cargo);
    if (role === 'ADMIN') return true;
    if (role === 'ESTOQUISTA') {
        return viewName === 'estoque';
    }
    if (role === 'CAIXA') {
        return ['vendas', 'fidelidade', 'cardapio', 'qrcode'].includes(viewName);
    }
    return false;
}

// ESTADO GLOBAL DO USUÁRIO LOGADO
window.usuarioAtual = null;
let emProcessoDeRegistro = false;

lucide.createIcons();

// ELEMENTOS DE INTERFACE E AUTENTICAÇÃO
const loginScreen = document.getElementById('login-screen');
const dashboardScreen = document.getElementById('dashboard-screen');
const loginForm = document.getElementById('login-form');
const registerForm = document.getElementById('register-form');
const btnLogout = document.getElementById('btn-logout');

const tabAuthLogin = document.getElementById('tab-auth-login');
const tabAuthRegister = document.getElementById('tab-auth-register');
const btnToggleToRegister = document.getElementById('btn-toggle-to-register');
const btnToggleToLogin = document.getElementById('btn-toggle-to-login');

const loginErrorMsg = document.getElementById('login-error-msg');
const loginErrorText = document.getElementById('login-error-text');
const registerErrorMsg = document.getElementById('register-error-msg');
const registerErrorText = document.getElementById('register-error-text');

// FUNÇÕES DE FEEDBACK DE ERRO E MODAL DE APROVAÇÃO PENDENTE
function mostrarErroLogin(mensagem = "Credenciais inválidas. Verifique seu e-mail e senha.") {
    if (loginErrorMsg) {
        loginErrorText.innerText = mensagem;
        loginErrorMsg.classList.remove('hidden');
        lucide.createIcons();
    }
}

function esconderErroLogin() {
    if (loginErrorMsg) {
        loginErrorMsg.classList.add('hidden');
    }
}

function mostrarErroRegister(mensagem) {
    if (registerErrorMsg) {
        registerErrorText.innerText = mensagem;
        registerErrorMsg.classList.remove('hidden');
        lucide.createIcons();
    }
}

function esconderErroRegister() {
    if (registerErrorMsg) {
        registerErrorMsg.classList.add('hidden');
    }
}

// [FLUXO DE APROVAÇÃO] Exibe modal amigável após cadastro informando que a conta passará por análise
function mostrarModalCadastroPendente(
    mensagem = "Cadastro realizado com sucesso! Sua conta passará por uma análise e você será liberado em breve."
) {
    let modal = document.getElementById('modal-cadastro-pendente');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'modal-cadastro-pendente';
        modal.className = 'fixed inset-0 bg-gray-900/40 backdrop-blur-sm z-50 flex items-center justify-center fade-in px-4';
        modal.innerHTML = `
            <div class="bg-white rounded-[32px] p-8 w-full max-w-md shadow-2xl border border-orange-100 text-center">
                <div class="w-16 h-16 bg-amber-100 text-amber-600 rounded-2xl flex items-center justify-center mx-auto mb-5 shadow-sm">
                    <i data-lucide="clock" class="w-8 h-8"></i>
                </div>
                <h3 class="text-xl font-black text-gray-800 tracking-tight mb-2">Aguardando Aprovação</h3>
                <p id="texto-modal-cadastro-pendente" class="text-sm text-gray-600 font-medium leading-relaxed mb-6"></p>
                <button type="button" id="btn-fechar-modal-pendente" class="w-full bg-orange-600 text-white font-bold py-3.5 rounded-xl hover:bg-orange-700 transition-all shadow-lg shadow-orange-600/30">
                    Entendi
                </button>
            </div>
        `;
        document.body.appendChild(modal);
        modal.querySelector('#btn-fechar-modal-pendente').addEventListener('click', () => {
            modal.classList.add('hidden');
        });
    }
    const textoEl = modal.querySelector('#texto-modal-cadastro-pendente');
    if (textoEl) textoEl.innerText = mensagem;
    modal.classList.remove('hidden');
    lucide.createIcons();
}

// ALTERNAR ENTRE LOGIN E CADASTRO
function alternarParaLogin(preservarErroLogin = false) {
    if (!preservarErroLogin) {
        esconderErroLogin();
    }
    esconderErroRegister();
    if (tabAuthLogin && tabAuthRegister) {
        tabAuthLogin.className = "flex-1 py-2.5 text-xs md:text-sm font-bold rounded-xl transition-all bg-white text-orange-600 shadow-sm";
        tabAuthRegister.className = "flex-1 py-2.5 text-xs md:text-sm font-bold rounded-xl transition-all text-gray-500 hover:text-gray-700";
    }
    if (loginForm) loginForm.classList.remove('hidden');
    if (registerForm) registerForm.classList.add('hidden');
    lucide.createIcons();
}

function alternarParaRegister() {
    esconderErroLogin();
    esconderErroRegister();
    if (tabAuthLogin && tabAuthRegister) {
        tabAuthRegister.className = "flex-1 py-2.5 text-xs md:text-sm font-bold rounded-xl transition-all bg-white text-orange-600 shadow-sm";
        tabAuthLogin.className = "flex-1 py-2.5 text-xs md:text-sm font-bold rounded-xl transition-all text-gray-500 hover:text-gray-700";
    }
    if (loginForm) loginForm.classList.add('hidden');
    if (registerForm) registerForm.classList.remove('hidden');
    lucide.createIcons();
}

if (tabAuthLogin) tabAuthLogin.addEventListener('click', () => alternarParaLogin(false));
if (tabAuthRegister) tabAuthRegister.addEventListener('click', alternarParaRegister);
if (btnToggleToRegister) btnToggleToRegister.addEventListener('click', alternarParaRegister);
if (btnToggleToLogin) btnToggleToLogin.addEventListener('click', () => alternarParaLogin(false));

// Limpa mensagens de erro ao digitar
const loginEmailInput = document.getElementById('login-email');
const loginSenhaInput = document.getElementById('login-senha');
if (loginEmailInput) loginEmailInput.addEventListener('input', esconderErroLogin);
if (loginSenhaInput) loginSenhaInput.addEventListener('input', esconderErroLogin);

const regEmailInput = document.getElementById('register-email');
const regSenhaInput = document.getElementById('register-senha');
const regConfSenhaInput = document.getElementById('register-confirmar-senha');
if (regEmailInput) regEmailInput.addEventListener('input', esconderErroRegister);
if (regSenhaInput) regSenhaInput.addEventListener('input', esconderErroRegister);
if (regConfSenhaInput) regConfSenhaInput.addEventListener('input', esconderErroRegister);

// ATUALIZAÇÃO DO WIDGET DE PERFIL NA BARRA LATERAL (CRITÉRIO 6)
function atualizarWidgetPerfil(usuario) {
    const avatarEl = document.getElementById('user-avatar');
    const nameEl = document.getElementById('user-profile-name');
    const roleEl = document.getElementById('user-profile-role');

    if (!usuario) return;

    const cargoChave = normalizarCargo(usuario.cargo) || 'CAIXA';
    const cargoCfg = CARGOS_CONFIG[cargoChave] || CARGOS_CONFIG['CAIXA'];

    const partesNome = (usuario.nome || 'Usuário').trim().split(' ');
    const iniciais = partesNome.length > 1
        ? (partesNome[0][0] + partesNome[partesNome.length - 1][0]).toUpperCase()
        : partesNome[0].slice(0, 2).toUpperCase();

    if (avatarEl) {
        avatarEl.className = `w-10 h-10 rounded-xl ${cargoCfg.corAvatar} flex items-center justify-center font-black text-sm shrink-0 shadow-sm`;
        avatarEl.innerText = iniciais;
    }

    if (nameEl) {
        nameEl.innerText = usuario.nome || usuario.email || 'Usuário';
        nameEl.title = `${usuario.nome || ''} (${usuario.email || ''})`;
    }

    if (roleEl) {
        roleEl.className = `inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider ${cargoCfg.corBadge}`;
        roleEl.innerHTML = `<i data-lucide="${cargoCfg.icone}" class="w-3 h-3"></i> ${cargoCfg.label}`;
    }

    lucide.createIcons();
}

// DELIMITAÇÃO DE ACESSO CONFORME O TIPO DE PESSOA LOGADA (RBAC - Deny-by-Default)
function aplicarDelimitacaoPerfil(cargo) {
    const cargoNormalizado = normalizarCargo(cargo);
    const isAdm = cargoNormalizado === 'ADMIN';
    const isEst = cargoNormalizado === 'ESTOQUISTA';
    const isCaixa = cargoNormalizado === 'CAIXA';

    const setVisivel = (el, visivel) => {
        if (!el) return;
        if (visivel) el.classList.remove('hidden');
        else el.classList.add('hidden');
    };

    // Matriz de Navegação Lateral (RBAC):
    // - ADMIN (adm): Acesso irrestrito a todas as telas
    // - ESTOQUISTA (repositor): Acesso exclusivo ao módulo de Estoque/Produtos
    // - CAIXA (caixa): Vendas (PDV), Fidelidade (consulta/pontuação/resgate/novo cliente), Cardápio/QR Code; bloqueado em Estoque, Usuários e Configurações
    setVisivel(document.getElementById('nav-btn-vendas'), isAdm || isCaixa);
    setVisivel(document.getElementById('nav-btn-estoque'), isAdm || isEst);
    setVisivel(document.getElementById('nav-btn-fidelidade'), isAdm || isCaixa);
    setVisivel(document.getElementById('nav-btn-usuarios'), isAdm);
    setVisivel(document.getElementById('nav-btn-cardapio'), isAdm || isCaixa);
    setVisivel(document.getElementById('nav-btn-qrcode'), isAdm || isCaixa);
    setVisivel(document.getElementById('nav-btn-configuracoes'), isAdm);

    // Botão "Configurar Regras" de Fidelidade: exclusivo para ADMIN
    setVisivel(document.getElementById('btn-ir-config-fidelidade'), isAdm);

    // Botão "Novo Item" e "Produzir Lote" de Estoque: exclusivo para ADMIN e ESTOQUISTA (Repositor)
    setVisivel(document.getElementById('btn-novo-item'), isAdm || isEst);
    setVisivel(document.getElementById('btn-produzir-lote'), (isAdm || isEst) && (typeof estoqueAbaAtual === 'undefined' || estoqueAbaAtual === 'DIA'));

    // Botões de cadastro de novos clientes: permitido para ADMIN e CAIXA
    setVisivel(document.getElementById('btn-novo-cliente'), isAdm || isCaixa);
    setVisivel(document.getElementById('btn-pdv-novo-cliente'), isAdm || isCaixa);

    // Controle de Expediente no topo do PDV: visível apenas para ADMIN (adm) e CAIXA (caixa)
    setVisivel(document.getElementById('container-controle-expediente'), isAdm || isCaixa);
    setVisivel(document.getElementById('badge-status-expediente'), isAdm || isCaixa);

    // Se a view aberta atualmente não for permitida para o perfil, redireciona para a tela inicial do perfil
    Object.entries(views).forEach(([viewName, viewEl]) => {
        if (viewEl && !viewEl.classList.contains('hidden')) {
            if (!isPerfilPermitidoNaView(cargoNormalizado, viewName)) {
                redirecionarParaTelaInicialPerfil(cargoNormalizado);
            }
        }
    });
}

// REDIRECIONAMENTO PARA DENTRO DA TELA DE ESTOQUE
function redirecionarParaEstoque() {
    navBtns.forEach(b => {
        b.classList.remove('bg-orange-50', 'text-orange-600');
        b.classList.add('text-gray-500');
    });

    const btnEstoque = document.getElementById('nav-btn-estoque') || document.querySelector('.nav-btn[data-target="estoque"]');
    if (btnEstoque) {
        btnEstoque.classList.add('bg-orange-50', 'text-orange-600');
        btnEstoque.classList.remove('text-gray-500');
    }

    Object.values(views).forEach(view => {
        if (view) view.classList.add('hidden');
    });

    if (views['estoque']) {
        views['estoque'].classList.remove('hidden');
        lucide.createIcons();

        if (typeof carregarConfigEstoque === 'function') carregarConfigEstoque();

        const tabDia = document.getElementById('tab-estoque-dia');
        if (tabDia) {
            tabDia.click();
        } else if (typeof carregarEstoque === 'function') {
            carregarEstoque('DIA');
        }
    }
}

// REDIRECIONAMENTO PARA A TELA DE VENDAS (PDV) - PADRÃO PARA PERFIL CAIXA
function redirecionarParaVendas() {
    navBtns.forEach(b => {
        b.classList.remove('bg-orange-50', 'text-orange-600');
        b.classList.add('text-gray-500');
    });

    const btnVendas = document.getElementById('nav-btn-vendas') || document.querySelector('.nav-btn[data-target="vendas"]');
    if (btnVendas) {
        btnVendas.classList.add('bg-orange-50', 'text-orange-600');
        btnVendas.classList.remove('text-gray-500');
    }

    Object.values(views).forEach(view => {
        if (view) view.classList.add('hidden');
    });

    if (views['vendas']) {
        views['vendas'].classList.remove('hidden');
        lucide.createIcons();
        if (typeof carregarConfigFidelidade === 'function') carregarConfigFidelidade();
        if (typeof carregarStatusExpediente === 'function') carregarStatusExpediente();
        if (typeof carregarProdutosPDV === 'function') carregarProdutosPDV();
        if (typeof carregarClientesPDV === 'function') carregarClientesPDV();
    }
}

function redirecionarParaTelaInicialPerfil(cargo) {
    const role = normalizarCargo(cargo);
    if (role === 'CAIXA') {
        redirecionarParaVendas();
    } else {
        redirecionarParaEstoque();
    }
}

const SESSION_STORAGE_KEY = 'estocai_session';

function salvarSessaoLocal(usuario) {
    window.usuarioAtual = usuario;
    if (!usuario && typeof cpfsDesmascarados !== 'undefined') {
        cpfsDesmascarados.clear();
    }
    try {
        if (usuario) {
            localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(usuario));
        } else {
            localStorage.removeItem(SESSION_STORAGE_KEY);
        }
    } catch (_) {}
}

function lerSessaoLocal(uidEsperado) {
    try {
        const raw = localStorage.getItem(SESSION_STORAGE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (parsed && (!uidEsperado || parsed.uid === uidEsperado)) {
            return parsed;
        }
    } catch (_) {}
    return null;
}

function ativarSessaoPainel(usuario) {
    const cargoNormalizado = normalizarCargo(usuario?.cargo) || 'CAIXA';
    usuario.cargo = cargoNormalizado;
    salvarSessaoLocal(usuario);
    atualizarWidgetPerfil(window.usuarioAtual);
    aplicarDelimitacaoPerfil(window.usuarioAtual.cargo);
    atualizarLinksCardapio();

    loginScreen.classList.add('hidden');
    dashboardScreen.classList.remove('hidden');
    dashboardScreen.classList.add('flex');

    if (typeof carregarConfigEstoque === 'function') carregarConfigEstoque();
    redirecionarParaTelaInicialPerfil(window.usuarioAtual.cargo);

    if (cargoNormalizado !== 'ESTOQUISTA') {
        if (typeof carregarConfigFidelidade === 'function') carregarConfigFidelidade();
        if (typeof carregarStatusExpediente === 'function') carregarStatusExpediente();
        carregarProdutosPDV();
        if (typeof carregarClientesPDV === 'function') carregarClientesPDV();
    }
}

// MONITORAMENTO DO ESTADO DE AUTENTICAÇÃO DO FIREBASE (CRITÉRIOS 2, 5, 6, 8)
onAuthStateChanged(auth, async (user) => {
    if (user) {
        if (emProcessoDeRegistro) return;

        if (window.usuarioAtual && window.usuarioAtual.uid === user.uid) {
            ativarSessaoPainel(window.usuarioAtual);
            return;
        }

        // Restaura imediatamente a sessão persistida ao recarregar a página enquanto sincroniza com o back-end
        const sessaoCache = lerSessaoLocal(user.uid);
        if (sessaoCache) {
            window.usuarioAtual = sessaoCache;
            atualizarWidgetPerfil(window.usuarioAtual);
            aplicarDelimitacaoPerfil(window.usuarioAtual.cargo);
            atualizarLinksCardapio();
            loginScreen.classList.add('hidden');
            dashboardScreen.classList.remove('hidden');
            dashboardScreen.classList.add('flex');
        }

        try {
            const idToken = await user.getIdToken();
            const userData = await apiRequest('/api/auth/login', {
                method: 'POST',
                body: { idToken }
            });

            ativarSessaoPainel({
                uid: user.uid,
                email: userData.email || user.email,
                nome: userData.nome || user.email.split('@')[0],
                cargo: userData.cargo || "ADMIN",
                tenantId: userData.tenantId || user.uid,
                ativo: userData.ativo !== false
            });

        } catch (error) {
            console.error("Erro ao inicializar sessão do usuário:", error);
            if (error.message && (error.message.includes('pendente') || error.message.includes('aprovação') || error.message.includes('desativada'))) {
                const msgBloqueio = error.message;
                salvarSessaoLocal(null);
                await signOut(auth);
                dashboardScreen.classList.add('hidden');
                dashboardScreen.classList.remove('flex');
                loginScreen.classList.remove('hidden');
                alternarParaLogin(true);
                mostrarErroLogin(msgBloqueio);
                return;
            }
        }
    } else {
        salvarSessaoLocal(null);
        dashboardScreen.classList.add('hidden');
        dashboardScreen.classList.remove('flex');
        loginScreen.classList.remove('hidden');
        alternarParaLogin(true);
    }
});

// SUBMISSÃO DO FORMULÁRIO DE LOGIN (CRITÉRIOS 1, 3, 5, 8 + BLOQUEIO DE CONTAS PENDENTES)
if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        esconderErroLogin();

        const emailInput = document.getElementById('login-email') || loginForm.querySelectorAll('input')[0];
        const passwordInput = document.getElementById('login-senha') || loginForm.querySelectorAll('input')[1];
        const btnLogin = document.getElementById('btn-login-submit') || loginForm.querySelector('button');

        const email = emailInput.value.trim();
        const senha = passwordInput.value;

        if (!email || !senha) {
            mostrarErroLogin("Credenciais inválidas. Verifique seu e-mail e senha.");
            return;
        }

        const textoOriginal = btnLogin.innerHTML;
        btnLogin.innerHTML = "Autenticando...";
        btnLogin.disabled = true;

        try {
            const cred = await signInWithEmailAndPassword(auth, email, senha);
            const idToken = await cred.user.getIdToken();

            const userData = await apiRequest('/api/auth/login', {
                method: 'POST',
                body: { idToken }
            });

            ativarSessaoPainel({
                uid: cred.user.uid,
                email: userData.email || cred.user.email,
                nome: userData.nome || cred.user.email.split('@')[0],
                cargo: userData.cargo || "ADMIN",
                tenantId: userData.tenantId || cred.user.uid,
                ativo: userData.ativo !== false
            });
        } catch (error) {
            console.error("Falha no login:", error.code || error.message);
            // [FEEDBACK DE LOGIN REJEITADO] Exibe a mensagem 403 do back-end caso a conta esteja pendente de aprovação ou desativada
            if (error.message && (error.message.includes('pendente') || error.message.includes('aprovação') || error.message.includes('desativada'))) {
                const msgBackend = error.message;
                salvarSessaoLocal(null);
                try {
                    await signOut(auth);
                } catch (_) {}
                mostrarErroLogin(msgBackend);
            } else {
                mostrarErroLogin("Credenciais inválidas. Verifique seu e-mail e senha.");
            }
        } finally {
            btnLogin.innerHTML = textoOriginal;
            btnLogin.disabled = false;
        }
    });
}

// SUBMISSÃO DO FORMULÁRIO DE CRIAR CONTA (CRITÉRIO 7: SEMPRE ADMINISTRADOR + WORKFLOW DE APROVAÇÃO)
if (registerForm) {
    registerForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        esconderErroRegister();

        const nome = document.getElementById('register-nome').value.trim();
        const empresa = document.getElementById('register-empresa').value.trim();
        const email = document.getElementById('register-email').value.trim().toLowerCase();
        const senha = document.getElementById('register-senha').value;
        const confirmarSenha = document.getElementById('register-confirmar-senha').value;
        const btnRegister = document.getElementById('btn-register-submit');

        if (senha !== confirmarSenha) {
            mostrarErroRegister("As senhas não coincidem. Digite novamente.");
            return;
        }

        if (senha.length < 6) {
            mostrarErroRegister("A senha deve conter no mínimo 6 caracteres.");
            return;
        }

        const textoOriginal = btnRegister.innerHTML;
        btnRegister.innerHTML = "Criando conta de Administrador...";
        btnRegister.disabled = true;
        emProcessoDeRegistro = true;

        try {
            let user;
            try {
                const cred = await createUserWithEmailAndPassword(auth, email, senha);
                user = cred.user;
            } catch (authErr) {
                if (authErr.code === 'auth/email-already-in-use') {
                    // Se o usuário já foi criado no Firebase Auth em tentativa anterior, autentica para concluir o vínculo do tenant
                    const credExistente = await signInWithEmailAndPassword(auth, email, senha);
                    user = credExistente.user;
                } else {
                    throw authErr;
                }
            }

            // Registra o Tenant (/tenants/{tenantId}) e o Admin (/usuarios/{uid}) com status: 'pendente' via API
            await apiRequest('/api/auth/register', {
                method: 'POST',
                body: {
                    nome: nome,
                    nomeFantasia: empresa || "Brasinha Rotisseria",
                    email: email
                }
            });

            // [WORKFLOW DE APROVAÇÃO] Encerra a sessão recém-criada para impedir acesso imediato ao painel
            salvarSessaoLocal(null);
            await signOut(auth);

            registerForm.reset();
            alternarParaLogin(false);

            // Exibe o modal amigável informando que a conta passará por análise dos administradores
            mostrarModalCadastroPendente(
                "Cadastro realizado com sucesso! Sua conta passará por uma análise e você será liberado em breve."
            );
        } catch (error) {
            console.error("Erro ao registrar Administrador:", error);
            if (error.code === 'auth/email-already-in-use' || error.code === 'auth/wrong-password' || error.code === 'auth/invalid-login-credentials') {
                mostrarErroRegister("Este e-mail já está cadastrado no sistema.");
            } else if (error.code === 'auth/weak-password') {
                mostrarErroRegister("A senha informada é fraca. Use pelo menos 6 caracteres.");
            } else {
                mostrarErroRegister(error.message || "Erro ao criar conta de Administrador. Tente novamente.");
            }
        } finally {
            emProcessoDeRegistro = false;
            btnRegister.innerHTML = textoOriginal;
            btnRegister.disabled = false;
        }
    });
}

// LOGOUT DA CONTA
if (btnLogout) {
    btnLogout.addEventListener('click', async () => {
        try {
            salvarSessaoLocal(null);
            await signOut(auth);
        } catch (error) {
            console.error("Erro ao sair:", error);
        }
    });
}

// MENU LATERAL DE NAVEGAÇÃO ENTRE TELAS
const navBtns = document.querySelectorAll('.nav-btn');
const views = {
    'vendas': document.getElementById('view-vendas'),
    'estoque': document.getElementById('view-estoque'),
    'fidelidade': document.getElementById('view-fidelidade'),
    'usuarios': document.getElementById('view-usuarios'),
    'cardapio': document.getElementById('view-cardapio'),
    'qrcode': document.getElementById('view-qrcode'),
    'configuracoes': document.getElementById('view-configuracoes')
};

navBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        const targetView = btn.getAttribute('data-target');
        const cargoAtual = normalizarCargo(window.usuarioAtual?.cargo);

        if (!isPerfilPermitidoNaView(cargoAtual, targetView)) {
            alert("Acesso negado: o seu perfil não possui permissão para acessar este módulo.");
            return;
        }

        navBtns.forEach(b => {
            b.classList.remove('bg-orange-50', 'text-orange-600');
            b.classList.add('text-gray-500');
        });
        btn.classList.add('bg-orange-50', 'text-orange-600');
        btn.classList.remove('text-gray-500');

        Object.values(views).forEach(view => { if (view) view.classList.add('hidden'); });

        if (views[targetView]) {
            views[targetView].classList.remove('hidden');
            lucide.createIcons(); 
            
            if (targetView === 'estoque') {
                if (typeof carregarConfigEstoque === 'function') carregarConfigEstoque();
                const tabDia = document.getElementById('tab-estoque-dia');
                if(tabDia) tabDia.click();
            } else if (targetView === 'fidelidade') {
                if (typeof carregarConfigFidelidade === 'function') carregarConfigFidelidade();
                const tabTodos = document.getElementById('tab-fidelidade-todos');
                if(tabTodos) tabTodos.click();
            } else if (targetView === 'usuarios') {
                const tabTodos = document.getElementById('tab-usuarios-todos');
                if(tabTodos) tabTodos.click();
            } else if (targetView === 'vendas') {
                if (typeof carregarConfigFidelidade === 'function') carregarConfigFidelidade();
                if (typeof carregarStatusExpediente === 'function') carregarStatusExpediente();
                carregarProdutosPDV();
                if (typeof carregarClientesPDV === 'function') carregarClientesPDV();
            } else if (targetView === 'cardapio' || targetView === 'qrcode') {
                atualizarLinksCardapio();
            } else if (targetView === 'configuracoes') {
                if (typeof carregarConfigFidelidade === 'function') carregarConfigFidelidade();
                if (typeof carregarConfigEstoque === 'function') carregarConfigEstoque();
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
        const produtos = await apiRequest('/api/produtos');
        let produtosCarregados = 0;
        pdvProdutos.innerHTML = '';

        produtos.forEach(p => {
            const id = p.id;
            const precoNum = Number(p.preco || 0);
            const estoqueNum = Number(p.estoque || 0);

            if (p.tipo_estoque === 'DIA' && p.ativo && precoNum > 0) {
                produtosCarregados++;
                const btn = document.createElement('button');
                btn.className = "bg-orange-50 hover:bg-orange-100 border border-orange-100 p-4 rounded-2xl flex flex-col items-center justify-center text-center transition-all h-32 gap-2 shadow-sm active:scale-95";
                btn.innerHTML = `
                    <span class="font-bold text-gray-800 text-sm leading-tight">${p.nome}</span>
                    <span class="text-orange-600 font-black">R$ ${precoNum.toFixed(2)}</span>
                    <span class="text-[10px] text-gray-400 font-medium">${estoqueNum} no estoque</span>
                `;
                btn.onclick = () => adicionarAoCarrinho(id, p.nome, precoNum, estoqueNum);
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
        const clientes = await apiRequest('/api/clientes');
        clientesPdvCache = Array.isArray(clientes) ? clientes : [];

        clientesPdvCache.sort((a, b) => (a.nome || '').localeCompare(b.nome || ''));

        const meta = window.configFidelidadeAtual?.meta_compras_premio || 10;
        const isAdm = normalizarCargo(window.usuarioAtual?.cargo) === 'ADMIN';
        pdvClienteSelect.innerHTML = '<option value="">👤 Consumidor Final (Sem cadastro)</option>';
        clientesPdvCache.forEach(c => {
            const compras = c.fidelidade?.quantidade_compras_validas ?? 0;
            const opt = document.createElement('option');
            opt.value = c.id;
            const mostrarCompleto = isAdm && typeof cpfsDesmascarados !== 'undefined' && cpfsDesmascarados.has(c.id);
            const cpfExibido = mostrarCompleto ? formatarCPF(c.cpf) : maskCPF(c.cpf);
            opt.textContent = `${c.nome} (CPF: ${cpfExibido}) • ${compras}/${meta} compras`;
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

    const meta = window.configFidelidadeAtual?.meta_compras_premio || 10;
    const descPremio = window.configFidelidadeAtual?.descricao_premio || 'Prêmio Fidelidade';
    const compras = cliente.fidelidade?.quantidade_compras_validas ?? 0;
    const elegivel = compras >= meta || cliente.fidelidade?.elegivel_premio === true;

    pdvClienteInfo.classList.remove('hidden');
    if (elegivel) {
        pdvClienteStatus.innerHTML = `<i data-lucide="gift" class="w-4 h-4 text-emerald-600"></i> <span class="text-emerald-700 font-bold">${compras} compras</span>`;
        pdvClienteBadge.innerHTML = `<span class="bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full text-[10px] font-black" title="${descPremio}">🎁 ${descPremio} Disponível!</span>`;
    } else {
        const faltam = Math.max(0, meta - compras);
        pdvClienteStatus.innerHTML = `<i data-lucide="award" class="w-4 h-4 text-orange-500"></i> <span class="text-gray-700 font-bold">${compras}/${meta} compras</span>`;
        pdvClienteBadge.innerHTML = `<span class="text-orange-600 font-bold text-[11px]">${faltam} para: ${descPremio}</span>`;
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

// PASSO 3: Finalizar Venda via Transação ACID na rota POST /api/pedidos
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
            const respostaPedido = await apiRequest('/api/pedidos', {
                method: 'POST',
                body: {
                    id_cliente: clienteId || null,
                    tipo_pedido: "BALCAO",
                    status: "CONCLUIDO",
                    valor_desconto: 0.0,
                    valor_total: valorDaVenda,
                    pagamento: {
                        forma_pagamento: formaPagamentoSelecionada,
                        status: "PAGO"
                    },
                    itens: carrinho.map(item => ({
                        id_produto: item.id,
                        nome_produto: item.nome,
                        quantidade: item.quantidade,
                        preco_unitario: item.preco,
                        subtotal: item.preco * item.quantidade
                    }))
                }
            });

            let mensagemFidelidade = "";
            if (clienteSelecionado && respostaPedido.fidelidade_resultado?.pontuou) {
                const comprasAtuais = respostaPedido.fidelidade_resultado.quantidade_compras_validas;
                const meta = respostaPedido.fidelidade_resultado.meta_compras_premio || 10;
                const descPremio = respostaPedido.fidelidade_resultado.descricao_premio || window.configFidelidadeAtual?.descricao_premio || 'Prêmio de Fidelidade';
                if (respostaPedido.fidelidade_resultado.elegivel_premio) {
                    mensagemFidelidade = `\n\n🎉 Parabéns! ${clienteSelecionado.nome} atingiu ${comprasAtuais} compras e conquistou: ${descPremio}! 🎁`;
                } else {
                    mensagemFidelidade = `\n\n⭐ +1 compra computada para ${clienteSelecionado.nome}! Saldo atual: ${comprasAtuais}/${meta} compras.`;
                }
            }

            totalVendidoNoDia += valorDaVenda;
            alert(`✅ Venda finalizada com sucesso!\nForma de Pagamento: ${formaPagamentoSelecionada}${mensagemFidelidade}`);

            carrinho = [];
            atualizarTelaCarrinho();
            await carregarProdutosPDV();
            await carregarClientesPDV();
            if (typeof carregarStatusExpediente === 'function') carregarStatusExpediente();
            if (typeof carregarClientes === 'function') carregarClientes();
        } catch (error) {
            console.error("Erro na venda:", error);
            alert(error.message || "Erro ao finalizar venda e atualizar estoque.");
        } finally {
            btnFinalizarVenda.innerHTML = `<i data-lucide="check-circle" class="w-5 h-5"></i> Finalizar Venda`;
            btnFinalizarVenda.disabled = false;
            lucide.createIcons();
        }
    });
}

// ==========================================
// CONTROLE DE EXPEDIENTE (INICIAR / ENCERRAR CAIXA)
// ==========================================

const btnControleExpediente = document.getElementById('btn-controle-expediente');
const badgeStatusExpediente = document.getElementById('badge-status-expediente');

const modalIniciarExpediente = document.getElementById('modal-iniciar-expediente');
const formIniciarExpediente = document.getElementById('form-iniciar-expediente');
const inputExpedienteValorInicial = document.getElementById('input-expediente-valor-inicial');
const btnCancelarIniciarExpediente = document.getElementById('btn-cancelar-iniciar-expediente');

const modalEncerrarExpediente = document.getElementById('modal-encerrar-expediente');
const formEncerrarExpediente = document.getElementById('form-encerrar-expediente');
const inputExpedienteValorDinheiro = document.getElementById('input-expediente-valor-dinheiro');
const inputExpedienteValorCartao = document.getElementById('input-expediente-valor-cartao');
const inputExpedienteValorPix = document.getElementById('input-expediente-valor-pix');
const btnCancelarEncerrarExpediente = document.getElementById('btn-cancelar-encerrar-expediente');

const resumoExpInicial = document.getElementById('resumo-exp-inicial');
const resumoExpVendasDinheiro = document.getElementById('resumo-exp-vendas-dinheiro');
const resumoExpVendasCartao = document.getElementById('resumo-exp-vendas-cartao');
const resumoExpVendasPix = document.getElementById('resumo-exp-vendas-pix');
const resumoExpEsperado = document.getElementById('resumo-exp-esperado');
const hintEsperadoDinheiro = document.getElementById('hint-esperado-dinheiro');

const boxAvisoDiscrepancia = document.getElementById('box-aviso-discrepancia');
const textoAvisoDiscrepancia = document.getElementById('texto-aviso-discrepancia');
const listaDetalhesDiscrepancia = document.getElementById('lista-detalhes-discrepancia');
const btnDiscrepanciaSim = document.getElementById('btn-discrepancia-sim');
const btnDiscrepanciaNao = document.getElementById('btn-discrepancia-nao');
const botoesPadraoEncerrar = document.getElementById('botoes-padrao-encerrar');

window.statusExpediente = 'fechado';
window.expedienteAtual = null;

function atualizarHeaderExpediente() {
    const aberto = window.statusExpediente === 'aberto' && window.expedienteAtual;
    if (badgeStatusExpediente) {
        if (aberto) {
            const valIni = Number(window.expedienteAtual.valorInicial || 0).toFixed(2);
            badgeStatusExpediente.className = "inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200";
            badgeStatusExpediente.innerHTML = `<span class="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span> Expediente Aberto (Fundo: R$ ${valIni})`;
        } else {
            badgeStatusExpediente.className = "inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-gray-100 text-gray-600 border border-gray-200";
            badgeStatusExpediente.innerHTML = `<span class="w-2 h-2 rounded-full bg-gray-400"></span> Caixa Fechado`;
        }
    }

    if (btnControleExpediente) {
        if (aberto) {
            btnControleExpediente.className = "bg-red-600 text-white px-5 py-2.5 rounded-2xl font-bold hover:bg-red-700 flex items-center justify-center gap-2 transition-all shadow-md text-sm";
            btnControleExpediente.innerHTML = `<i data-lucide="lock" class="w-4 h-4"></i> Encerrar Expediente`;
        } else {
            btnControleExpediente.className = "bg-emerald-600 text-white px-5 py-2.5 rounded-2xl font-bold hover:bg-emerald-700 flex items-center justify-center gap-2 transition-all shadow-md text-sm";
            btnControleExpediente.innerHTML = `<i data-lucide="play-circle" class="w-4 h-4"></i> Iniciar Expediente`;
        }
        lucide.createIcons();
    }
}

window.carregarStatusExpediente = async function() {
    const cargo = normalizarCargo(window.usuarioAtual?.cargo);
    if (cargo !== 'ADMIN' && cargo !== 'CAIXA') return;

    try {
        const res = await apiRequest('/api/expediente/atual');
        window.statusExpediente = res.status || 'fechado';
        window.expedienteAtual = res.expediente || null;
        atualizarHeaderExpediente();
    } catch (error) {
        console.error("Erro ao consultar status do expediente:", error);
    }
};

function abrirModalIniciarExpediente() {
    if (!modalIniciarExpediente) return;
    if (inputExpedienteValorInicial) inputExpedienteValorInicial.value = "0.00";
    modalIniciarExpediente.classList.remove('hidden');
    lucide.createIcons();
    setTimeout(() => {
        if (inputExpedienteValorInicial) {
            inputExpedienteValorInicial.focus();
            inputExpedienteValorInicial.select();
        }
    }, 50);
}

function fecharModalIniciarExpediente() {
    if (modalIniciarExpediente) modalIniciarExpediente.classList.add('hidden');
}

function setInputsFechamentoReadOnly(readOnly) {
    [inputExpedienteValorDinheiro, inputExpedienteValorCartao, inputExpedienteValorPix].forEach(inp => {
        if (inp) inp.readOnly = readOnly;
    });
}

async function abrirModalEncerrarExpediente() {
    if (!modalEncerrarExpediente) return;
    await window.carregarStatusExpediente();

    const exp = window.expedienteAtual;
    const valInicial = Number(exp?.valorInicial || 0);
    const valVendasDinheiro = Number(exp?.vendasDinheiro ?? exp?.valorCalculadoVendas ?? 0);
    const valVendasCartao = Number(exp?.vendasCartao || 0);
    const valVendasPix = Number(exp?.vendasPix || 0);
    const valEsperadoDinheiro = Number(exp?.esperadoDinheiro ?? (valInicial + valVendasDinheiro));
    const valEsperadoTotal = Number(exp?.valorEsperado ?? (valEsperadoDinheiro + valVendasCartao + valVendasPix));

    if (resumoExpInicial) resumoExpInicial.innerText = `R$ ${valInicial.toFixed(2)}`;
    if (resumoExpVendasDinheiro) resumoExpVendasDinheiro.innerText = `+ R$ ${valVendasDinheiro.toFixed(2)}`;
    if (resumoExpVendasCartao) resumoExpVendasCartao.innerText = `+ R$ ${valVendasCartao.toFixed(2)}`;
    if (resumoExpVendasPix) resumoExpVendasPix.innerText = `+ R$ ${valVendasPix.toFixed(2)}`;
    if (resumoExpEsperado) resumoExpEsperado.innerText = `R$ ${valEsperadoTotal.toFixed(2)}`;
    if (hintEsperadoDinheiro) {
        hintEsperadoDinheiro.innerText = `Esperado na gaveta (Fundo + Vendas Dinheiro): R$ ${valEsperadoDinheiro.toFixed(2)}`;
    }

    if (inputExpedienteValorDinheiro) inputExpedienteValorDinheiro.value = "";
    if (inputExpedienteValorCartao) inputExpedienteValorCartao.value = valVendasCartao.toFixed(2);
    if (inputExpedienteValorPix) inputExpedienteValorPix.value = valVendasPix.toFixed(2);
    setInputsFechamentoReadOnly(false);

    if (boxAvisoDiscrepancia) boxAvisoDiscrepancia.classList.add('hidden');
    if (listaDetalhesDiscrepancia) listaDetalhesDiscrepancia.innerHTML = "";
    if (botoesPadraoEncerrar) botoesPadraoEncerrar.classList.remove('hidden');

    modalEncerrarExpediente.classList.remove('hidden');
    lucide.createIcons();
    setTimeout(() => {
        if (inputExpedienteValorDinheiro) inputExpedienteValorDinheiro.focus();
    }, 50);
}

function fecharModalEncerrarExpediente() {
    if (modalEncerrarExpediente) modalEncerrarExpediente.classList.add('hidden');
}

if (btnControleExpediente) {
    btnControleExpediente.addEventListener('click', () => {
        const cargo = normalizarCargo(window.usuarioAtual?.cargo);
        if (cargo !== 'ADMIN' && cargo !== 'CAIXA') {
            alert("Acesso negado: apenas Administrador e Operador de Caixa podem controlar o expediente.");
            return;
        }
        if (window.statusExpediente === 'aberto') {
            abrirModalEncerrarExpediente();
        } else {
            abrirModalIniciarExpediente();
        }
    });
}

if (btnCancelarIniciarExpediente) {
    btnCancelarIniciarExpediente.addEventListener('click', fecharModalIniciarExpediente);
}

if (btnCancelarEncerrarExpediente) {
    btnCancelarEncerrarExpediente.addEventListener('click', fecharModalEncerrarExpediente);
}

if (formIniciarExpediente) {
    formIniciarExpediente.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btnConfirmar = document.getElementById('btn-confirmar-iniciar-expediente');
        const textoOriginal = btnConfirmar.innerHTML;
        btnConfirmar.innerHTML = "Abrindo...";
        btnConfirmar.disabled = true;

        const valorInicial = parseFloat(inputExpedienteValorInicial.value);
        if (Number.isNaN(valorInicial) || valorInicial < 0) {
            alert("Informe um valor de Fundo de Troco válido.");
            btnConfirmar.innerHTML = textoOriginal;
            btnConfirmar.disabled = false;
            return;
        }

        try {
            const res = await apiRequest('/api/expediente/iniciar', {
                method: 'POST',
                body: { valorInicial }
            });
            window.statusExpediente = res.status || 'aberto';
            window.expedienteAtual = res.expediente || null;
            atualizarHeaderExpediente();
            fecharModalIniciarExpediente();
        } catch (error) {
            console.error("Erro ao iniciar expediente:", error);
            alert(error.message || "Erro ao iniciar expediente.");
        } finally {
            btnConfirmar.innerHTML = textoOriginal;
            btnConfirmar.disabled = false;
            lucide.createIcons();
        }
    });
}

async function processarEncerramentoExpediente(confirmarDiscrepancia = false) {
    const valorInformadoDinheiro = parseFloat(inputExpedienteValorDinheiro?.value);
    const valorInformadoCartao = parseFloat(inputExpedienteValorCartao?.value || "0");
    const valorInformadoPix = parseFloat(inputExpedienteValorPix?.value || "0");

    if (Number.isNaN(valorInformadoDinheiro) || valorInformadoDinheiro < 0) {
        alert("Informe a contagem final do dinheiro físico na gaveta.");
        return;
    }
    if (Number.isNaN(valorInformadoCartao) || valorInformadoCartao < 0) {
        alert("Informe um valor válido para Cartão / Maquininha.");
        return;
    }
    if (Number.isNaN(valorInformadoPix) || valorInformadoPix < 0) {
        alert("Informe um valor válido para PIX / Outros.");
        return;
    }

    const btnConfirmar = document.getElementById('btn-confirmar-encerrar-expediente');
    const textoOriginal = btnConfirmar ? btnConfirmar.innerHTML : "";
    if (btnConfirmar) {
        btnConfirmar.innerHTML = "Processando...";
        btnConfirmar.disabled = true;
    }

    try {
        const res = await apiRequest('/api/expediente/encerrar', {
            method: 'POST',
            body: {
                valorInformadoDinheiro,
                valorInformadoCartao,
                valorInformadoPix,
                confirmarDiscrepancia
            }
        });

        if (res.requerConfirmacao) {
            const esp = Number(res.valorEsperado || 0).toFixed(2);
            const inf = Number(res.valorFinalInformado || 0).toFixed(2);
            const dif = Number(res.discrepancia || 0);
            const difFormatada = `${dif >= 0 ? '+' : '-'} R$ ${Math.abs(dif).toFixed(2)}`;

            if (textoAvisoDiscrepancia) {
                textoAvisoDiscrepancia.innerText = `Atenção: Houve uma discrepância no fechamento de caixa (Esperado Total: R$ ${esp} | Informado Total: R$ ${inf} | Diferença: ${difFormatada}). Deseja encerrar o expediente mesmo assim?`;
            }
            if (listaDetalhesDiscrepancia) {
                const msgs = Array.isArray(res.mensagensDiscrepancia) ? res.mensagensDiscrepancia : [];
                listaDetalhesDiscrepancia.innerHTML = msgs.map(m => `<li>${m}</li>`).join('');
            }
            if (boxAvisoDiscrepancia) boxAvisoDiscrepancia.classList.remove('hidden');
            if (botoesPadraoEncerrar) botoesPadraoEncerrar.classList.add('hidden');
            setInputsFechamentoReadOnly(true);
            lucide.createIcons();
            return;
        }

        // Encerrado com sucesso
        window.statusExpediente = 'fechado';
        window.expedienteAtual = null;
        totalVendidoNoDia = 0;
        atualizarHeaderExpediente();
        fecharModalEncerrarExpediente();
        alert("✅ Expediente encerrado e registrado no histórico com sucesso!");
    } catch (error) {
        console.error("Erro ao encerrar expediente:", error);
        alert(error.message || "Erro ao encerrar expediente.");
    } finally {
        if (btnConfirmar) {
            btnConfirmar.innerHTML = textoOriginal;
            btnConfirmar.disabled = false;
            lucide.createIcons();
        }
    }
}

if (formEncerrarExpediente) {
    formEncerrarExpediente.addEventListener('submit', async (e) => {
        e.preventDefault();
        await processarEncerramentoExpediente(false);
    });
}

if (btnDiscrepanciaSim) {
    btnDiscrepanciaSim.addEventListener('click', async () => {
        await processarEncerramentoExpediente(true);
    });
}

if (btnDiscrepanciaNao) {
    btnDiscrepanciaNao.addEventListener('click', () => {
        if (boxAvisoDiscrepancia) boxAvisoDiscrepancia.classList.add('hidden');
        if (botoesPadraoEncerrar) botoesPadraoEncerrar.classList.remove('hidden');
        setInputsFechamentoReadOnly(false);
        if (inputExpedienteValorDinheiro) {
            inputExpedienteValorDinheiro.focus();
            inputExpedienteValorDinheiro.select();
        }
    });
}

// INVENTÁRIO DE ESTOQUE CRUD, FICHA TÉCNICA (RECEITA) & PRODUÇÃO DE LOTE

const tabelaEstoque = document.getElementById('tabela-estoque');
const modalProduto = document.getElementById('modal-produto');
const formProduto = document.getElementById('form-produto');
const btnNovoItem = document.getElementById('btn-novo-item');
const btnProduzirLote = document.getElementById('btn-produzir-lote');
const btnCancelarModal = document.getElementById('btn-cancelar-modal');
const modalTitulo = document.getElementById('modal-titulo');
const cardAlertaReestoque = document.getElementById('card-alerta-reestoque');
const textoAlertaReestoque = document.getElementById('texto-alerta-reestoque');
const subtituloLimiarEstoque = document.getElementById('subtitulo-limiar-estoque');

// Elementos da Ficha Técnica e Controle de Lote (FEFO) no Modal de Produto
const selectProdTipo = document.getElementById('prod-tipo');
const labelProdEstoque = document.getElementById('label-prod-estoque');
const secaoFichaTecnica = document.getElementById('secao-ficha-tecnica');
const secaoControleLote = document.getElementById('secao-controle-lote');
const inputLoteNumero = document.getElementById('lote-numero-input');
const inputLoteValidade = document.getElementById('lote-validade-input');
const inputModoEntradaLote = document.getElementById('prod-modo-entrada-lote');
const listaLotesExistentesModal = document.getElementById('lista-lotes-existentes-modal');
const selectReceitaInsumo = document.getElementById('receita-insumo-select');
const inputReceitaQtd = document.getElementById('receita-insumo-qtd');
const btnAdicionarInsumoReceita = document.getElementById('btn-adicionar-insumo-receita');
const listaInsumosReceita = document.getElementById('lista-insumos-receita');

// Elementos do Modal de Produzir Lote
const modalProduzirLote = document.getElementById('modal-produzir-lote');
const formProduzirLote = document.getElementById('form-produzir-lote');
const selectProduzirProduto = document.getElementById('produzir-produto-select');
const inputProduzirQuantidade = document.getElementById('produzir-quantidade-input');
const previewConsumoReceita = document.getElementById('preview-consumo-receita');
const btnCancelarProduzirLote = document.getElementById('btn-cancelar-produzir-lote');

let estoqueAbaAtual = 'DIA';
window.limiarEstoqueMinimo = 0;
window.cacheTodosProdutos = [];
let receitaAtualModal = [];

function formatarDataValidadeBR(dataIso) {
    if (!dataIso) return '--/--/----';
    const partes = String(dataIso).split('T')[0].split('-');
    if (partes.length === 3) {
        return `${partes[2]}/${partes[1]}/${partes[0]}`;
    }
    return String(dataIso);
}

function obterLotesOrdenadosFEFO(insumo) {
    if (!insumo) return [];
    if (Array.isArray(insumo.lotes) && insumo.lotes.length > 0) {
        return [...insumo.lotes]
            .filter(l => l && Number(l.quantidade) > 0)
            .sort((a, b) => new Date(a.validade) - new Date(b.validade));
    }
    const qtd = Number(parseFloat(insumo.estoque ?? 0));
    if (insumo.tipo_estoque === 'GERAL' && qtd > 0) {
        const prefixo = String(insumo.nome || 'G').substring(0, 1).toUpperCase();
        return [{
            numeroLote: `LOTE-${prefixo}01`,
            validade: '2026-11-10',
            quantidade: qtd
        }];
    }
    return [];
}

function atualizarVisibilidadeSecaoFichaTecnica() {
    const selectEl = document.getElementById('prod-tipo') || selectProdTipo;
    if (!selectEl) return;

    const prodId = document.getElementById('prod-id')?.value || '';
    const tituloEl = document.getElementById('modal-titulo') || modalTitulo;
    const labelEstoqueEl = document.getElementById('label-prod-estoque') || labelProdEstoque;
    const secaoFichaEl = document.getElementById('secao-ficha-tecnica') || secaoFichaTecnica;
    const secaoLoteEl = document.getElementById('secao-controle-lote') || secaoControleLote;
    const inputLoteNumEl = document.getElementById('lote-numero-input') || inputLoteNumero;
    const inputLoteValEl = document.getElementById('lote-validade-input') || inputLoteValidade;

    const val = String(selectEl.value || '').trim().toUpperCase();
    const isGeral = ['GERAL', 'ESTOQUE_GERAL', 'MATERIA_PRIMA'].includes(val);

    if (isGeral) {
        if (tituloEl) {
            tituloEl.innerText = "Novo Insumo / Entrada de Lote";
        }
        if (labelEstoqueEl) {
            labelEstoqueEl.innerText = "QUANTIDADE DO LOTE *";
        }
        if (secaoFichaEl) {
            secaoFichaEl.classList.add('hidden');
        }
        if (secaoLoteEl) {
            secaoLoteEl.classList.remove('hidden');
        }
        if (inputLoteNumEl) {
            inputLoteNumEl.required = true;
        }
        if (inputLoteValEl) {
            inputLoteValEl.required = true;
        }
    } else {
        if (tituloEl) {
            tituloEl.innerText = prodId ? "Editar Item" : "Novo Item";
        }
        if (labelEstoqueEl) {
            labelEstoqueEl.innerText = "ESTOQUE";
        }
        if (secaoLoteEl) {
            secaoLoteEl.classList.add('hidden');
        }
        if (inputLoteNumEl) {
            inputLoteNumEl.required = false;
        }
        if (inputLoteValEl) {
            inputLoteValEl.required = false;
        }
        if (secaoFichaEl) {
            secaoFichaEl.classList.remove('hidden');
            popularSelectInsumosReceita();
            renderizarListaReceitaModal();
        }
    }
    if (window.lucide && typeof window.lucide.createIcons === 'function') {
        window.lucide.createIcons();
    }
}

function popularSelectInsumosReceita() {
    if (!selectReceitaInsumo) return;
    const insumosGerais = (window.cacheTodosProdutos || []).filter(p => p.tipo_estoque === 'GERAL');
    if (insumosGerais.length === 0) {
        selectReceitaInsumo.innerHTML = `<option value="">Nenhum insumo cadastrado no Estoque Geral</option>`;
        return;
    }
    selectReceitaInsumo.innerHTML = `<option value="">Selecione um insumo do Estoque Geral...</option>` +
        insumosGerais.map(ins => `<option value="${ins.id}">${ins.nome} (Saldo: ${ins.estoque} ${ins.unidade || 'un'})</option>`).join('');
}

function renderizarListaReceitaModal() {
    if (!listaInsumosReceita) return;
    if (!Array.isArray(receitaAtualModal) || receitaAtualModal.length === 0) {
        listaInsumosReceita.innerHTML = `<p class="text-xs text-gray-400 italic">Nenhum insumo vinculado a este produto.</p>`;
        return;
    }

    const mapaProdutos = new Map((window.cacheTodosProdutos || []).map(p => [p.id, p]));
    listaInsumosReceita.innerHTML = receitaAtualModal.map((item, idx) => {
        const insumo = mapaProdutos.get(item.insumoId);
        const nomeInsumo = insumo ? insumo.nome : `Insumo (${item.insumoId})`;
        const unidade = insumo ? (insumo.unidade || 'un') : 'un';
        return `
            <div class="flex items-center justify-between bg-white px-3 py-2 rounded-xl border border-amber-200 text-xs">
                <div class="font-bold text-gray-800">
                    ${nomeInsumo}
                    <span class="ml-1.5 px-2 py-0.5 rounded-md bg-amber-100 text-amber-900 font-black">${item.quantidade} ${unidade} / un</span>
                </div>
                <button type="button" onclick="removerInsumoReceita(${idx})" class="text-red-400 hover:text-red-600 p-1 rounded-lg transition-colors" title="Remover insumo">
                    <i data-lucide="x" class="w-4 h-4"></i>
                </button>
            </div>
        `;
    }).join('');
    lucide.createIcons();
}

window.removerInsumoReceita = function(index) {
    receitaAtualModal.splice(index, 1);
    renderizarListaReceitaModal();
};

if (selectProdTipo) {
    selectProdTipo.addEventListener('change', atualizarVisibilidadeSecaoFichaTecnica);
}

if (btnAdicionarInsumoReceita) {
    btnAdicionarInsumoReceita.addEventListener('click', () => {
        const insumoId = selectReceitaInsumo?.value;
        const quantidade = parseFloat(inputReceitaQtd?.value);

        if (!insumoId) {
            alert("Selecione um insumo do Estoque Geral para adicionar à receita.");
            return;
        }
        if (Number.isNaN(quantidade) || quantidade <= 0) {
            alert("Informe uma quantidade válida (maior que zero) do insumo por unidade.");
            return;
        }

        const idxExistente = receitaAtualModal.findIndex(r => r.insumoId === insumoId);
        if (idxExistente >= 0) {
            receitaAtualModal[idxExistente].quantidade = Number(quantidade);
        } else {
            receitaAtualModal.push({ insumoId, quantidade: Number(quantidade) });
        }

        if (selectReceitaInsumo) selectReceitaInsumo.value = "";
        if (inputReceitaQtd) inputReceitaQtd.value = "";
        renderizarListaReceitaModal();
    });
}

window.carregarConfigEstoque = async function() {
    try {
        const res = await apiRequest('/api/configuracoes/estoque');
        const limiar = Number(parseFloat(res?.limiar_estoque_minimo ?? 0));
        window.limiarEstoqueMinimo = Number.isNaN(limiar) ? 0 : limiar;

        const inputLimiar = document.getElementById('config-estoque-limiar');
        if (inputLimiar) {
            inputLimiar.value = window.limiarEstoqueMinimo;
        }
        if (subtituloLimiarEstoque) {
            subtituloLimiarEstoque.innerText = `Limiar configurado para alerta de reestoque: ≤ ${window.limiarEstoqueMinimo} un`;
        }
    } catch (error) {
        console.error("Erro ao carregar limiar de estoque:", error);
    }
};

async function carregarEstoque(tipoEstoque = 'DIA') {
    if (!tabelaEstoque) return;
    estoqueAbaAtual = tipoEstoque;
    tabelaEstoque.innerHTML = '<tr><td colspan="3" class="text-center py-12 text-gray-400 italic">Buscando dados no banco...</td></tr>';

    const cargoAtual = normalizarCargo(window.usuarioAtual?.cargo);
    const podeGerenciarEstoque = cargoAtual === 'ADMIN' || cargoAtual === 'ESTOQUISTA';

    if (btnProduzirLote) {
        if (podeGerenciarEstoque && tipoEstoque === 'DIA') {
            btnProduzirLote.classList.remove('hidden');
        } else {
            btnProduzirLote.classList.add('hidden');
        }
    }

    try {
        await window.carregarConfigEstoque();
        const limiarMinimo = Number(window.limiarEstoqueMinimo ?? 0);

        const produtos = await apiRequest('/api/produtos');
        window.cacheTodosProdutos = Array.isArray(produtos) ? produtos : [];
        const mapaProdutos = new Map(window.cacheTodosProdutos.map(item => [item.id, item]));

        let htmlFinal = "";
        let contagem = 0;
        let totalPrecisamReestoque = 0;

        produtos.forEach(p => {
            const qtd = Number(parseFloat(p.estoque ?? 0));
            if (qtd <= limiarMinimo) {
                totalPrecisamReestoque++;
            }
        });

        if (cardAlertaReestoque && textoAlertaReestoque) {
            if (totalPrecisamReestoque > 0) {
                cardAlertaReestoque.classList.remove('hidden');
                textoAlertaReestoque.innerText = `${totalPrecisamReestoque} ${totalPrecisamReestoque === 1 ? 'produto precisa' : 'produtos precisam'} de reestoque`;
            } else {
                cardAlertaReestoque.classList.add('hidden');
            }
        }

        produtos.forEach(p => {
            const id = p.id;
            
            if (p.tipo_estoque === tipoEstoque) {
                contagem++;
                const qtdEstoque = Number(parseFloat(p.estoque ?? 0));
                const precisaReestoque = qtdEstoque <= limiarMinimo;
                const temReceita = Array.isArray(p.receita) && p.receita.length > 0;

                let resumoReceitaHtml = '';
                if (tipoEstoque === 'DIA' && temReceita) {
                    const itensTexto = p.receita.map(r => {
                        const ins = mapaProdutos.get(r.insumoId);
                        return `${r.quantidade}${ins?.unidade || 'un'} ${ins?.nome || 'Insumo'}`;
                    }).join(' + ');
                    resumoReceitaHtml = `<p class="text-[11px] text-amber-700 font-bold mt-1 flex items-center gap-1"><i data-lucide="clipboard-list" class="w-3 h-3"></i> Receita: ${itensTexto}</p>`;
                }

                let resumoLotesHtml = '';
                if (tipoEstoque === 'GERAL') {
                    const lotesOrdenados = obterLotesOrdenadosFEFO(p);
                    if (lotesOrdenados.length > 0) {
                        const primeiroLote = lotesOrdenados[0];
                        const dataValFormatada = formatarDataValidadeBR(primeiroLote.validade);
                        const outrosLotes = lotesOrdenados.slice(1);
                        const extraTexto = outrosLotes.length > 0
                            ? `<span class="ml-1.5 px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 text-[10px] font-bold">+${outrosLotes.length} lote(s) na fila FEFO</span>`
                            : '';
                        resumoLotesHtml = `
                            <p class="text-blue-600 text-xs font-medium mt-1 flex items-center flex-wrap gap-1">
                                <i data-lucide="calendar" class="w-3.5 h-3.5 text-blue-600"></i>
                                <span>FEFO 1º Lote: #${primeiroLote.numeroLote} (${primeiroLote.quantidade} ${p.unidade || 'un'} • Val: ${dataValFormatada})</span>
                                ${extraTexto}
                            </p>
                        `;
                    }
                }

                const subTexto = tipoEstoque === 'DIA' 
                    ? `<p class="text-[10px] text-gray-400 uppercase font-medium mt-1">${p.categoria} • R$ ${Number(p.preco || 0).toFixed(2)}</p>${resumoReceitaHtml}`
                    : `<p class="text-[10px] text-blue-400 uppercase font-bold mt-1">${p.categoria}</p>${resumoLotesHtml}`;
                const alertaEstoque = precisaReestoque
                    ? (qtdEstoque === 0 ? "text-red-600" : "text-amber-600")
                    : "text-gray-700";

                const badgeReestoque = precisaReestoque
                    ? `<span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold ${qtdEstoque === 0 ? 'bg-red-100 text-red-700 border border-red-200' : 'bg-amber-100 text-amber-800 border border-amber-200'} ml-2 shadow-sm">⚠️ ${qtdEstoque === 0 ? 'Esgotado • Reestoque' : 'Reestoque Necessário'}</span>`
                    : '';

                const btnProduzirRapido = (podeGerenciarEstoque && tipoEstoque === 'DIA' && temReceita)
                    ? `<button onclick="abrirModalProduzirLote('${id}')" class="px-2.5 py-1.5 text-xs font-bold text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-lg transition-colors flex items-center gap-1" title="Produzir Lote deste Produto">
                           <i data-lucide="chef-hat" class="w-3.5 h-3.5"></i> Produzir
                       </button>`
                    : '';

                const btnEntradaLoteRapido = (podeGerenciarEstoque && tipoEstoque === 'GERAL')
                    ? `<button onclick="abrirModalEntradaLote('${id}')" class="px-2.5 py-1.5 text-xs font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg transition-colors flex items-center gap-1" title="Cadastrar Novo Lote para este Insumo (FEFO)">
                           <i data-lucide="plus-circle" class="w-3.5 h-3.5"></i> + Lote
                       </button>`
                    : '';

                const botoesAcao = podeGerenciarEstoque ? `
                    <div class="flex justify-end items-center gap-2">
                        ${btnProduzirRapido}
                        ${btnEntradaLoteRapido}
                        <button onclick="abrirModalEdicao('${id}')" class="p-2 text-blue-400 hover:bg-blue-50 rounded-lg transition-colors" title="Editar">
                            <i data-lucide="edit-2" class="w-4 h-4"></i>
                        </button>
                        <button onclick="excluirProduto('${id}')" class="p-2 text-red-300 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors" title="Excluir">
                            <i data-lucide="trash-2" class="w-4 h-4"></i>
                        </button>
                    </div>
                ` : `<span class="text-xs text-gray-400 italic">Somente leitura</span>`;

                htmlFinal += `
                    <tr class="hover:bg-orange-50/30 transition-colors ${precisaReestoque ? 'bg-amber-50/20' : ''}">
                        <td class="px-6 md:px-8 py-6">
                            <div class="flex items-center flex-wrap gap-1">
                                <p class="font-bold text-gray-800 text-sm md:text-base">${p.nome}</p>
                                ${badgeReestoque}
                            </div>
                            ${subTexto}
                        </td>
                        <td class="px-6 md:px-8 py-6">
                            <span class="font-black text-lg ${alertaEstoque}">
                                ${p.estoque} <span class="text-sm font-medium text-gray-400">${p.unidade}</span>
                            </span>
                        </td>
                        <td class="px-6 md:px-8 py-6 text-right">
                            ${botoesAcao}
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

function renderizarLotesExistentesNoModal(lotes = [], unidade = 'un') {
    if (!listaLotesExistentesModal) return;
    if (!Array.isArray(lotes) || lotes.length === 0) {
        listaLotesExistentesModal.classList.add('hidden');
        listaLotesExistentesModal.innerHTML = '';
        return;
    }
    listaLotesExistentesModal.classList.remove('hidden');
    listaLotesExistentesModal.innerHTML = `
        <p class="text-[10px] font-black text-blue-800 uppercase tracking-wider mb-1">Lotes ativos cadastrados (Ordem FEFO):</p>
        <div class="space-y-1 max-h-24 overflow-y-auto">
            ${lotes.map((l, idx) => `
                <div class="flex items-center justify-between bg-white px-2.5 py-1.5 rounded-lg border border-blue-100 text-[11px]">
                    <span class="font-bold text-blue-900">${idx + 1}º • #${l.numeroLote}</span>
                    <span class="text-gray-600 font-semibold">${l.quantidade} ${unidade} • Val: ${formatarDataValidadeBR(l.validade)}</span>
                </div>
            `).join('')}
        </div>
    `;
}

async function abrirModal() {
    const cargoAtual = normalizarCargo(window.usuarioAtual?.cargo);
    if (cargoAtual !== 'ADMIN' && cargoAtual !== 'ESTOQUISTA') {
        alert("Acesso negado: apenas Administrador ou Repositor de Estoque podem cadastrar itens.");
        return;
    }
    if (!window.cacheTodosProdutos || window.cacheTodosProdutos.length === 0) {
        try {
            window.cacheTodosProdutos = await apiRequest('/api/produtos');
        } catch (e) {
            console.error(e);
        }
    }
    formProduto.reset();
    document.getElementById('prod-id').value = "";
    if (inputModoEntradaLote) inputModoEntradaLote.value = "false";
    if (inputLoteNumero) inputLoteNumero.value = "";
    if (inputLoteValidade) inputLoteValidade.value = "";
    renderizarLotesExistentesNoModal([]);
    document.getElementById('prod-tipo').value = estoqueAbaAtual;
    receitaAtualModal = [];
    atualizarVisibilidadeSecaoFichaTecnica();
    modalProduto.classList.remove('hidden');
    lucide.createIcons();
}

window.abrirModalEntradaLote = async function(id) {
    const cargoAtual = normalizarCargo(window.usuarioAtual?.cargo);
    if (cargoAtual !== 'ADMIN' && cargoAtual !== 'ESTOQUISTA') {
        alert("Acesso negado: apenas Administrador ou Repositor de Estoque podem cadastrar lotes.");
        return;
    }
    try {
        const p = await apiRequest(`/api/produtos/${id}`);
        if (!p) return;

        formProduto.reset();
        document.getElementById('prod-id').value = id;
        if (inputModoEntradaLote) inputModoEntradaLote.value = "true";
        document.getElementById('prod-nome').value = p.nome;
        document.getElementById('prod-preco').value = p.preco || 0;
        document.getElementById('prod-estoque').value = "";
        document.getElementById('prod-categoria').value = p.categoria || 'Geral';
        document.getElementById('prod-unidade').value = p.unidade || 'un';
        document.getElementById('prod-tipo').value = 'GERAL';

        if (inputLoteNumero) inputLoteNumero.value = "";
        if (inputLoteValidade) inputLoteValidade.value = "";

        const lotesOrdenados = obterLotesOrdenadosFEFO(p);
        renderizarLotesExistentesNoModal(lotesOrdenados, p.unidade || 'un');

        atualizarVisibilidadeSecaoFichaTecnica();
        if (modalTitulo) modalTitulo.innerText = "Novo Insumo / Entrada de Lote";
        modalProduto.classList.remove('hidden');
        lucide.createIcons();
    } catch (error) {
        console.error("Erro ao abrir entrada de lote:", error);
    }
};

function fecharModal() {
    modalProduto.classList.add('hidden');
}

if (btnNovoItem) btnNovoItem.addEventListener('click', abrirModal);
if (btnCancelarModal) btnCancelarModal.addEventListener('click', fecharModal);

// ==========================================
// MODAL PRODUZIR LOTE (ESTOQUE DO DIA)
// ==========================================
let selectedProdutoId = "";

function atualizarPreviewConsumoReceita() {
    if (!previewConsumoReceita || !selectProduzirProduto) return;
    const prodId = selectedProdutoId || selectProduzirProduto.value;
    const qtdLote = parseFloat(inputProduzirQuantidade?.value) || 0;
    const qtdCalculo = qtdLote > 0 ? qtdLote : 1;
    const prod = (window.cacheTodosProdutos || []).find(p => (p.id || p._id) === prodId);

    if (!prod) {
        previewConsumoReceita.innerHTML = `<p class="text-xs text-gray-400 italic">Selecione um produto pronto para visualizar os insumos que serão consumidos.</p>`;
        return;
    }

    const receita = Array.isArray(prod.receita) ? prod.receita : [];
    if (receita.length === 0) {
        previewConsumoReceita.innerHTML = `<p class="text-xs text-red-600 font-bold">⚠️ Este produto ainda não possui Ficha Técnica/Receita cadastrada. Edite o produto e adicione insumos do Estoque Geral primeiro.</p>`;
        return;
    }

    const mapaProdutos = new Map((window.cacheTodosProdutos || []).map(p => [p.id || p._id, p]));
    const linhas = receita.map(r => {
        const ins = mapaProdutos.get(r.insumoId);
        const nomeIns = ins ? ins.nome : `Insumo (${r.insumoId})`;
        const un = ins ? (ins.unidade || 'un') : 'un';
        const lotesOrdenados = obterLotesOrdenadosFEFO(ins);
        const saldoAtual = lotesOrdenados.length > 0
            ? Number(lotesOrdenados.reduce((acc, l) => acc + Number(l.quantidade || 0), 0).toFixed(4))
            : Number(ins?.estoque ?? 0);
        const necessario = Number((Number(r.quantidade) * qtdCalculo).toFixed(4));
        const insuficiente = qtdLote > 0 && saldoAtual < necessario;

        const primeiroLote = lotesOrdenados[0] || null;
        let infoFefoHtml = '';
        let avisoMultiplosLotesHtml = '';

        if (primeiroLote) {
            const valFormatada = formatarDataValidadeBR(primeiroLote.validade);
            infoFefoHtml = `
                <p class="text-blue-600 text-xs font-medium mt-0.5">
                    FEFO 1º Lote: #${primeiroLote.numeroLote} (${primeiroLote.quantidade} ${un} • Val: ${valFormatada})
                </p>
            `;

            if (necessario > Number(primeiroLote.quantidade)) {
                const restanteFila = Number((necessario - Number(primeiroLote.quantidade)).toFixed(4));
                if (saldoAtual >= necessario && lotesOrdenados.length > 1) {
                    const proximoLote = lotesOrdenados[1];
                    avisoMultiplosLotesHtml = `
                        <p class="text-[11px] text-amber-700 font-bold mt-0.5">
                            ↪ Restante (${restanteFila} ${un}) será abatido do(s) próximo(s) lote(s) na fila FEFO (#${proximoLote.numeroLote} • Val: ${formatarDataValidadeBR(proximoLote.validade)}).
                        </p>
                    `;
                } else {
                    avisoMultiplosLotesHtml = `
                        <p class="text-[11px] text-red-600 font-bold mt-0.5">
                            ⚠️ Consumo excede o 1º lote em ${restanteFila} ${un} e não há saldo suficiente nos próximos lotes FEFO.
                        </p>
                    `;
                }
            }
        } else {
            infoFefoHtml = `
                <p class="text-red-500 text-xs font-medium mt-0.5">
                    Nenhum lote ativo disponível no Estoque Geral
                </p>
            `;
        }

        return `
            <div class="py-2 border-b border-amber-200/60 last:border-0 text-xs">
                <div class="flex items-center justify-between">
                    <span class="font-bold text-gray-800">${nomeIns}</span>
                    <span class="${insuficiente ? 'text-red-600 font-black' : 'text-amber-900 font-bold'}">
                        Consumo: ${necessario} ${un} (Saldo: ${saldoAtual} ${un}) ${insuficiente ? '⚠️ Insuficiente' : ''}
                    </span>
                </div>
                ${infoFefoHtml}
                ${avisoMultiplosLotesHtml}
            </div>
        `;
    }).join('');

    previewConsumoReceita.innerHTML = `
        <p class="text-[11px] font-black uppercase text-amber-800 mb-2">BAIXA PREVISTA NO ESTOQUE GERAL VIA FEFO (${qtdCalculo} UN):</p>
        ${linhas}
    `;
}

window.abrirModalProduzirLote = async function(produtoIdPreSelecionado = "") {
    const cargoAtual = normalizarCargo(window.usuarioAtual?.cargo);
    if (cargoAtual !== 'ADMIN' && cargoAtual !== 'ESTOQUISTA') {
        alert("Acesso negado: apenas Administrador ou Repositor de Estoque podem produzir lotes.");
        return;
    }

    try {
        window.cacheTodosProdutos = await apiRequest('/api/produtos');
    } catch (e) {
        console.error("Erro ao atualizar lista de produtos para produção:", e);
    }

    const produtosDia = (window.cacheTodosProdutos || []).filter(p => p.tipo_estoque === 'DIA');
    if (selectProduzirProduto) {
        if (produtosDia.length === 0) {
            selectedProdutoId = "";
            selectProduzirProduto.innerHTML = `<option value="">Nenhum produto cadastrado no Estoque do Dia</option>`;
        } else {
            selectProduzirProduto.innerHTML = produtosDia.map(p => {
                const pid = p.id || p._id;
                const temRec = Array.isArray(p.receita) && p.receita.length > 0;
                return `<option value="${pid}">${p.nome} (Atual: ${p.estoque} ${p.unidade || 'un'})${temRec ? '' : ' [Sem Receita]'}</option>`;
            }).join('');

            const idInicial = produtoIdPreSelecionado || (produtosDia[0].id || produtosDia[0]._id);
            selectedProdutoId = String(idInicial || "");
            selectProduzirProduto.value = selectedProdutoId;
        }
    }

    if (inputProduzirQuantidade) inputProduzirQuantidade.value = "1";
    atualizarPreviewConsumoReceita();

    if (modalProduzirLote) {
        modalProduzirLote.classList.remove('hidden');
        lucide.createIcons();
    }
};

function fecharModalProduzirLote() {
    if (modalProduzirLote) modalProduzirLote.classList.add('hidden');
}

if (btnProduzirLote) {
    btnProduzirLote.addEventListener('click', () => window.abrirModalProduzirLote());
}
if (btnCancelarProduzirLote) {
    btnCancelarProduzirLote.addEventListener('click', fecharModalProduzirLote);
}
if (selectProduzirProduto) {
    selectProduzirProduto.addEventListener('change', (e) => {
        selectedProdutoId = e.target.value;
        atualizarPreviewConsumoReceita();
    });
}
if (inputProduzirQuantidade) {
    inputProduzirQuantidade.addEventListener('input', atualizarPreviewConsumoReceita);
}

if (formProduzirLote) {
    formProduzirLote.addEventListener('submit', async (e) => {
        e.preventDefault();
        const produtoId = String(selectProduzirProduto?.value || selectedProdutoId || "").trim();
        const quantidadeLote = parseFloat(inputProduzirQuantidade?.value);

        if (!produtoId) {
            alert("Selecione um Produto Pronto (Estoque do Dia) para produzir.");
            return;
        }
        if (Number.isNaN(quantidadeLote) || quantidadeLote <= 0) {
            alert("Informe uma quantidade produzida válida (maior que zero).");
            return;
        }

        const btnConfirmar = document.getElementById('btn-confirmar-produzir-lote');
        const textoOriginal = btnConfirmar ? btnConfirmar.innerHTML : "";
        if (btnConfirmar) {
            btnConfirmar.innerHTML = "Produzindo...";
            btnConfirmar.disabled = true;
        }

        try {
            const res = await apiRequest('/api/produtos/produzir', {
                method: 'POST',
                body: {
                    produtoId,
                    produtoDiaId: produtoId,
                    quantidadeLote,
                    quantidadeProduzida: quantidadeLote
                }
            });
            fecharModalProduzirLote();
            await carregarEstoque(estoqueAbaAtual);
            if (typeof carregarProdutosPDV === 'function') carregarProdutosPDV();
            alert(`✅ ${res.message || 'Lote produzido com sucesso!'}`);
        } catch (error) {
            console.error("Erro ao produzir lote:", error);
            alert(error.message || "Erro ao produzir lote. Verifique o saldo de insumos no Estoque Geral.");
        } finally {
            if (btnConfirmar) {
                btnConfirmar.innerHTML = textoOriginal;
                btnConfirmar.disabled = false;
                lucide.createIcons();
            }
        }
    });
}

if(formProduto) {
    formProduto.addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = document.getElementById('prod-id').value;
        const btnSalvar = document.getElementById('btn-salvar-produto');
        const textoOriginal = btnSalvar.innerHTML;
        btnSalvar.innerHTML = "Salvando...";
        btnSalvar.disabled = true;

        const tipoRaw = String(document.getElementById('prod-tipo').value || 'DIA').trim().toUpperCase();
        const tipoSelecionado = ['GERAL', 'ESTOQUE_GERAL', 'MATERIA_PRIMA'].includes(tipoRaw) ? 'GERAL' : 'DIA';
        const elLoteNum = document.getElementById('lote-numero-input');
        const elLoteVal = document.getElementById('lote-validade-input');
        const elModoLote = document.getElementById('prod-modo-entrada-lote');

        const numeroLote = elLoteNum ? elLoteNum.value.trim() : '';
        const validade = elLoteVal ? elLoteVal.value.trim() : '';
        const modoEntradaLote = elModoLote ? elModoLote.value === 'true' : false;
        const qtdInformada = parseFloat(document.getElementById('prod-estoque').value) || 0;

        if (tipoSelecionado === 'GERAL') {
            if (!numeroLote) {
                alert('Informe o Número do Lote para cadastrar no Estoque Geral.');
                btnSalvar.innerHTML = textoOriginal;
                btnSalvar.disabled = false;
                return;
            }
            if (!validade) {
                alert('Informe a Data de Validade do lote para cadastrar no Estoque Geral.');
                btnSalvar.innerHTML = textoOriginal;
                btnSalvar.disabled = false;
                return;
            }
        }

        const produtoData = {
            nome: document.getElementById('prod-nome').value,
            preco: parseFloat(document.getElementById('prod-preco').value) || 0,
            estoque: qtdInformada,
            categoria: document.getElementById('prod-categoria').value,
            unidade: document.getElementById('prod-unidade').value,
            tipo_estoque: tipoSelecionado,
            receita: tipoSelecionado === 'DIA' ? receitaAtualModal : [],
            numeroLote: tipoSelecionado === 'GERAL' ? numeroLote : undefined,
            validade: tipoSelecionado === 'GERAL' ? validade : undefined,
            dataValidade: tipoSelecionado === 'GERAL' ? validade : undefined,
            modoEntradaLote: tipoSelecionado === 'GERAL' ? modoEntradaLote : false,
            ativo: true
        };

        try {
            if (id) {
                await apiRequest(`/api/produtos/${id}`, { method: 'PUT', body: produtoData });
            } else {
                await apiRequest('/api/produtos', { method: 'POST', body: produtoData });
            }
            fecharModal();
            carregarEstoque(estoqueAbaAtual); 
            if (typeof carregarProdutosPDV === 'function') carregarProdutosPDV(); 
        } catch (error) {
            console.error("Erro ao salvar:", error);
            alert(error.message || "Erro ao salvar produto. Verifique suas permissões.");
        } finally {
            btnSalvar.innerHTML = textoOriginal;
            btnSalvar.disabled = false;
        }
    });
}

window.excluirProduto = async function(id) {
    const cargoAtual = normalizarCargo(window.usuarioAtual?.cargo);
    if (cargoAtual !== 'ADMIN' && cargoAtual !== 'ESTOQUISTA') {
        alert("Acesso negado: apenas Administrador ou Repositor de Estoque podem excluir itens.");
        return;
    }
    if(confirm("Tem certeza que deseja excluir este item permanentemente?")) {
        try {
            await apiRequest(`/api/produtos/${id}`, { method: 'DELETE' });
            carregarEstoque(estoqueAbaAtual);
            if (typeof carregarProdutosPDV === 'function') carregarProdutosPDV();
        } catch (error) {
            console.error("Erro ao excluir:", error);
            alert(error.message || "Erro ao excluir produto.");
        }
    }
};

window.abrirModalEdicao = async function(id) {
    const cargoAtual = normalizarCargo(window.usuarioAtual?.cargo);
    if (cargoAtual !== 'ADMIN' && cargoAtual !== 'ESTOQUISTA') {
        alert("Acesso negado: apenas Administrador ou Repositor de Estoque podem editar itens.");
        return;
    }
    try {
        if (!window.cacheTodosProdutos || window.cacheTodosProdutos.length === 0) {
            window.cacheTodosProdutos = await apiRequest('/api/produtos');
        }
        const p = await apiRequest(`/api/produtos/${id}`);
        if (p) {
            document.getElementById('prod-id').value = id;
            if (inputModoEntradaLote) inputModoEntradaLote.value = "false";
            document.getElementById('prod-nome').value = p.nome;
            document.getElementById('prod-preco').value = p.preco || 0;
            document.getElementById('prod-categoria').value = p.categoria;
            document.getElementById('prod-unidade').value = p.unidade;
            document.getElementById('prod-tipo').value = p.tipo_estoque;

            const lotesOrdenados = obterLotesOrdenadosFEFO(p);
            if (p.tipo_estoque === 'GERAL' && lotesOrdenados.length > 0) {
                document.getElementById('prod-estoque').value = lotesOrdenados[0].quantidade;
                if (inputLoteNumero) inputLoteNumero.value = lotesOrdenados[0].numeroLote || '';
                if (inputLoteValidade) inputLoteValidade.value = lotesOrdenados[0].validade || '';
                renderizarLotesExistentesNoModal(lotesOrdenados, p.unidade || 'un');
            } else {
                document.getElementById('prod-estoque').value = p.estoque;
                if (inputLoteNumero) inputLoteNumero.value = '';
                if (inputLoteValidade) inputLoteValidade.value = '';
                renderizarLotesExistentesNoModal([]);
            }

            receitaAtualModal = Array.isArray(p.receita) ? p.receita.map(r => ({
                insumoId: r.insumoId,
                quantidade: Number(r.quantidade)
            })) : [];
            atualizarVisibilidadeSecaoFichaTecnica();
            if (p.tipo_estoque === 'DIA' && modalTitulo) {
                modalTitulo.innerText = "Editar Item";
            }
            modalProduto.classList.remove('hidden');
            lucide.createIcons();
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
    inputQrUrl.value = getCardapioUrl();

    btnGerarQr.addEventListener('click', () => {
        const urlCardapio = getCardapioUrl();
        inputQrUrl.value = urlCardapio;
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
const cpfsDesmascarados = new Set();

function formatarCPF(cpf) {
    if (!cpf) return "-";
    const limpo = String(cpf).replace(/\D/g, "");
    if (limpo.length !== 11) return cpf;
    return limpo.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
}

// Função utilitária de exibição de CPF mascarado (o mascaramento real ocorre no Back-end em /api/clientes)
// Ex: "***.456.789-**"
export function maskCPF(cpf) {
    if (!cpf) return "-";
    const texto = String(cpf).trim();
    if (texto.includes('*')) return texto;
    const limpo = texto.replace(/\D/g, "");
    if (limpo.length === 11) {
        return `***.${limpo.slice(3, 6)}.${limpo.slice(6, 9)}-**`;
    }
    if (limpo.length >= 2) {
        return `***.***.***-${limpo.slice(-2)}`;
    }
    return "***.***.***-**";
}

window.maskCPF = maskCPF;

window.alternarVisibilidadeCPF = function(clienteId) {
    if (normalizarCargo(window.usuarioAtual?.cargo) !== 'ADMIN') {
        alert("Acesso restrito: apenas o Administrador pode visualizar o CPF completo.");
        return;
    }
    if (cpfsDesmascarados.has(clienteId)) {
        cpfsDesmascarados.delete(clienteId);
    } else {
        cpfsDesmascarados.add(clienteId);
    }
    renderizarTabelaClientes(clientesCache);
    if (typeof carregarClientesPDV === 'function') carregarClientesPDV();
};

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
        const clientes = await apiRequest('/api/clientes');
        clientesCache = Array.isArray(clientes) ? clientes : [];

        clientesCache.sort((a, b) => (a.nome || '').localeCompare(b.nome || ''));
        renderizarTabelaClientes(clientesCache);
    } catch (error) {
        console.error("Erro ao carregar clientes:", error);
        tabelaFidelidade.innerHTML = '<tr><td colspan="3" class="text-center py-12 text-red-500 font-bold">Erro de conexão ao carregar clientes.</td></tr>';
    }
}

function renderizarTabelaClientes(lista) {
    if (!tabelaFidelidade) return;

    const meta = window.configFidelidadeAtual?.meta_compras_premio || 10;
    const descPremio = window.configFidelidadeAtual?.descricao_premio || 'Prêmio Fidelidade';
    const isAdm = normalizarCargo(window.usuarioAtual?.cargo) === 'ADMIN';

    let filtrados = lista;
    if (fidelidadeAbaAtual === 'PREMIADOS') {
        filtrados = lista.filter(c => {
            const compras = c.fidelidade?.quantidade_compras_validas ?? 0;
            return compras >= meta || c.fidelidade?.elegivel_premio === true;
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
        const compras = c.fidelidade?.quantidade_compras_validas ?? 0;
        const elegivel = compras >= meta || c.fidelidade?.elegivel_premio === true;
        const porcentagem = Math.min(100, Math.round((compras / meta) * 100));

        const partesNome = (c.nome || 'C').trim().split(' ');
        const iniciais = partesNome.length > 1 
            ? (partesNome[0][0] + partesNome[partesNome.length - 1][0]).toUpperCase()
            : partesNome[0].slice(0, 2).toUpperCase();

        const badgePremio = elegivel 
            ? `<span class="bg-emerald-100 text-emerald-700 font-bold px-2.5 py-0.5 rounded-full text-xs flex items-center gap-1 shadow-sm" title="${descPremio}"><i data-lucide="gift" class="w-3.5 h-3.5"></i> Elegível (${descPremio})</span>`
            : `<span class="bg-orange-50 text-orange-600 font-bold px-2 py-0.5 rounded-full text-[11px]">${Math.max(0, meta - compras)} compras para prêmio</span>`;

        const barraCor = elegivel ? "bg-emerald-500" : "bg-orange-500";
        const destaquePontos = elegivel ? "text-emerald-600 font-black" : "text-gray-800 font-black";

        const nomeEscapado = (c.nome || '').replace(/'/g, "\\'");

        const mostrarCpfCompleto = isAdm && cpfsDesmascarados.has(c.id);
        const cpfTexto = mostrarCpfCompleto
            ? formatarCPF(c.cpf)
            : (c.cpf_mascarado || maskCPF(c.cpf));
        const botaoToggleCpf = isAdm ? `
            <button type="button" onclick="alternarVisibilidadeCPF('${c.id}')" class="text-gray-400 hover:text-orange-600 transition-colors ml-0.5" title="${mostrarCpfCompleto ? 'Ocultar CPF' : 'Visualizar CPF completo (Admin)'}">
                <i data-lucide="${mostrarCpfCompleto ? 'eye-off' : 'eye'}" class="w-3.5 h-3.5"></i>
            </button>
        ` : '';

        const botaoResgatar = elegivel ? `
            <button onclick="resgatarPremioCliente('${c.id}', '${nomeEscapado}')" class="px-2.5 py-1.5 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 font-bold text-xs rounded-xl flex items-center gap-1 transition-all shadow-sm" title="Resgatar prêmio (${descPremio})">
                <i data-lucide="gift" class="w-3.5 h-3.5"></i> Resgatar
            </button>
        ` : '';

        // Edição e exclusão cadastral de clientes registrados: exclusivo para ADMIN (adm)
        const botoesAdminCliente = isAdm ? `
            <button onclick="abrirModalEdicaoCliente('${c.id}')" class="p-2 text-blue-500 hover:bg-blue-50 rounded-xl transition-colors" title="Editar dados cadastrais (Exclusivo Admin)">
                <i data-lucide="edit-2" class="w-4 h-4"></i>
            </button>
            <button onclick="excluirCliente('${c.id}', '${nomeEscapado}')" class="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-colors" title="Excluir cliente (Exclusivo Admin)">
                <i data-lucide="trash-2" class="w-4 h-4"></i>
            </button>
        ` : '';

        htmlFinal += `
            <tr class="hover:bg-orange-50/30 transition-colors cliente-linha" data-id="${c.id}" data-nome="${(c.nome || '').toLowerCase()}" data-cpf="${String(c.cpf || '').replace(/\D/g, '')}" data-telefone="${String(c.telefone || '').replace(/\D/g, '')}">
                <td class="px-6 md:px-8 py-5">
                    <div class="flex items-center gap-3">
                        <div class="w-10 h-10 rounded-2xl ${elegivel ? 'bg-emerald-100 text-emerald-700' : 'bg-orange-100 text-orange-600'} flex items-center justify-center font-black text-sm shrink-0 shadow-sm">
                            ${iniciais}
                        </div>
                        <div>
                            <p class="font-bold text-gray-800 text-sm md:text-base">${c.nome}</p>
                            <div class="flex flex-wrap items-center gap-3 mt-1 text-xs text-gray-400 font-medium">
                                <span class="flex items-center gap-1">
                                    <i data-lucide="credit-card" class="w-3.5 h-3.5 text-gray-400"></i> ${cpfTexto} ${botaoToggleCpf}
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
                            <span class="text-xs text-gray-400 font-medium">/ ${meta} compras</span>
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
                        ${botoesAdminCliente}
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

        if (id && normalizarCargo(window.usuarioAtual?.cargo) !== 'ADMIN') {
            alert("Acesso negado: apenas o Administrador pode editar informações cadastrais de clientes já registrados.");
            return;
        }

        const btnSalvar = document.getElementById('btn-salvar-cliente');
        const textoOriginal = btnSalvar.innerHTML;
        btnSalvar.innerHTML = "Salvando...";
        btnSalvar.disabled = true;

        const meta = window.configFidelidadeAtual?.meta_compras_premio || 10;
        const comprasQtd = parseInt(clienteComprasInput.value, 10) || 0;
        const clienteData = {
            nome: clienteNomeInput.value.trim(),
            cpf: clienteCpfInput.value.trim(),
            telefone: clienteTelefoneInput.value.trim(),
            fidelidade: {
                quantidade_compras_validas: comprasQtd,
                elegivel_premio: comprasQtd >= meta
            }
        };

        try {
            let novoId = id;
            if (id) {
                await apiRequest(`/api/clientes/${id}`, { method: 'PUT', body: clienteData });
            } else {
                const criado = await apiRequest('/api/clientes', { method: 'POST', body: clienteData });
                novoId = criado.id;
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
            alert(error.message || "Erro ao salvar dados do cliente.");
        } finally {
            btnSalvar.innerHTML = textoOriginal;
            btnSalvar.disabled = false;
        }
    });
}

window.abrirModalEdicaoCliente = async function(id) {
    if (normalizarCargo(window.usuarioAtual?.cargo) !== 'ADMIN') {
        alert("Acesso negado: apenas o Administrador pode editar dados cadastrais de clientes registrados.");
        return;
    }
    try {
        const c = await apiRequest(`/api/clientes/${id}`);
        if (c) {
            clienteIdInput.value = id;
            clienteNomeInput.value = c.nome || "";
            clienteCpfInput.value = formatarCPF(c.cpf || "");
            clienteTelefoneInput.value = formatarTelefone(c.telefone || "");
            clienteComprasInput.value = c.fidelidade?.quantidade_compras_validas ?? 0;

            modalClienteTitulo.innerText = "Editar Cliente";
            modalCliente.classList.remove('hidden');
        }
    } catch (error) {
        console.error("Erro ao buscar cliente:", error);
    }
};

window.excluirCliente = async function(id, nome) {
    if (normalizarCargo(window.usuarioAtual?.cargo) !== 'ADMIN') {
        alert("Acesso negado: apenas o Administrador pode excluir clientes registrados.");
        return;
    }
    if (confirm(`Tem certeza que deseja excluir o cliente "${nome}"?`)) {
        try {
            await apiRequest(`/api/clientes/${id}`, { method: 'DELETE' });
            carregarClientes(fidelidadeAbaAtual);
            if (typeof carregarClientesPDV === 'function') carregarClientesPDV();
        } catch (error) {
            console.error("Erro ao excluir cliente:", error);
            alert(error.message || "Erro ao excluir cliente.");
        }
    }
};

window.adicionarCompraCliente = async function(id) {
    try {
        await apiRequest(`/api/clientes/${id}/compra`, { method: 'POST' });
        carregarClientes(fidelidadeAbaAtual);
        if (typeof carregarClientesPDV === 'function') carregarClientesPDV();
    } catch (error) {
        console.error("Erro ao adicionar compra:", error);
        alert(error.message || "Erro ao adicionar compra ao cliente.");
    }
};

window.resgatarPremioCliente = async function(id, nome) {
    const meta = window.configFidelidadeAtual?.meta_compras_premio || 10;
    const descPremio = window.configFidelidadeAtual?.descricao_premio || 'Prêmio Fidelidade';
    if (confirm(`Confirmar resgate do prêmio (${descPremio}) para ${nome}?\n\nSerão deduzidas ${meta} compras do saldo.`)) {
        try {
            await apiRequest(`/api/clientes/${id}/resgatar`, { method: 'POST' });
            alert(`🎉 Prêmio (${descPremio}) resgatado com sucesso para ${nome}!`);
            carregarClientes(fidelidadeAbaAtual);
            if (typeof carregarClientesPDV === 'function') carregarClientesPDV();
        } catch (error) {
            console.error("Erro ao resgatar prêmio:", error);
            alert(error.message || "Erro ao resgatar prêmio.");
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

async function carregarUsuarios(filtro = usuariosFiltroAtual) {
    if (!tabelaUsuarios) return;
    usuariosFiltroAtual = filtro;
    tabelaUsuarios.innerHTML = '<tr><td colspan="4" class="text-center py-12 text-gray-400 italic">Buscando colaboradores no banco...</td></tr>';

    try {
        const usuarios = await apiRequest('/api/usuarios');
        usuariosCache = Array.isArray(usuarios) ? usuarios : [];

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

        const isPendente = u.status === 'pendente' || u.aprovado === false;
        const badgeAprovacao = isPendente
            ? `<span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800 border border-amber-200 ml-1.5 shadow-sm" title="Aguardando aprovação pelos administradores do sistema"><i data-lucide="clock" class="w-3 h-3"></i> Pendente</span>`
            : '';

        const statusBadge = ativo
            ? `<button onclick="alternarStatusUsuario('${u.id}', true)" class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-green-50 text-green-700 border border-green-200 hover:bg-green-100 transition-all shadow-sm" title="Clique para desativar"><span class="w-2 h-2 rounded-full bg-green-500"></span> Ativo</button>${badgeAprovacao}`
            : `<button onclick="alternarStatusUsuario('${u.id}', false)" class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-gray-100 text-gray-500 border border-gray-200 hover:bg-gray-200 transition-all shadow-sm" title="Clique para ativar"><span class="w-2 h-2 rounded-full bg-gray-400"></span> Inativo</button>${badgeAprovacao}`;

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

        const nome = usuarioNomeInput.value.trim();
        const email = usuarioEmailInput.value.trim().toLowerCase();
        const cargo = usuarioCargoInput.value;
        const ativo = usuarioStatusInput.value === 'true';
        const senha = usuarioSenhaInput.value.trim();

        try {
            if (id) {
                await apiRequest(`/api/usuarios/${id}`, {
                    method: 'PUT',
                    body: {
                        nome,
                        cargo,
                        ativo,
                        senha: senha || undefined
                    }
                });

                fecharModalUsuario();
                carregarUsuarios(usuariosFiltroAtual);
                alert("Colaborador atualizado com sucesso!");
            } else {
                if (!senha || senha.length < 6) {
                    alert("Para cadastrar um novo colaborador, defina uma senha de no mínimo 6 caracteres.");
                    btnSalvar.innerHTML = textoOriginal;
                    btnSalvar.disabled = false;
                    return;
                }

                await apiRequest('/api/usuarios', {
                    method: 'POST',
                    body: {
                        nome,
                        email,
                        cargo,
                        ativo,
                        senha
                    }
                });

                fecharModalUsuario();
                carregarUsuarios(usuariosFiltroAtual);
                mostrarModalCadastroPendente(
                    "Cadastro realizado com sucesso! Sua conta passará por uma análise e você será liberado em breve."
                );
            }
        } catch (error) {
            console.error("Erro ao salvar usuário:", error);
            alert("Erro ao salvar usuário: " + (error.message || "Verifique suas permissões."));
        } finally {
            btnSalvar.innerHTML = textoOriginal;
            btnSalvar.disabled = false;
        }
    });
}

window.abrirModalEdicaoUsuario = async function(id) {
    try {
        const u = await apiRequest(`/api/usuarios/${id}`);
        if (u) {
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
        await apiRequest(`/api/usuarios/${id}`, {
            method: 'PUT',
            body: { ativo: !statusAtual }
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
            await apiRequest(`/api/usuarios/${id}`, { method: 'DELETE' });
            carregarUsuarios(usuariosFiltroAtual);
        } catch (error) {
            console.error("Erro ao excluir usuário:", error);
            alert("Erro ao excluir usuário.");
        }
    }
};

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

// ==========================================
// CONFIGURAÇÕES DO PROGRAMA DE FIDELIDADE (EXCLUSIVO ADMIN)
// ==========================================

const formConfigFidelidade = document.getElementById('form-config-fidelidade');
const configFidelidadeAtivoInput = document.getElementById('config-fidelidade-ativo');
const configFidelidadeValorMinimoInput = document.getElementById('config-fidelidade-valor-minimo');
const configFidelidadeMetaInput = document.getElementById('config-fidelidade-meta');
const configFidelidadeDescricaoInput = document.getElementById('config-fidelidade-descricao');
const configFidelidadeFeedback = document.getElementById('config-fidelidade-feedback');
const resumoRegraFidelidade = document.getElementById('resumo-regra-fidelidade');
const btnIrConfigFidelidade = document.getElementById('btn-ir-config-fidelidade');

window.configFidelidadeAtual = {
    ativo: true,
    valor_minimo_ponto: 0.0,
    meta_compras_premio: 10,
    descricao_premio: "Prêmio Fidelidade"
};

function atualizarResumoVisualFidelidade() {
    if (!resumoRegraFidelidade) return;
    const ativo = configFidelidadeAtivoInput ? configFidelidadeAtivoInput.value === 'true' : window.configFidelidadeAtual.ativo;
    const valorMin = configFidelidadeValorMinimoInput ? (parseFloat(configFidelidadeValorMinimoInput.value) || 0) : window.configFidelidadeAtual.valor_minimo_ponto;
    const meta = configFidelidadeMetaInput ? (parseInt(configFidelidadeMetaInput.value, 10) || 10) : window.configFidelidadeAtual.meta_compras_premio;
    const descricao = (configFidelidadeDescricaoInput && configFidelidadeDescricaoInput.value.trim()) || window.configFidelidadeAtual.descricao_premio || "Prêmio Fidelidade";

    if (!ativo) {
        resumoRegraFidelidade.innerText = "Programa de Fidelidade desativado no momento. Nenhuma compra no PDV irá gerar pontos automaticamente.";
    } else {
        resumoRegraFidelidade.innerText = `Programa Ativo: Pedidos no PDV a partir de R$ ${valorMin.toFixed(2)} somam +1 compra válida. Ao atingir ${meta} compras, o cliente conquista: "${descricao}".`;
    }
}

if (configFidelidadeAtivoInput) configFidelidadeAtivoInput.addEventListener('change', atualizarResumoVisualFidelidade);
if (configFidelidadeValorMinimoInput) configFidelidadeValorMinimoInput.addEventListener('input', atualizarResumoVisualFidelidade);
if (configFidelidadeMetaInput) configFidelidadeMetaInput.addEventListener('input', atualizarResumoVisualFidelidade);
if (configFidelidadeDescricaoInput) configFidelidadeDescricaoInput.addEventListener('input', atualizarResumoVisualFidelidade);

if (btnIrConfigFidelidade) {
    btnIrConfigFidelidade.addEventListener('click', () => {
        if (normalizarCargo(window.usuarioAtual?.cargo) !== 'ADMIN') {
            alert("Acesso restrito: apenas o Administrador pode alterar as regras do Programa de Fidelidade.");
            return;
        }
        const navBtnConfig = document.getElementById('nav-btn-configuracoes');
        if (navBtnConfig) navBtnConfig.click();
    });
}

window.carregarConfigFidelidade = async function() {
    try {
        const config = await apiRequest('/api/configuracoes/fidelidade');
        if (config) {
            window.configFidelidadeAtual = {
                ativo: config.ativo !== false,
                valor_minimo_ponto: Number(parseFloat(config.valor_minimo_ponto ?? 0.0)),
                meta_compras_premio: parseInt(config.meta_compras_premio ?? 10, 10),
                descricao_premio: (config.descricao_premio || 'Prêmio Fidelidade').trim()
            };

            if (configFidelidadeAtivoInput) {
                configFidelidadeAtivoInput.value = window.configFidelidadeAtual.ativo ? 'true' : 'false';
            }
            if (configFidelidadeValorMinimoInput) {
                configFidelidadeValorMinimoInput.value = window.configFidelidadeAtual.valor_minimo_ponto.toFixed(2);
            }
            if (configFidelidadeMetaInput) {
                configFidelidadeMetaInput.value = window.configFidelidadeAtual.meta_compras_premio;
            }
            if (configFidelidadeDescricaoInput) {
                configFidelidadeDescricaoInput.value = window.configFidelidadeAtual.descricao_premio;
            }
            atualizarResumoVisualFidelidade();
        }
    } catch (error) {
        console.error("Erro ao carregar configurações de fidelidade:", error);
    }
};

if (formConfigFidelidade) {
    formConfigFidelidade.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (normalizarCargo(window.usuarioAtual?.cargo) !== 'ADMIN') {
            alert("Acesso negado: apenas o Administrador pode alterar as configurações de fidelidade.");
            return;
        }

        const btnSalvar = document.getElementById('btn-salvar-config-fidelidade');
        const textoOriginal = btnSalvar.innerHTML;
        btnSalvar.innerHTML = "Salvando...";
        btnSalvar.disabled = true;

        if (configFidelidadeFeedback) {
            configFidelidadeFeedback.classList.add('hidden');
        }

        const payload = {
            ativo: configFidelidadeAtivoInput.value === 'true',
            valor_minimo_ponto: parseFloat(configFidelidadeValorMinimoInput.value) || 0.0,
            meta_compras_premio: parseInt(configFidelidadeMetaInput.value, 10) || 10,
            descricao_premio: configFidelidadeDescricaoInput ? configFidelidadeDescricaoInput.value.trim() : "Prêmio Fidelidade"
        };

        try {
            const atualizado = await apiRequest('/api/configuracoes/fidelidade', {
                method: 'PUT',
                body: payload
            });

            window.configFidelidadeAtual = {
                ativo: atualizado.ativo !== false,
                valor_minimo_ponto: Number(parseFloat(atualizado.valor_minimo_ponto ?? 0.0)),
                meta_compras_premio: parseInt(atualizado.meta_compras_premio ?? 10, 10),
                descricao_premio: (atualizado.descricao_premio || payload.descricao_premio || 'Prêmio Fidelidade').trim()
            };

            atualizarResumoVisualFidelidade();

            if (configFidelidadeFeedback) {
                configFidelidadeFeedback.className = "p-3.5 rounded-xl text-xs font-bold flex items-center gap-2 bg-emerald-50 text-emerald-700 border border-emerald-200";
                configFidelidadeFeedback.innerHTML = `<i data-lucide="check-circle" class="w-4 h-4 text-emerald-600 shrink-0"></i> <span>Configurações do Programa de Fidelidade salvas com sucesso!</span>`;
                lucide.createIcons();
            }

            if (typeof carregarClientes === 'function') carregarClientes(fidelidadeAbaAtual);
            if (typeof carregarClientesPDV === 'function') carregarClientesPDV();
        } catch (error) {
            console.error("Erro ao salvar configurações de fidelidade:", error);
            if (configFidelidadeFeedback) {
                configFidelidadeFeedback.className = "p-3.5 rounded-xl text-xs font-bold flex items-center gap-2 bg-red-50 text-red-600 border border-red-200";
                configFidelidadeFeedback.innerHTML = `<i data-lucide="alert-circle" class="w-4 h-4 text-red-500 shrink-0"></i> <span>${error.message || "Erro ao salvar configurações."}</span>`;
                lucide.createIcons();
            }
        } finally {
            btnSalvar.innerHTML = textoOriginal;
            btnSalvar.disabled = false;
            lucide.createIcons();
        }
    });
}

// ==========================================
// CONFIGURAÇÃO DO LIMIAR DE ESTOQUE MÍNIMO (EXCLUSIVO ADMIN)
// ==========================================

const formConfigEstoque = document.getElementById('form-config-estoque');
const configEstoqueLimiarInput = document.getElementById('config-estoque-limiar');
const configEstoqueFeedback = document.getElementById('config-estoque-feedback');

if (formConfigEstoque) {
    formConfigEstoque.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (normalizarCargo(window.usuarioAtual?.cargo) !== 'ADMIN') {
            alert("Acesso negado: apenas o Administrador pode alterar o limiar de estoque mínimo.");
            return;
        }

        const btnSalvar = document.getElementById('btn-salvar-config-estoque');
        const textoOriginal = btnSalvar.innerHTML;
        btnSalvar.innerHTML = "Salvando...";
        btnSalvar.disabled = true;

        if (configEstoqueFeedback) {
            configEstoqueFeedback.classList.add('hidden');
        }

        const limiar_estoque_minimo = parseFloat(configEstoqueLimiarInput.value);
        if (Number.isNaN(limiar_estoque_minimo) || limiar_estoque_minimo < 0) {
            alert("Informe um valor maior ou igual a 0 para o limiar de estoque mínimo.");
            btnSalvar.innerHTML = textoOriginal;
            btnSalvar.disabled = false;
            return;
        }

        try {
            const atualizado = await apiRequest('/api/configuracoes/estoque', {
                method: 'PUT',
                body: { limiar_estoque_minimo }
            });

            window.limiarEstoqueMinimo = Number(parseFloat(atualizado.limiar_estoque_minimo ?? limiar_estoque_minimo));
            if (subtituloLimiarEstoque) {
                subtituloLimiarEstoque.innerText = `Limiar configurado para alerta de reestoque: ≤ ${window.limiarEstoqueMinimo} un`;
            }

            if (configEstoqueFeedback) {
                configEstoqueFeedback.className = "p-3.5 rounded-xl text-xs font-bold flex items-center gap-2 bg-emerald-50 text-emerald-700 border border-emerald-200";
                configEstoqueFeedback.innerHTML = `<i data-lucide="check-circle" class="w-4 h-4 text-emerald-600 shrink-0"></i> <span>Limiar de reestoque (${window.limiarEstoqueMinimo} un) salvo com sucesso!</span>`;
                lucide.createIcons();
            }

            if (typeof carregarEstoque === 'function') carregarEstoque(estoqueAbaAtual);
        } catch (error) {
            console.error("Erro ao salvar limiar de estoque:", error);
            if (configEstoqueFeedback) {
                configEstoqueFeedback.className = "p-3.5 rounded-xl text-xs font-bold flex items-center gap-2 bg-red-50 text-red-600 border border-red-200";
                configEstoqueFeedback.innerHTML = `<i data-lucide="alert-circle" class="w-4 h-4 text-red-500 shrink-0"></i> <span>${error.message || "Erro ao salvar limiar de estoque."}</span>`;
                lucide.createIcons();
            }
        } finally {
            btnSalvar.innerHTML = textoOriginal;
            btnSalvar.disabled = false;
            lucide.createIcons();
        }
    });
}
