const path = require('path');
const crypto = require('crypto');

// Garante carregamento dos pacotes instalados em backend/node_modules
const backendNodeModules = path.join(__dirname, '..', '..', 'node_modules');
if (!module.paths.includes(backendNodeModules)) {
    module.paths.unshift(backendNodeModules);
}

require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });
require('dotenv').config({ path: path.join(__dirname, '..', '..', '..', '.env') });

const nodemailer = require('nodemailer');

const APPROVAL_JWT_SECRET =
    process.env.APPROVAL_JWT_SECRET ||
    process.env.JWT_SECRET ||
    'estocai-super-secret-approval-jwt-key-2026';

/**
 * Codifica um objeto/buffer em Base64URL (padrão RFC 7519 para JWT).
 */
function base64UrlEncode(input) {
    const str = typeof input === 'string' ? input : JSON.stringify(input);
    return Buffer.from(str, 'utf8')
        .toString('base64')
        .replace(/=/g, '')
        .replace(/\+/g, '-')
        .replace(/\//g, '_');
}

/**
 * Decodifica uma string Base64URL para UTF-8.
 */
function base64UrlDecode(str) {
    let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
    while (base64.length % 4 !== 0) {
        base64 += '=';
    }
    return Buffer.from(base64, 'base64').toString('utf8');
}

/**
 * Gera um token JWT exclusivo (HS256) para o link de aprovação de conta enviado por e-mail.
 * @param {Object} dados - { uid, email, cargo, tenantId }
 * @returns {string} Token JWT assinado
 */
function gerarTokenAprovacao({ uid, email, cargo, tenantId }) {
    const header = { alg: 'HS256', typ: 'JWT' };
    const agoraSegundos = Math.floor(Date.now() / 1000);
    const payload = {
        purpose: 'aprovar_usuario',
        uid: String(uid),
        email: String(email || ''),
        cargo: String(cargo || ''),
        tenantId: String(tenantId || ''),
        iat: agoraSegundos,
        exp: agoraSegundos + 60 * 60 * 24 * 7 // válido por 7 dias
    };

    const headerEncoded = base64UrlEncode(header);
    const payloadEncoded = base64UrlEncode(payload);
    const assinatura = crypto
        .createHmac('sha256', APPROVAL_JWT_SECRET)
        .update(`${headerEncoded}.${payloadEncoded}`)
        .digest('base64')
        .replace(/=/g, '')
        .replace(/\+/g, '-')
        .replace(/\//g, '_');

    return `${headerEncoded}.${payloadEncoded}.${assinatura}`;
}

/**
 * Valida o token JWT exclusivo de aprovação de usuário.
 * @param {string} token - Token JWT recebido na rota /api/auth/aprovar-usuario
 * @returns {Object} Payload decodificado se válido, ou lança erro
 */
function verificarTokenAprovacao(token) {
    if (!token || typeof token !== 'string') {
        throw new Error('Token de aprovação ausente.');
    }

    const partes = token.trim().split('.');
    if (partes.length !== 3) {
        throw new Error('Formato de token de aprovação inválido.');
    }

    const [headerEncoded, payloadEncoded, assinaturaRecebida] = partes;
    const assinaturaEsperada = crypto
        .createHmac('sha256', APPROVAL_JWT_SECRET)
        .update(`${headerEncoded}.${payloadEncoded}`)
        .digest('base64')
        .replace(/=/g, '')
        .replace(/\+/g, '-')
        .replace(/\//g, '_');

    if (assinaturaRecebida !== assinaturaEsperada) {
        throw new Error('Assinatura do token de aprovação inválida.');
    }

    const payload = JSON.parse(base64UrlDecode(payloadEncoded));
    const agoraSegundos = Math.floor(Date.now() / 1000);

    if (payload.exp && agoraSegundos > payload.exp) {
        throw new Error('O token de aprovação expirou.');
    }

    if (payload.purpose !== 'aprovar_usuario' || !payload.uid) {
        throw new Error('Finalidade do token inválida para aprovação de usuário.');
    }

    return payload;
}

/**
 * Cria o transporter do Nodemailer usando variáveis de ambiente SMTP (quando configuradas)
 * ou transporte JSON/Stream seguro em ambiente de desenvolvimento para evitar falhas de rede.
 */
async function criarTransporter() {
    const host = process.env.SMTP_HOST;
    const port = parseInt(process.env.SMTP_PORT || '587', 10);
    const user = (process.env.SMTP_USER || process.env.EMAIL_USER || '').trim();
    const pass = (process.env.SMTP_PASS || process.env.EMAIL_PASS || '').replace(/\s+/g, '');

    if (host && user && pass) {
        return nodemailer.createTransport({
            host,
            port,
            secure: port === 465,
            auth: { user, pass }
        });
    }

    if (user && pass) {
        return nodemailer.createTransport({
            service: process.env.SMTP_SERVICE || 'gmail',
            auth: { user, pass }
        });
    }

    // Fallback seguro usando jsonTransport do próprio Nodemailer quando SMTP não está configurado no .env
    return nodemailer.createTransport({
        jsonTransport: true
    });
}

/**
 * Envia e-mail para os fornecedores/administradores do sistema (process.env.ADMIN_EMAIL)
 * contendo os dados da nova conta e o link seguro para aprovação.
 */
async function enviarEmailAprovacaoUsuario({ uid, nome, email, cargo, tenantId, nomeFantasia }) {
    const adminEmail = process.env.ADMIN_EMAIL || 'brasinhagrilldev@gmail.com';
    const remetente = process.env.SMTP_FROM || process.env.SMTP_USER || 'brasinhagrilldev@gmail.com';
    const appBaseUrl = process.env.APP_BASE_URL || `http://localhost:${process.env.PORT || 3000}`;

    const tokenAprovacao = gerarTokenAprovacao({ uid, email, cargo, tenantId });
    const linkAprovacao = `${appBaseUrl}/api/auth/aprovar-usuario?token=${encodeURIComponent(tokenAprovacao)}`;

    const htmlBody = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #fed7aa; border-radius: 16px; background-color: #fffaf5;">
            <h2 style="color: #ea580c; margin-top: 0;">Estocaí — Solicitação de Aprovação de Nova Conta</h2>
            <p style="color: #374151; font-size: 14px;">
                Um novo usuário realizou o cadastro no sistema <strong>Estocaí</strong> e aguarda aprovação para liberar o acesso.
            </p>
            <table style="width: 100%; border-collapse: collapse; margin: 16px 0; background: #ffffff; border-radius: 12px; overflow: hidden; border: 1px solid #f3f4f6;">
                <tr>
                    <td style="padding: 10px 14px; font-weight: bold; color: #6b7280; width: 35%; border-bottom: 1px solid #f3f4f6;">Nome:</td>
                    <td style="padding: 10px 14px; color: #111827; border-bottom: 1px solid #f3f4f6;">${nome}</td>
                </tr>
                <tr>
                    <td style="padding: 10px 14px; font-weight: bold; color: #6b7280; border-bottom: 1px solid #f3f4f6;">E-mail:</td>
                    <td style="padding: 10px 14px; color: #111827; border-bottom: 1px solid #f3f4f6;">${email}</td>
                </tr>
                <tr>
                    <td style="padding: 10px 14px; font-weight: bold; color: #6b7280; border-bottom: 1px solid #f3f4f6;">Função / Role:</td>
                    <td style="padding: 10px 14px; color: #111827; border-bottom: 1px solid #f3f4f6;">${cargo}</td>
                </tr>
                <tr>
                    <td style="padding: 10px 14px; font-weight: bold; color: #6b7280;">Tenant (Empresa):</td>
                    <td style="padding: 10px 14px; color: #111827;">${nomeFantasia ? `${nomeFantasia} (${tenantId})` : tenantId}</td>
                </tr>
            </table>
            <div style="text-align: center; margin: 24px 0;">
                <a href="${linkAprovacao}" style="display: inline-block; background-color: #ea580c; color: #ffffff; font-weight: bold; text-decoration: none; padding: 14px 28px; border-radius: 12px;">
                    Aprovar Conta Agora
                </a>
            </div>
            <p style="color: #6b7280; font-size: 12px; word-break: break-all;">
                Caso o botão acima não funcione, copie e cole o link abaixo no navegador ou envie uma requisição para:<br>
                <a href="${linkAprovacao}" style="color: #ea580c;">${linkAprovacao}</a>
            </p>
        </div>
    `;

    const textBody = [
        'Estocaí - Solicitação de Aprovação de Nova Conta',
        `Nome: ${nome}`,
        `E-mail: ${email}`,
        `Função/Role: ${cargo}`,
        `Tenant: ${nomeFantasia ? `${nomeFantasia} (${tenantId})` : tenantId}`,
        '',
        `Para aprovar este usuário, acesse o link seguro abaixo:`,
        linkAprovacao
    ].join('\n');

    const transporter = await criarTransporter();
    const info = await transporter.sendMail({
        from: `"Estocaí Sistema" <${remetente}>`,
        to: adminEmail,
        subject: `[Estocaí] Aprovação Pendente: ${nome} (${cargo})`,
        text: textBody,
        html: htmlBody
    });

    console.log('================================================================');
    console.log(`[Email Service] Notificação de aprovação enviada para: ${adminEmail}`);
    console.log(`[Email Service] Usuário: ${nome} <${email}> | Role: ${cargo} | Tenant: ${tenantId}`);
    console.log(`[Email Service] Link de Aprovação Rápida: ${linkAprovacao}`);
    console.log('================================================================');

    return {
        enviadoPara: adminEmail,
        linkAprovacao,
        tokenAprovacao,
        messageId: info.messageId
    };
}

module.exports = {
    gerarTokenAprovacao,
    verificarTokenAprovacao,
    enviarEmailAprovacaoUsuario
};

