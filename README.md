# Painel de Leads Neroes (MVP)

Uma única página (`painel-leads.html`) que mostra o estado da busca de leads. **Sem servidor, sem API do Claude, sem custo.**

## Usar
1. Abra `painel-leads.html` (duplo clique).
2. Para atualizar: ponha os ficheiros novos em `entrada/` e execute `atualizar-painel.bat` (precisa de Node.js 18+).

## Como entram leads novos (com o plano Claude, sem créditos)
- Peça ao Claude (app ou Claude Code, com a sua conta) para pesquisar leads em sites oficiais e **gravar o resultado** em `entrada/AAAA-MM-DD-segmento.json` (array JSON com `nome, cargo, empresa, segmento, telefone, email, cidade, fonte`) ou `.tsv` (11 colunas: Nome, Cargo, Empresa, Segmento, Telefone, Email, LinkedIn, Cidade, Responsável, Estado, Fonte).
- **Primeiro**, ponha em `entrada/` a base que a equipa já tem (para evitar repetidos).

## O que o script faz
- Junta sem repetidos (empresa ou nome que contém o outro, email, telefone).
- `--verificar`: reabre as páginas citadas e confirma se email/telefone/nome lá estão (só HTTP; não usa IA).
- Gera o painel com os dados embutidos.

## Dados pessoais
`entrada/`, `dados/` e `painel-leads.html` contêm dados pessoais e estão no `.gitignore`. Não os envie por e-mail nem os ponha no GitHub.
