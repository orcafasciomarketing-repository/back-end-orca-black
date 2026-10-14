---
name: commitar
description: Roda os testes e commita todas as alterações do projeto com a mensagem passada. Uso - /commitar <mensagem do commit>
disable-model-invocation: true
argument-hint: <mensagem do commit>
allowed-tools: Bash(git status:*), Bash(git diff:*), Bash(git add:*), Bash(git commit:*), Bash(git log:*), Bash(npm test:*)
---

Commitar as alterações do projeto com a mensagem: $ARGUMENTS

Siga os passos em ordem e pare no primeiro que falhar, explicando o motivo em português simples.

1. **Mensagem**: se `$ARGUMENTS` estiver vazio, não commite. Peça a mensagem e encerre.

2. **Há o que commitar?** Rode `git status --short`. Se não houver alterações, avise "Nada para commitar" e encerre.

3. **Arquivos que não podem ir para o git**: confira a lista do `git status`. Se aparecer `.env`, `node_modules/`, arquivos de log ou qualquer arquivo com senha/token, NÃO commite: mostre quais são e encerre.

4. **Testes**: rode `npm test`.
   - Falhas só em `tests/config.test.js` (variáveis do `.env` faltando) não bloqueiam: apenas avise quais variáveis faltam.
   - Qualquer outra falha bloqueia: mostre o nome dos testes que falharam e encerre sem commitar.

5. **Commit**: rode `git add -A` e depois `git commit -m "<mensagem>"` com a mensagem exatamente como foi escrita em `$ARGUMENTS`. Não adicione nenhuma linha extra (sem `Co-Authored-By` nem assinatura). Commite na branch atual. Nunca faça `git push`, `--amend`, `--no-verify` nem `reset`.

6. **Resumo**: rode `git log -1 --stat` e mostre de forma curta: hash do commit, mensagem, quantidade de arquivos alterados e o resultado dos testes (quantos passaram e se faltou alguma variável no `.env`). Lembre que o push não foi feito.
