# Projeto Copa — Requisitos Funcionais

## Modelos

### Admin

- Email
- Senha

### Team

- Nome

### Vendor

- Nome
- Foto
- Vídeo de comemoração
- Job
- Equipe vinculada

### SDR

- Nome
- Foto
- Job
- Equipe vinculada

### Sale

- Vendor vinculado, obrigatório
- SDR vinculado, opcional
- Valor, opcional
- Data de realização, obrigatório

### Fan

- Nome
- Equipe vinculada

---

## Regras de Negócio

- Vendor só pode ser removido se não tiver vendas vinculadas
- SDR só pode ser removido se não tiver vendas vinculadas
- Team só pode ser removido se não tiver vendors nem SDRs vinculados
- Admin é único no sistema
- Dados exibidos por semana atual e total geral
- Toda venda criada dispara evento SSE para todos os clientes conectados
- Venda pode ser editada mas não removida
- Torcedores e times são pré-populados via seed, sem CRUD

---

## Requisitos Funcionais

### Dashboard TVs

- Header lateral fixo com placar por time
- Loop automático de 4 telas: tabela de pontos, escalação time 1, escalação time 2, escalação time 3
- Popup flutuante com vídeo do vendor ao registrar nova venda, aparece por cima de qualquer tela
- Carrossel de torcedores na tela de escalação

### Admin

- Rota protegida por autenticação JWT
- Cadastro de vendas com vendor obrigatório, SDR opcional, valor opcional e data de realização
- Edição de vendas

### Analytics

- Placar geral: total de vendas por time, semana e total
- Ranking top 3 vendors por job venda e job farm, semana e total
- Escalação por time: vendors, SDRs, fans e vídeos
