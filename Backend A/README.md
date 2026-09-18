# Backend API REST - Sistema Estocaí (Opção A)
> **Servidor Dedicado em Node.js com Express e Firebase Admin SDK**  
> **Curso:** Análise e Desenvolvimento de Sistemas (FATEC Sorocaba - 2026/2)  
> **Projeto:** Estocaí - Gestão de Estoque e Frente de Caixa para a Brasinha Rotisseria  

---

## 1. Visão Geral e Justificativa Acadêmica (Para a Banca)

Este diretório implementa a **Opção A de Arquitetura de Backend**, que estabelece um **Servidor de Aplicação Dedicado (API REST)** intermediando as requisições entre a interface web (*front-end*) e o banco de dados Cloud Firestore (*NoSQL*).

### Por que esta é a opção recomendada perante a Banca Examinadora de ADS?
1. **Atendimento aos Critérios de Formação do Tecnólogo em ADS:** Demonstra domínio pleno da pilha completa de desenvolvimento (*Full-Stack*): consumo e roteamento HTTP, middleware, arquitetura em camadas, serialização JSON, validação de requisições e isolamento de banco.
2. **Segurança e Proteção de Segredos:** A comunicação com o Firebase é feita com credenciais administrativas de servidor (*Firebase Admin SDK*). O navegador não tem acesso direto a chaves de escrita arbitrária do banco.
3. **Transações ACID (Garantia de Não-Concorrência):** Toda a operação de fechamento de comanda/venda e baixa de estoque é executada dentro de uma **transação atômica (`db.runTransaction`)**. Se dois caixas fecharem pedidos para o último item do estoque simultaneamente, o servidor serializa o processamento e impede estoque negativo ou duplicidade.
4. **Preservação do Trabalho Já Realizado:** A equipe mantém o banco Firestore NoSQL que já modelou, sem perder tempo com migrações complexas de banco relacional em cima dos prazos de T3/T4.

---

## 2. Estrutura Arquitetural em Camadas

O projeto adota o padrão em camadas desacopladas (*Layered Architecture*):

```
App Logista/Backend A/
├── .env.example               # Modelo de variáveis de ambiente
├── .gitignore                 # Arquivos ignorados no versionamento
├── index.js                   # Ponto de inicialização do servidor HTTP
├── package.json               # Dependências e scripts de execução
├── README.md                  # Documentação técnica da API
└── src/
    ├── server.js              # Configuração do Express, CORS e Middlewares globais
    ├── config/
    │   └── firebase.js        # Inicialização do Firebase Admin SDK
    ├── controllers/           # Recepção de requisições e respostas HTTP (status codes)
    │   ├── clientesController.js
    │   ├── pedidosController.js
    │   └── produtosController.js
    ├── middlewares/           # Interceptadores (autenticação JWT e tratamento global de erros)
    │   ├── authMiddleware.js
    │   └── errorHandler.js
    ├── routes/                # Definição e agrupamento dos endpoints RESTful
    │   ├── clientesRoutes.js
    │   ├── index.js           # Roteador central (/api)
    │   ├── pedidosRoutes.js
    │   └── produtosRoutes.js
    └── services/              # Camada de Domínio / Regras de Negócio e Transações
        ├── clientesService.js
        ├── pedidosService.js
        └── produtosService.js
```

---

## 3. Especificação dos Endpoints RESTful

### 3.1 Produtos e Cardápio (`/api/produtos`)

| Método | Rota | Descrição |
| :---: | :--- | :--- |
| `GET` | `/api/produtos` | Lista todos os produtos (suporta filtro opcional via query: `?tipo=DIA`). |
| `GET` | `/api/produtos/:id` | Retorna os detalhes de um produto específico. |
| `POST` | `/api/produtos` | Cadastra um novo produto/insumo no catálogo. |
| `PUT` | `/api/produtos/:id` | Atualiza dados cadastrais, preço ou saldo de estoque. |

### 3.2 Pedidos e Vendas (`/api/pedidos`)

| Método | Rota | Descrição |
| :---: | :--- | :--- |
| `POST` | `/api/pedidos/fechar` | **Endpoint Central:** Conclui a venda, valida estoque no servidor, executa a dedução atômica e pontua cliente no programa de fidelidade. |
| `GET` | `/api/pedidos` | Lista os últimos pedidos realizados (suporta `?limite=30`). |
| `GET` | `/api/pedidos/:id` | Consulta os dados completos de um pedido específico. |
| `POST` | `/api/pedidos/:id/cancelar` | Cancela o pedido e estorna automaticamente as quantidades vendidas de volta ao estoque. |

#### Exemplo de Payload para Fechamento de Venda (`POST /api/pedidos/fechar`):
```json
{
  "itens": [
    { "id": "8fXzFlfFEoDcCpQEYxFy", "nome": "Lasanha à Bolonhesa", "quantidade": 2 }
  ],
  "clienteId": "doc_id_ou_cpf",
  "formaPagamento": "PIX",
  "desconto": 0,
  "operadorId": "caixa_balcao_01"
}
```

#### Exemplo de Resposta de Sucesso (`201 Created`):
```json
{
  "sucesso": true,
  "mensagem": "Venda finalizada e baixa de estoque executada com sucesso.",
  "dados": {
    "pedidoId": "AbC123XyZ456",
    "valorTotal": 91.80,
    "subtotal": 91.80,
    "desconto": 0,
    "itensProcessados": 1
  }
}
```

### 3.3 Clientes e Fidelidade (`/api/clientes`)

| Método | Rota | Descrição |
| :---: | :--- | :--- |
| `GET` | `/api/clientes/:cpf` | Consulta o saldo de compras válidas e elegibilidade a prêmio pelo CPF. |
| `POST` | `/api/clientes` | Cadastra um novo cliente com validação de unicidade de CPF. |

---

## 4. Como Executar Localmente

### 4.1 Instalação
Na pasta `App Logista/Backend A`:
```bash
npm install
```

### 4.2 Executando o Servidor
```bash
# Modo de produção/padrão:
npm start

# Modo de desenvolvimento (com auto-reload nativo do Node 18+):
npm run dev
```

O servidor inicializará em: `http://localhost:3000`  
Verificação de integridade: `http://localhost:3000/api/health`

---

## 5. Exemplo de Integração no Front-end (`app.js`)

Para substituir a antiga manipulação direta do Firestore pelo consumo da nova API:

```javascript
// Função moderna chamada no clique do botão "Finalizar Venda"
async function finalizarVendaPelaAPI() {
    try {
        const resposta = await fetch("http://localhost:3000/api/pedidos/fechar", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                itens: carrinho, // Itens selecionados no carrinho
                formaPagamento: "PIX",
                desconto: 0
            })
        });

        const resultado = await resposta.json();

        if (!resposta.ok) {
            throw new Error(resultado.erro || "Falha ao processar venda.");
        }

        alert(`Venda confirmada com sucesso! Pedido ID: ${resultado.dados.pedidoId}`);
        carrinho = [];
        atualizarTelaCarrinho();
        await carregarProdutosPDV();
    } catch (erro) {
        console.error("Erro na requisição:", erro);
        alert(`Erro na venda: ${erro.message}`);
    }
}
```
