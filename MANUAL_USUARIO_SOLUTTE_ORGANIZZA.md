# Manual do usuário — Solutte Organizza

Este manual explica como usar o Solutte Organizza do primeiro acesso à organização dos arquivos.

## Antes de começar

Você precisa de:

- Uma conta Solutte com acesso ativo.
- Um computador com Windows para executar o **Solutte Organizza Desktop**.
- Acesso à internet enquanto utiliza a sincronização web/desktop.
- Permissão para criar ou acessar as pastas que serão usadas para os clientes.

O painel web configura e mostra os resultados. O aplicativo desktop é quem lê as pastas, cria estruturas, observa arquivos e faz movimentações no computador.

## 1. Acessar sua conta

1. Acesse [solutte-automations.vercel.app](https://solutte-automations.vercel.app).
2. Clique em **Acessar sistema**.
3. Informe e-mail e senha.
4. Após entrar, abra **Módulos**.
5. Clique no card **Solutte Organizza**.

### Resultado esperado

Você verá o painel do Organizza com o menu lateral:

- Visão geral
- Clientes
- Estruturas
- Regras de leitura
- Computadores
- Atividade

Se o painel indicar **Desktop não conectado**, ainda será possível consultar dados e preparar configurações, mas nenhuma operação de pasta será executada no computador.

## 2. Instalar o aplicativo desktop

1. No painel Organizza, clique em **Baixar para Windows**.
2. Baixe a versão exibida no botão.
3. Antes de executar, confirme que o download veio do endereço oficial da Solutte.
4. Instale e abra o **Solutte Organizza Desktop**.
5. Entre com o mesmo e-mail e senha usados no painel web.

### Resultado esperado

Após o login, o desktop mostra a mensagem **Conectado: seu nome** e abre sua área de trabalho operacional.

Na primeira execução, o programa cria estas pastas na Área de Trabalho:

| Pasta | Finalidade |
| --- | --- |
| `Organizza` | Entrada monitorada de arquivos. |
| `Organizza/nprocessados` | Arquivos que ainda não puderam ser classificados. |
| `Contabilidade` | Sugestão de local para uma estrutura nova de clientes. |
| `BackupOrganiza` | Cópias de segurança dos arquivos que foram processados. |

No painel web, em **Computadores**, o computador deve aparecer como conectado. A atualização pode levar até 60 segundos.

> Importante: o desktop precisa permanecer aberto para criar pastas, acompanhar a pasta `Organizza` e executar comandos solicitados pelo painel.

## 3. Conhecer a tela do desktop

Depois de conectado, o desktop possui:

- **Entrada monitorada**: mostra o caminho da pasta `Organizza` e possui o botão **Abrir pasta**.
- **Atividade em tempo real**: exibe logs locais, como conexão, detecção de arquivo e conclusão de movimentação.
- **Definir pasta de clientes**: abre o seletor seguro do Windows para escolher onde ficam as pastas de clientes.
- **Abrir backup**: abre `BackupOrganiza`.
- **Abrir painel web**: retorna ao painel Organizza no navegador.
- **Izza**: espaço reservado para a busca local de documentos, ainda em preparação.

## 4. Importar a base de clientes

Antes de criar estruturas ou identificar documentos, importe seus clientes.

1. No painel, abra **Clientes**.
2. Clique em **Baixar modelo**.
3. Abra o arquivo CSV no Excel ou editor compatível.
4. Preencha as colunas:

```text
código, razão social, CNPJ
```

5. Salve o arquivo como CSV.
6. Clique em **Selecionar CSV** e escolha o arquivo.
7. Clique em **Importar clientes**.

### Regras da planilha

- Código e razão social são obrigatórios.
- O código não pode se repetir na mesma planilha.
- O CNPJ pode ser informado com ou sem pontuação.
- A razão social é normalizada para uso seguro em nomes de pasta: acentos e caracteres especiais problemáticos são removidos.
- É possível importar até 2.000 clientes por vez.

### Resultado esperado

A barra de progresso mostra as etapas:

1. Lendo a planilha.
2. Validando clientes.
3. Enviando clientes.
4. Atualizando a base.
5. Carregando clientes no painel.
6. Importação concluída.

Ao final, a lista de clientes aparece abaixo do formulário. Se uma planilha for importada novamente com o mesmo código, os dados desse cliente são atualizados.

## 5. Escolher onde ficam as pastas dos clientes

Há dois modos. Escolha o que representa sua realidade.

### Opção A — Você já tem uma estrutura de pastas

Use esta opção se sua empresa já possui uma pasta com clientes e subpastas organizadas.

1. Abra o desktop e confirme que ele está conectado.
2. No painel web, vá em **Estruturas**.
3. Clique em **Escolher pasta no desktop**.
4. Aguarde até 15 segundos para o seletor aparecer no Windows.
5. No desktop, escolha **Usar estrutura existente**.
6. Selecione a pasta raiz onde estão seus clientes.

### Resultado esperado

- O desktop lê somente pastas e subpastas.
- Arquivos não são abertos, enviados, renomeados ou apagados nessa etapa.
- A árvore de pastas é registrada no painel.
- Em **Estruturas**, você verá o caminho escolhido, total de pastas e uma prévia da árvore.

Use esse modo se não quer que o Organizza altere a organização já existente.

### Opção B — Você quer que a Solutte crie uma estrutura nova

1. No painel, vá em **Estruturas**.
2. Clique em **Escolher pasta no desktop**.
3. No desktop, escolha **Criar nova estrutura**.
4. Escolha a pasta onde as estruturas serão criadas. A pasta `Contabilidade` da Área de Trabalho é uma sugestão, mas você pode selecionar outra.
5. Volte ao painel web.
6. Escolha **Usar padrão Solutte** ou **Criar meu próprio modelo**.
7. Clique em **Criar estrutura padrão** ou **Criar modelo personalizado**.

### Resultado esperado

O painel envia um comando e o desktop o executa em até 15 segundos. Ao concluir, um evento aparece na área **Atividade**.

#### Padrão Solutte criado por cliente

```text
CÓDIGO - RAZÃO SOCIAL
├── ANO VIGENTE
│   ├── Dpto Contábil
│   │   ├── 012026 ... 122026
│   ├── Dpto Fiscal
│   │   ├── 012026 ... 122026
│   └── Dpto Pessoal
│       ├── Funcionários
│       └── 012026 ... 122026
└── Dpto Jurídico
```

No modelo personalizado, informe uma pasta por linha. Você pode usar:

- `{ANO}` para o ano vigente.
- `{MES}` para uma competência mensal.

Exemplo:

```text
Fiscal/{ANO}/{MES}
Relatórios/{ANO}
Pessoal/Funcionários
```

## 6. Criar regras para classificar arquivos

As regras dizem ao desktop como reconhecer um documento pelo nome do arquivo. O sistema não lê o conteúdo do arquivo nesta fase.

1. Abra **Regras de leitura**.
2. Informe um nome para a regra, por exemplo `DAS mensal`.
3. Informe os termos obrigatórios, separados por vírgula, por exemplo `DAS, guia`.
4. Escolha o departamento: Fiscal, Contábil, Pessoal ou Jurídico.
5. Se estiver usando uma estrutura existente, informe também o **destino relativo** que já existe nela, por exemplo `Fiscal/{ANO}/{MES}`.
6. Clique em **Criar regra**.

### Resultado esperado

A regra aparece na lista. O desktop consulta novas regras e revisa pendências automaticamente em até 30 segundos.

## 7. Enviar arquivos para organização

1. Abra a pasta `Organizza` pela tela do desktop.
2. Copie ou mova para ela o arquivo que deseja tratar.
3. Aguarde o desktop detectar e processar o arquivo.

Para que um arquivo seja processado, o nome precisa ter:

- Uma regra compatível com todos os termos cadastrados.
- O código ou CNPJ de um cliente cadastrado.
- A competência no formato `MMYYYY` quando o departamento não for Jurídico.

Exemplo:

```text
090 DAS 072026 12.345.678-0001-90.pdf
```

Esse exemplo contém:

- Código `090`.
- Termo `DAS`.
- Competência `072026`.
- CNPJ do cliente.

### Quando o nome não é reconhecido

O arquivo não é descartado. Ele vai para `Organizza/nprocessados` e aparece no painel web em **Regras de leitura**, na seção **Documentos aguardando decisão**.

1. Não mova o arquivo de volta para a pasta `Organizza`.
2. No painel, clique no nome do documento pendente.
3. Escolha o cliente, departamento e, quando necessário, a competência no formato `MMYYYY`.
4. Se estiver usando uma estrutura já existente, informe o destino relativo que ela já possui.
5. Escolha **Resolver este arquivo**.
6. Se este padrão deverá valer para os próximos documentos, marque **Salvar também este padrão** e informe o nome e os termos da regra.

O desktop recebe a decisão em até 15 segundos, move o arquivo e atualiza a atividade. Se for salva uma regra, os demais arquivos compatíveis da fila são revisados automaticamente a cada 30 segundos.

### Resultado esperado quando o arquivo é reconhecido

1. O desktop registra a detecção no log.
2. Cria uma cópia em `BackupOrganiza`.
3. Move o arquivo original para a pasta final prevista pela regra e estrutura.
4. Envia um evento ao painel em **Atividade**.

### Resultado esperado quando o arquivo não é reconhecido

O arquivo é movido para:

```text
Organizza/nprocessados
```

Um evento de aviso é enviado ao painel. Os motivos mais comuns são:

- Não há regra com termos compatíveis.
- O código/CNPJ não corresponde a um cliente cadastrado.
- A competência `MMYYYY` está ausente ou inválida.
- A estrutura existente não possui o destino configurado na regra.

Não é necessário devolver manualmente o arquivo para `Organizza`: depois que você corrigir a regra, a base de clientes ou a estrutura, o desktop revisa os pendentes a cada 30 segundos.

## 8. Consultar atividade e backup

### Atividade no painel

Abra **Atividade** para ver os eventos reais enviados pelo desktop, incluindo:

- Computador conectado ou reconectado.
- Clientes importados.
- Estrutura solicitada, lida ou criada.
- Regra criada.
- Arquivo detectado, processado ou não processado.

### Backup local

No desktop, clique em **Abrir backup**. A pasta `BackupOrganiza` contém as cópias dos arquivos que passaram pelo processamento.

## 9. Limpar dados do Organizza

Use esta ação somente quando quiser reiniciar a configuração da sua conta.

1. No menu lateral, clique em **Limpar dados**.
2. Leia o aviso.
3. Digite `LIMPAR`.
4. Confirme.

### O que é apagado

- Clientes importados.
- Regras.
- Estruturas registradas.
- Índice de arquivos.
- Eventos.
- Comandos pendentes.
- Vínculos de computadores no painel.

### O que não é apagado

- Pastas locais do Windows.
- Arquivos dos clientes.
- Arquivos da pasta de backup.
- Sua conta Solutte.

Depois da limpeza, conecte o desktop novamente e refaça as configurações necessárias.

## 10. Tempos esperados de sincronização

| Ação | Tempo esperado |
| --- | --- |
| Computador aparecer no painel | Até 60 segundos. |
| Seletor de pasta abrir após o pedido web | Até 15 segundos. |
| Criar estrutura solicitada pela web | Até 15 segundos, mais o tempo de criação no disco. |
| Nova regra chegar ao desktop | Até 30 segundos. |
| Arquivo em `nprocessados` ser revisado | Até 30 segundos após uma alteração compatível. |
| Painel atualizar dados automaticamente | A cada 30 segundos. |

## 11. Perguntas frequentes

### O painel web funciona sem o desktop?

Sim, para login, clientes, regras, configurações e consulta de eventos. Não para ler, criar ou monitorar pastas do Windows. Essas ações exigem o desktop aberto e conectado.

### Cliquei em “Escolher pasta no desktop” e nada abriu.

Confirme:

1. O desktop está aberto.
2. A mesma conta está conectada no painel e no desktop.
3. O computador aparece como conectado em **Computadores**.
4. Você aguardou 15 segundos.
5. Está usando a versão atual do desktop exibida no painel.

Se o desktop estiver fechado, o pedido fica aguardando até ele abrir e consultar comandos. Se você cancelar a caixa do Windows, o pedido é registrado como cancelado e pode ser feito novamente.

### Por que meu arquivo foi para `nprocessados`?

Verifique se existe uma regra compatível e se o nome contém CNPJ ou código de cliente e competência `MMYYYY`. Confira o evento na área **Atividade** para identificar o motivo registrado.

### Posso usar minha própria árvore de pastas?

Sim. Selecione **Usar estrutura existente**. O Organizza registra a árvore sem criar, alterar ou apagar suas pastas. Depois crie regras com destinos que já existam nessa estrutura.

### A Izza já busca documentos?

Ainda não. A tela de conversa está pronta, mas a busca pelo índice local será uma próxima etapa.

### O Windows mostra um aviso para o instalador.

O instalador atual ainda não possui assinatura de código de publicador. Confirme sempre a origem no link oficial da Solutte e não prossiga caso não confie no arquivo. A assinatura de código é uma melhoria planejada para versões futuras.

## 12. Checklist de operação diária

- [ ] Desktop aberto e conectado.
- [ ] Base de clientes importada e atualizada.
- [ ] Estrutura de pastas definida ou lida.
- [ ] Regras cadastradas para os documentos que deseja organizar.
- [ ] Arquivos enviados somente para a pasta `Organizza`.
- [ ] Eventos e pendências revisados no painel.
- [ ] Backup consultado quando necessário.

## 13. Limitações atuais

- A classificação é determinística e depende do nome do arquivo.
- Conteúdo de PDF, OCR e IA não são lidos nesta versão.
- A Izza não realiza buscas ainda.
- Pagamentos e aprovações automáticas de novos usuários ainda não estão disponíveis.
- Os módulos Contábil, MEI e Pessoal aparecem no catálogo, mas estão em desenvolvimento.
