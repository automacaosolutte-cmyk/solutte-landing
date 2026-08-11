# Documentação da plataforma Solutte

Atualizada em 11 de agosto de 2026.

## 1. Visão geral

A Solutte é composta por três aplicações que trabalham juntas:

| Aplicação | Repositório | Finalidade |
| --- | --- | --- |
| Site e API Solutte | `solutte-landing` | Landing institucional, acesso, módulos, administração e API segura. |
| Painel Solutte Organizza | `solutte-organizza` | Painel web de configuração e acompanhamento do Organizza. |
| Solutte Organizza Desktop | `solutte-organizza-desktop` | Aplicativo Windows que cria/observa pastas e processa arquivos localmente. |

Endereços publicados:

- Site/API: `https://solutte-automations.vercel.app`
- Painel Organizza: `https://solutte-automations.vercel.app/organizza/`
- Instalador atual: `https://solutte-automations.vercel.app/downloads/Solutte-Organizza-Setup-0.6.8.exe`

## 2. Estado atual e limites importantes

O sistema já é funcional para cadastro, autenticação, administração, importação de clientes, cadastro de regras, comunicação entre web e desktop, criação de estruturas e monitoramento local de arquivos.

Ainda não estão entregues:

- Checkout e confirmação automática de pagamentos.
- Busca real da Izza; a área de conversa está pronta, mas não consulta o índice ainda.
- Leitura do conteúdo de PDFs, OCR, IA generativa ou classificação por IA. A classificação atual é propositalmente determinística e lê somente o nome do arquivo.
- Gestão detalhada de funcionários e suas pastas dentro do módulo Solutte Contábil.
- Módulos Solutte Contábil, Solutte MEI e Solutte Pessoal. Eles aparecem como produtos, porém ainda não possuem sistemas próprios.
- Assinatura digital do instalador Windows. Por isso versões novas podem receber aviso de reputação do Windows/Chrome até que seja contratada e configurada uma assinatura de código.

## 3. Identidade e navegação

A identidade visual em todo o ecossistema usa o lockup escuro da Solutte Automações Empresariais, azul profundo e azul elétrico. Foram aplicados:

- Landing escura, responsiva e com animações sutis.
- Cabeçalho com marca, links por seção, acesso e módulos.
- Tela de acesso e tela de módulos no mesmo padrão visual.
- Card funcional do Solutte Organizza; os demais produtos aparecem como “em breve”.
- Painel web e desktop com a mesma marca e área reservada para a Izza.

## 4. Site, contas e administração

### 4.1 Cadastro e login

1. A pessoa abre o site e clica em **Acessar sistema**.
2. Pode entrar com e-mail e senha ou iniciar um cadastro.
3. O primeiro usuário cadastrado no banco recebe automaticamente o papel `admin` e fica ativo.
4. Usuários posteriores ficam com `payment_status = pending` e `account_status = pending_payment` até que o fluxo de pagamento e aprovação seja implementado.
5. Senhas são armazenadas somente como hash BCrypt; a senha em texto não é gravada.
6. O login gera um JWT de sessão com duração de 8 horas.

### 4.2 Painel administrativo

O administrador possui páginas próprias na mesma guia para:

- Dashboard com número real de usuários, usuários ativos, agentes, consumo de tokens e execuções.
- Lista de usuários cadastrados.
- Alteração de papel (`admin` ou `user`) e status da conta, limitada ao administrador.
- Consumo de tokens por usuário e total. Os números vêm da tabela `token_usage`; sem agentes/uso registrado, permanecem em zero.
- Cadastro e listagem de agentes. Não são criados agentes fictícios.
- Logs de execução e download do histórico em JSON.

Nenhum indicador administrativo é preenchido com dados de demonstração.

## 5. Produtos disponíveis no catálogo

| Produto | Situação | Proposta |
| --- | --- | --- |
| Solutte Organizza | Disponível | Organização local de pastas, arquivos e futura busca Izza. |
| Solutte Contábil | Em desenvolvimento | Setores Fiscal, Contábil, DP, Societário e outros módulos. |
| Solutte MEI | Em desenvolvimento | Comunicação e rotinas para MEI e DASMEI. |
| Solutte Pessoal | Em desenvolvimento | Assistente para organização de compras e rotina doméstica. |

Ao clicar no card disponível, o usuário é direcionado ao painel web do Organizza dentro da mesma guia.

## 6. Solutte Organizza: fluxo operacional

### 6.1 Instalação e conexão do desktop

