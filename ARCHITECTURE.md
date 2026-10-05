# Arquitetura do Organizza — Backend

## Dados e isolamento

- O acesso persistente do Organizza usa Turso/LibSQL, configurado por `TURSO_DATABASE_URL` e `TURSO_AUTH_TOKEN`.
- O mapa canônico de arquivos é `organiza_shared_file_index`, isolado pelo `user_id` do proprietário/workspace e pelo caminho relativo.
- `organiza_file_map_state` mantém a revisão do mapa e a marca `legacy_migrated`.
- `organiza_file_map_changes` mantém o delta mais recente por caminho (`user_id`, `relative_path`); não é um histórico imutável de todas as alterações.
- `organiza_file_index` é o índice legado por dispositivo. O fluxo atual grava somente metadados de localização e ignora `extracted_data` legado.
- As estruturas de pastas (`organiza_folder_structures`/`organiza_folder_nodes`) são distintas do índice de arquivos.

## Fluxo de escrita e sincronização

- `POST /api/organizza/rules` atende Web e Desktop autenticados no workspace existente. O Desktop o chama somente após classificação humana com aprendizagem habilitada. A rota consulta no máximo 501 regras do mesmo `user_id + department`, recusa aprender acima do guardrail de 500, reutiliza identidade nominal ou regra cujos termos já cobrem o novo exemplo e preserva os `terms` existentes; nunca acrescenta automaticamente termos que estreitariam `configuredRuleForText()`. Regra inexistente é inserida. Não há polling, retry, schema ou tabela adicional.
- `POST /api/organizza/file-index` registra metadados do dispositivo e atualiza o mapa canônico. `writeSharedFileMap` compara caminho e metadados relevantes; sem mudança, não cria delta nem revisão.
- A alteração efetiva compara metadados, incrementa a revisão e grava mapa + deltas em uma transação de escrita LibSQL (`BEGIN IMMEDIATE`), com batches limitados. A revisão só fica visível no commit junto com todos os deltas da página. Atualizações/exclusões de clientes refletem no mapa e no delta.
- `POST /api/organizza/file-index/sync-complete` reconcilia caminhos em páginas de até 500, remove registros obsoletos e grava deltas de exclusão.
- `GET /api/organizza/file-index/shared-map?revisionOnly=1` valida workspace/revisão sem retornar documentos. O download inicial usa páginas de até 500; a API lê um registro sentinela adicional para distinguir exatamente uma última página cheia de uma página com mais dados.
- Deltas usam `sinceRevision`, cursor `(revision, relativePath)` e `LIMIT 500`.
- `POST /api/organizza/izza/interpret` recebe somente a pergunta (até 500 caracteres), valida o Desktop e chama a interpretação estruturada da OpenAI. O contrato temporal preserva competência única, intervalo e `recentMonths`, acrescenta `competences[]`, `temporalMode` e `temporalCount`; períodos relativos permanecem semânticos e são expandidos pelo Desktop. O endpoint não pesquisa documentos nem lê mapa, PDFs ou `extracted_data`; registra apenas tokens em `token_usage`. A busca sobre metadados/cache é feita pelo Desktop.
- `financial-pending` e `financial-map` são rotas de compatibilidade que retornam vazio sem query documental.
- Nenhuma requisição da API inicializa schema ou executa DDL. A definição completa de schema permanece em `initializeSchema()`, invocável somente pelo comando explícito `npm run schema:init -- --confirm-schema-setup`; esse comando não é executado pelo runtime.
- A migração do índice legado não é disparada por `shared-map` (nem por `revisionOnly`). Ela está separada em `npm run map:migrate-legacy -- --confirm-legacy-map-migration --user-id <ID> --admin-device-id <ID>`. Exige dispositivo administrador validado, usa high-water mark e páginas de 500, tem limite máximo de 100.000 arquivos/200 páginas e não grava arquivos no mapa se exceder o limite. Requer previamente as tabelas `organiza_file_map_state`, `organiza_file_index`, `organiza_devices`, `organiza_shared_file_index` e `organiza_file_map_changes`; não inicializa schema automaticamente.
- O endpoint `shared-map` requer previamente `organiza_file_map_state`; para carga inicial também `organiza_shared_file_index` e `organiza_clients`; para deltas também `organiza_file_map_changes`. A autenticação continua dependendo de `users` e `organiza_devices`. A ausência dessas tabelas resulta em erro normal de banco, sem tentativa de criá-las.
- A limpeza explícita de dados remove o mapa, estado e deltas junto com os dados do workspace.

