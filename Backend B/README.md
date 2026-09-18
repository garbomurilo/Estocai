# Backend Serverless - Sistema Estocaí
> **Arquitetura Baseada em Funções Serverless (Firebase Cloud Functions) e Transações ACID**  
> **Curso:** Análise e Desenvolvimento de Sistemas (FATEC Sorocaba - 2026/2)  
> **Projeto:** Estocaí - Gestão de Estoque e Frente de Caixa para a Brasinha Rotisseria  

---

## 1. Visão Geral e Justificativa Acadêmica (Para a Banca)

Este diretório implementa a **Opção B de Arquitetura de Backend**, fundamentada no paradigma **Serverless (FaaS - Function as a Service)** e orientada a eventos.

### Por que esta arquitetura é relevante para um TCC de ADS?
1. **Desacoplamento e Segurança:** Retira as regras de negócio sensíveis (cálculo de valores, validação de disponibilidade e baixa de estoque) do cliente web (`app.js`) e as centraliza em ambiente seguro de nuvem (*server-side*).
2. **Garantia de Transações ACID (Atomicidade, Consistência, Isolamento e Durabilidade):** A dedução do estoque é executada através de **Firestore Transactions** (`db.runTransaction`), impedindo inconsistências e condições de corrida (*race conditions*) caso múltiplos atendentes fechem pedidos ao mesmo tempo no balcão.
3. **Escalabilidade Elástica e Custo Operacional Zero:** Funções serverless escalam de zero sob demanda, alinhando-se perfeitamente ao perfil de microempresas locais (como a *Brasinha Rotisseria*), que não necessitam arcar com servidores dedicados ociosos fora do horário comercial.
4. **Regras de Segurança Granulares:** Acompanhada pelo arquivo `firestore.rules`, a arquitetura bloqueia modificações diretas de saldo de estoque por clientes desautorizados via navegador.

---

## 2. Estrutura do Módulo de Backend

```
App Logista/backend/
├── firebase.json              # Configuração do Firebase CLI e portas dos emuladores locais
├── firestore.indexes.json     # Definição de índices compostos do banco NoSQL
├── firestore.rules            # Regras formais de segurança e controle de acesso
├── index.js                   # Ponto de entrada (definição das Cloud Functions e Triggers)
├── package.json               # Dependências do ecossistema Node.js / Firebase Admin
├── .gitignore                 # Arquivos ignorados pelo controle de versão
├── services/
│   ├── vendasService.js       # Regra de negócio do fechamento de vendas (transação atômica)
│   └── estoqueService.js      # Regra de negócio de cancelamentos e alertas de estoque crítico
└── README.md                  # Documentação técnica e guia de execução
```

---

## 3. Catálogo de Funções Serverless Implementadas

### 3.1 `finalizarVenda` (HTTPS Callable Function)
- **Tipo:** Chamada remota autenticada (`functions.https.onCall`).
- **Objetivo:** Concluir o pedido da comanda aberta no PDV.
- **Fluxo de Execução:**
  1. Valida se o operador que realizou a chamada possui token de autenticação ativo.
  2. Inicia uma transação no Firestore (`runTransaction`).
  3. Realiza a leitura dos documentos de cada item do carrinho na coleção `produtos`.
  4. Valida se há saldo suficiente em estoque no servidor. Se insuficiente, a transação é abortada (*rollback* automático).
  5. Deduz as quantidades vendidas de cada produto de forma atômica.
  6. Gera o registro permanente do pedido na coleção `pedidos`, calculando o valor final com carimbo de data/hora do servidor (*ServerTimestamp*).
  7. Se houver cliente identificado (CPF), incrementa a contagem de compras válidas no programa de fidelidade (`clientes/{id}`).
  8. Retorna o comprovante e o ID do pedido para a interface.

### 3.2 `cancelarPedido` (HTTPS Callable Function)
- **Tipo:** Chamada remota autenticada (`functions.https.onCall`).
- **Objetivo:** Cancelar um pedido aberto e estornar automaticamente as mercadorias para o estoque.
- **Fluxo de Execução:**
  1. Verifica autenticação do operador.
  2. Localiza o pedido e verifica se ele já não foi cancelado.
  3. Devolve as quantidades exatas de cada item ao saldo da coleção `produtos`.
  4. Atualiza o status do pedido para `CANCELADO`.

### 3.3 `monitorarEstoque` (Trigger Orientada a Eventos)
- **Tipo:** Gatilho de banco de dados (`firestore.document('produtos/{produtoId}').onWrite`).
- **Objetivo:** Monitoramento reativo em tempo real.
- **Funcionamento:** Sempre que o campo `estoque` de qualquer produto for atualizado, a função compara os valores antes e depois. Se o novo saldo atingir nível igual ou inferior a 5 unidades, um log de alerta é gerado no console do servidor para notificar a rotisseria sobre a necessidade de reposição de insumos.

### 3.4 `healthCheck` (HTTPS Request)
- **Tipo:** Endpoint HTTP simples (`onRequest`).
- **Objetivo:** Monitoramento de disponibilidade e integridade da camada de backend.

---

## 4. Guia de Execução Local (Emulador) e Implantação

### 4.1 Pré-requisitos
- Node.js instalado (versão 18 ou superior).
- Firebase CLI instalado globalmente:
  ```bash
  npm install -g firebase-tools
  ```

### 4.2 Instalação das Dependências
Na pasta `App Logista/backend`, execute:
```bash
npm install
```

### 4.3 Executando os Emuladores Locais (Sem custo e sem mexer na nuvem de produção)
Para testar o backend localmente na sua máquina:
```bash
npm run serve
```
Isso iniciará:
- **Cloud Functions:** `http://localhost:5001/brasiinha/southamerica-east1/...`
- **Firestore Emulator:** `localhost:8080`
- **Emulator UI (Painel visual completo):** `http://localhost:4000`

### 4.4 Implantação em Nuvem (Deploy Oficial)
Quando o projeto estiver pronto para produção:
```bash
firebase login
firebase deploy --only functions,firestore:rules
```

---

## 5. Como o Front-end (`app.js`) consome a Cloud Function

Substitua o loop manual de baixa de estoque no front-end pela chamada segura do SDK:

```javascript
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-functions.js";

const functions = getFunctions(app, "southamerica-east1");
const finalizarVendaFn = httpsCallable(functions, "finalizarVenda");

// No evento de clique do botão Finalizar Venda:
try {
    const resposta = await finalizarVendaFn({
        itens: carrinho, // [{ id: "...", nome: "...", preco: 45.90, quantidade: 2 }]
        clienteId: "cpf_ou_id_do_cliente",
        formaPagamento: "PIX",
        desconto: 0
    });

    console.log("Venda concluída com sucesso:", resposta.data);
    alert(`Venda finalizada! Pedido ID: ${resposta.data.pedidoId}`);
} catch (error) {
    console.error("Erro retornado pelo servidor:", error);
    alert(`Falha na venda: ${error.message}`);
}
```
Com essa chamada, toda a validação ocorre dentro do servidor, garantindo conformidade arquitetural perante a banca examinadora da FATEC.