1. O usuário acessa o painel web, baixa o instalador Windows e instala o aplicativo.
2. Na primeira abertura, o desktop cria automaticamente, na Área de Trabalho:
   - `Organizza`: pasta monitorada de entrada.
   - `Organizza/nprocessados`: destino de arquivos que não podem ser classificados.
   - `Contabilidade`: sugestão para quem vai criar uma estrutura nova de clientes.
   - `BackupOrganiza`: recebe cópias dos arquivos processados.
3. O usuário informa as mesmas credenciais da Solutte no aplicativo desktop.
4. A senha não é gravada pelo aplicativo. Depois do login, somente um token de dispositivo criptografado pelo mecanismo local do Windows é armazenado.
5. O dispositivo envia heartbeat ao painel a cada 60 segundos e consulta novos comandos a cada 15 segundos.

Se o aplicativo já estiver conectado, ele abre diretamente no painel local. A versão 0.6.4 impede duas tentativas de login concorrentes e diferencia `device.paired` de `device.reconnected` no histórico.

### 6.2 Painel web do Organizza

O painel oferece:

- Dashboard com contagem real de clientes, computadores, arquivos indexados, eventos do dia e última atividade.
- Download do desktop Windows.
- Importação de clientes por CSV e modelo de planilha para download.
- Barra de progresso durante a importação.
- Tela de computadores conectados.
- Tela de estruturas de pasta.
- Tela de regras de leitura e fila de classificação manual para arquivos não processados.
- Tela de atividade/auditoria.
- Ação **Limpar dados**, que apaga apenas os dados do Organizza da conta no banco: clientes, dispositivos, regras, estruturas, comandos, índice e eventos. Ela não apaga pastas ou arquivos do computador.

### 6.3 Importação de clientes

O usuário baixa o modelo CSV e preenche as colunas:

```text
código, razão social, CNPJ
```

Durante a importação:

- São aceitos até 2.000 clientes por envio.
- Razão social é obrigatória. Pela importação, o código também é obrigatório; no cadastro individual, o código é opcional e o CNPJ identifica o cliente.
- CNPJ é armazenado apenas com dígitos.
- A razão social é normalizada para remover acentos, cedilha, til e caracteres especiais problemáticos para nomes de pasta.
- O código deve ser único por conta; enviar o mesmo código atualiza os dados daquele cliente.

### 6.4 Dois modos de estrutura de pastas

#### A. Criar uma nova estrutura

Indicado para empresas que ainda não têm uma árvore de clientes definida.

No desktop, a pessoa escolhe **Criar nova estrutura** e seleciona a pasta de destino. A sugestão é `Área de Trabalho/Contabilidade`, mas qualquer pasta permitida pelo Windows pode ser escolhida.

No painel, é possível solicitar:

- **Padrão Solutte**: por cliente cria `CÓDIGO - RAZÃO SOCIAL`; dentro dela, o ano vigente; dentro do ano, `Dpto Contábil`, `Dpto Fiscal` e `Dpto Pessoal`; ao lado da pasta do ano, `Dpto Jurídico`; dentro de Pessoal, `Funcionários`.
- Cada departamento anual recebe competências mensais no formato `MMYYYY` (por exemplo, `012026` a `122026`).
- **Modelo personalizado**: uma pasta/subpasta por linha, com as variáveis `{ANO}` e `{MES}`.

O painel não cria pastas diretamente no computador. Ele grava um comando seguro no banco; o desktop autenticado consulta esse comando, cria as pastas localmente, informa resultado e gera evento de auditoria.

#### B. Ler uma estrutura existente

Indicado para empresas que já possuem uma pasta de clientes.

1. No desktop, a pessoa escolhe **Usar estrutura existente**.
2. Seleciona sua pasta já existente.
3. O desktop percorre somente diretórios e subdiretórios.
4. Nenhum arquivo é aberto, enviado ou alterado nesse processo.
5. A árvore é registrada para a conta no banco: caminho raiz, total de pastas, caminhos relativos, pai, profundidade e associação com cliente quando identificável.

Nesse modo, o Organizza não cria, renomeia nem exclui pastas. Para enviar arquivos à estrutura existente, a regra precisa informar um destino relativo que já exista.

### 6.5 Monitoramento e classificação de arquivos

O desktop observa `Área de Trabalho/Organizza` continuamente. Quando detecta um arquivo:

1. Ignora qualquer item dentro de `nprocessados`, evitando ciclo de leitura.
2. Aguarda o arquivo estabilizar antes de processar.
3. Lê apenas o nome do arquivo; não abre conteúdo do documento.
4. Busca o cliente pelo CNPJ presente no nome, pelo código cadastrado (inclusive códigos curtos como `30`) ou pela razão social.
5. Busca competência no padrão `MMYYYY`, por exemplo `072026`.
6. Compara os termos obrigatórios cadastrados em uma regra.
7. Quando todos os dados necessários são encontrados, copia o arquivo para o backup e move o original para o destino calculado. Caso o nome não seja suficiente e seja um PDF com texto, a leitura é feita somente no computador para procurar CNPJ, código, competência e tipo; o conteúdo não é enviado à web.
8. Registra evento local e envia evento resumido ao painel.

Exemplo de um nome esperado:

```text
090 DAS 072026 12.345.678/0001-90.pdf
```

Uma regra de DAS para o departamento Fiscal, juntamente com o CNPJ/código de cliente e `072026`, permite calcular o destino de forma determinística.

### 6.6 Regras de leitura

Cada regra contém:

- Nome da regra.
- Até 12 termos obrigatórios, separados por vírgula.
- Departamento: Fiscal, Contábil, Pessoal ou Jurídico.
- Opcionalmente, destino relativo, por exemplo `Fiscal/{ANO}/{MES}`.

Em estrutura padrão, o desktop usa o departamento para formar o caminho. Em estrutura existente, o destino relativo é obrigatório na prática e precisa corresponder a uma pasta já lida da árvore do cliente.

### 6.7 Arquivos não processados e backup

Um arquivo é enviado a `Organizza/nprocessados` quando não há regra compatível, cliente identificado, competência necessária ou destino válido.

- O desktop mantém `nprocessados` fora do monitoramento de entrada para não entrar em loop.
- Ele revisa automaticamente os pendentes a cada 30 segundos após uma regra/estrutura compatível estar disponível.
- Não é necessário mover manualmente o arquivo de volta para `Organizza` enquanto o desktop está ativo.
- Cada arquivo pendente também é registrado em uma fila no painel, com o motivo, CNPJ e competência que puderem ser reconhecidos.
- Pelo painel, o usuário pode escolher cliente, departamento, competência e destino para resolver somente aquele arquivo. Opcionalmente, pode salvar os termos como uma nova regra para os próximos documentos.
- Ao receber uma resolução manual, o desktop move o arquivo de `nprocessados` para o destino escolhido e marca a fila como concluída. Se uma regra posterior resolver o arquivo automaticamente, a fila também é concluída.
- Quando um arquivo é processado, é criada uma cópia em `BackupOrganiza/DD-MM-AAAA/Dpto .../arquivo` antes da movimentação. O arquivo original segue para o destino final. Arquivos ainda sem departamento ficam em `A classificar`, nunca em uma pasta `sem-clientes`.

## 7. Izza

Já existe uma área visual chamada **Izza** no desktop e referências no painel. A arquitetura prevista é local e determinística:

- O desktop criará/atualizará um índice de arquivos processados, contendo nome, caminho relativo, cliente, competência, tipo, departamento e hash quando aplicável.
- A Izza consultará esse índice local para responder a buscas como “me dê o DAS da VR Flex de maio”, em vez de varrer todas as pastas a cada pergunta.
- A futura interface poderá oferecer abrir arquivo, abrir pasta e detalhes do cliente/pasta.

Esta busca ainda não está implementada. Hoje, a caixa de conversa apenas informa que o espaço está preparado.

## 8. Banco de dados e dados reais

O banco é Turso, compatível com SQLite e acessado pela API hospedada na Vercel. Não há banco SQLite dentro da landing ou do executável para os dados centrais.

Variáveis obrigatórias na Vercel:

```text
TURSO_DATABASE_URL
TURSO_AUTH_TOKEN
JWT_SECRET
```

Tabelas principais:

| Grupo | Tabelas |
| --- | --- |
| Contas e administração | `users`, `agents`, `token_usage`, `execution_logs` |
| Organizza | `organiza_devices`, `organiza_clients`, `organiza_file_index`, `organiza_events`, `organiza_commands`, `organiza_rules` |
| Estruturas | `organiza_folder_structures`, `organiza_folder_nodes` |

Os dados exibidos nos dashboards são contagens e registros dessas tabelas, não valores fictícios.

## 9. Segurança implementada