## Autenticação e identidade

Endpoints de dispositivo validam token, vínculo dispositivo/usuário e estado ativo. O token do dispositivo é pareado no escopo do proprietário/workspace; funcionários e dispositivos são distinguidos por `actor_user_id`. O mapa usa o `user_id` do workspace fornecido pelo contexto autenticado.

### Work Session da Izza

- O token de dispositivo continua válido por 180 dias, mas só pode solicitar a Work Session; não autentica `/api/organizza/izza/interpret`.
- `POST /api/organizza/izza/work-session` usa `requireDeviceAuth`, que verifica device e usuário ativos no banco, e emite JWT assinado de 12 horas com `sub` do workspace, `deviceId`, `scope` e `audience` exclusivos da interpretação.
- `/api/organizza/izza/interpret` valida algoritmo, assinatura, issuer, audience, scope e expiração localmente; não executa SELECT de autenticação. O endpoint continua gravando o uso em `token_usage` após a resposta da OpenAI.
- O Desktop armazena o token da Work Session cifrado com `safeStorage`. Reutiliza uma sessão ainda válida entre reinicializações; se não existir/estiver próxima da expiração, solicita outra no início ou quando a Izza for usada. Não há timer de renovação. Chamadas concorrentes compartilham uma única emissão em andamento.
- Revogação de device/usuário deixa de ser consultada durante a validade da Work Session; a janela máxima aceita é 12 horas. Após expirar, nova emissão volta a validar estado no banco e é negada se revogado/inativo.

## Custos e limites conhecidos

- Não há polling backend dedicado ao mapa. A validação de revisão é acionada pelo Desktop ao iniciar/conectar ou antes de uma operação da Izza que dependa do mapa.
- Páginas iniciais, deltas, migração e reconciliação têm limites por consulta e cursores monotônicos. A carga inicial do cache Desktop para após 100.000 arquivos/200 páginas; isso é guardrail operacional, não limite comercial nem capacidade máxima do produto.
- Migração legada e reconciliação completa podem atravessar todo o conjunto pertinente uma vez; são operações explicitamente disparadas, não jobs periódicos.
- A lista de comandos do Desktop mantém seu polling próprio para outros fluxos; `MAP_UPDATED` não está implementado.
- O hash de arquivo usado pelo Desktop é `tamanho:mtime arredondado`, não hash criptográfico.
- `P0.1 — AUDITORIA DE PENDÊNCIAS/POLLING`: pendências e `pendingWebRegistrations` ainda possuem sincronização a cada 30 segundos; revisar limite de retries e concorrência antes da produção.

## Evolução futura: Repository Profile

Somente backlog, não implementado: conhecer a dimensão estrutural do repositório antes de escolher estratégia de scan/reconciliação. Métricas possíveis incluem clientes, pastas, arquivos/documentos, entradas totais, arquivos indexáveis/no mapa, pendências, profundidade, tamanho, taxas de inclusão/alteração/remoção, duração e páginas/deltas/Rows Read/Rows Written quando mensuráveis. Pastas são diretórios; arquivos são documentos; entradas totais são pastas + arquivos. Não criar scan periódico para atualizar métricas: scan completo serve para conhecimento/reconciliação quando necessário e eventos mantêm o estado normal. O teto atual de 100.000 é temporário e não define capacidade futura.