- Senhas em BCrypt com custo 12.
- JWT de sessão de 8 horas para usuários.
- JWT de dispositivo com escopo específico do Organizza, validade de 180 dias.
- Token do dispositivo protegido pelo armazenamento seguro local do Windows/Electron.
- Separação de rotas autenticadas, administrativas e de dispositivo.
- Verificação de propriedade: usuário só acessa seus próprios clientes, dispositivos, regras, estruturas e eventos.
- CORS restrito ao painel publicado e ao ambiente local de desenvolvimento.
- Validação de tamanho, caminhos relativos e bloqueio de `..` em destinos personalizados.
- A leitura da estrutura existente envia somente dados de pastas, nunca o conteúdo dos arquivos.

Pontos de segurança ainda necessários antes de uma operação comercial ampla:

- Assinatura de código Windows (OV/EV ou Microsoft Artifact Signing).
- Recuperação de senha e confirmação de e-mail.
- Pagamento real com webhook e aprovação automática/manual.
- Revogação de dispositivos pela interface administrativa.
- Rate limiting, auditoria mais detalhada e política de retenção de logs.
- Backups operacionais e monitoramento de erros centralizado.

## 10. Versionamento atual

### Site e API (`solutte-landing`)

Branch publicada: `agent/publicar-painel-real`.

| Commit | Descrição |
| --- | --- |
| `2e4c5b6` | Diferencia pareamento de reconexão de dispositivo. |
| `db7cf6d` | Registro de estruturas e destinos determinísticos. |
| `9f2ced0` | Aplicação do lockup oficial. |
| `48bfbe8` | Padronização de marca e paleta azul. |
| `8c57091` | Acesso e módulos no tema escuro. |
| `50b79b3` | Regras e limpeza de dados do Organizza. |

### Painel Organizza (`solutte-organizza`)

Branch publicada: `main`.

| Commit | Descrição |
| --- | --- |
| `54a45f8` | Corrige versão exibida do desktop para 0.6.4. |
| `320b4c1` | Atualiza o link de download. |
| `bf7aa31` | Adiciona leitura de estruturas existentes e personalizadas. |
| `5a81089` | Aplica lockup oficial. |
| `fd3aacc` | Adiciona regras e limpeza do Organizza. |

### Desktop (`solutte-organizza-desktop`)

Branch publicada: `main`.

| Versão / commit | Descrição |
| --- | --- |
| `0.6.4` / `038b2c9` | Estabiliza a conexão: evita login concorrente, prepara pastas antes da tela e trata falhas da interface. |
| `0.6.3` / `12367c9` | Leitura de estruturas existentes sem criar pastas. |
| `0.6.x` / `bea4fa2` | Processamento de arquivos por regras. |
| `0.6.x` / `07a50ee` | Pastas locais, backup, não processados e ícone. |
| `0.6.x` / `c3ca848` | Execução local da criação de estruturas solicitada pela web. |

## 11. Roteiro de teste atual

1. Criar ou acessar uma conta no site Solutte.
2. Abrir **Módulos** e selecionar **Solutte Organizza**.
3. Baixar e instalar o desktop 0.6.4 no Windows.
4. Abrir o desktop e confirmar as quatro pastas criadas na Área de Trabalho.
5. Entrar com a mesma conta usada no painel.
6. Confirmar que o computador aparece em **Computadores**.
7. Em **Clientes**, baixar o modelo CSV, preencher e importar. Confirmar a barra de progresso e a lista.
8. No desktop, escolher criar uma nova estrutura ou ler uma existente.
9. Para nova estrutura, selecionar a pasta de destino e, no painel, solicitar o padrão Solutte ou modelo personalizado.
10. Para estrutura existente, confirmar que a árvore aparece no painel e que nenhum arquivo foi alterado.
11. Em **Regras de leitura**, criar uma regra, por exemplo DAS/Fiscal, e definir o destino para a estrutura existente quando aplicável.
12. Colocar um arquivo de teste na pasta `Organizza`, com código ou CNPJ, termos da regra e competência `MMYYYY` no nome.
13. Conferir destino, cópia em `BackupOrganiza`, eventos no painel e eventual ida a `nprocessados`.
14. Criar uma regra compatível e aguardar até 30 segundos para a revisão automática dos pendentes.

## 12. Próximas etapas recomendadas

1. Validar o fluxo acima em um computador Windows com uma conta de teste.
2. Ajustar a taxonomia real de regras contábeis e exemplos de nomes de arquivos.
3. Implementar o índice local e a busca determinística da Izza.
4. Adicionar revogação de dispositivo e gestão de permissões no admin.
5. Integrar cobrança, pagamento e aprovação de novos usuários.
6. Contratar assinatura de código para o instalador Windows antes de distribuir a usuários externos.
7. Evoluir o Solutte Contábil a partir das estruturas e regras já criadas no Organizza.
