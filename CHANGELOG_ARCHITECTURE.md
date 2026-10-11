# Changelog arquitetural

## 2026-10-05 — Persistência idempotente de regras ensinadas pelo Desktop (não publicado)

- Antes: `POST /api/organizza/rules` sempre inseria; a classificação local do Desktop não o utilizava.
- Depois: uma aprendizagem explicitamente confirmada consulta somente regras do workspace/departamento e reutiliza regra suficiente, preservando termos existentes e destino já definido; cria registro somente quando não há equivalente. O cache Desktop é atualizado pela resposta, sem polling.
- Impacto: uma ação humana gera uma consulta com `LIMIT 501` e guardrail de 500, UPDATE ou INSERT, leitura por id e evento de auditoria. Sem schema, migration, autenticação nova, IA, PDF, job ou retry.

## 2026-09-29 — Contrato temporal canônico da interpretação da Izza

- Antes: `/izza/interpret` representava apenas competência única, intervalo e meses recentes; listas explícitas não contínuas não cabiam no schema.
- Depois: o contrato aceita até 36 competências explícitas e informa modo/quantidade temporal, preservando os campos anteriores. Períodos relativos continuam semânticos; a OpenAI não calcula calendário.
- Impacto: somente o formato da interpretação foi ampliado. Não houve busca documental remota, schema/migration Turso, infraestrutura, commit, push ou deployment.

## 2026-09-27 — Work Session de 12 horas para interpretação da Izza

- Antes: cada mensagem autenticada para `/izza/interpret` usava o token de dispositivo e executava dois SELECTs (`organiza_devices` e `users`) para revalidar vínculo, revogação e conta ativa.
- Depois: o dispositivo solicita uma Work Session assinada de 12 horas por rota protegida pelo mecanismo normal. `/izza/interpret` aceita somente essa sessão, validando assinatura, issuer, audience, scope e expiração sem SELECTs de autenticação. `token_usage` continua sendo registrado.
- Desktop cifra a sessão com `safeStorage`, reutiliza-a entre reinicializações e renova somente no início quando ausente/expirada ou sob demanda ao usar a Izza; não há polling/timer de renovação. Sessões simultâneas compartilham uma emissão.
- Motivo: remover leituras redundantes de autenticação por mensagem sem transformar a interpretação em rota pública ou permitir que o token permanente de 180 dias a acesse diretamente.
- Impacto: aproximadamente 2 SELECTs por emissão, nenhum SELECT de autenticação por mensagem durante até 12 horas. Revogações passam a ter atraso máximo aceito de 12 horas para uma sessão já emitida.
- Sem alteração de schema/secrets/infraestrutura; sem migration, commit ou deployment.

## 2026-09-27 — Schema e migração fora do runtime da API

- Antes: middleware global executava `initializeSchema()` antes de cada request; `shared-map`, inclusive `revisionOnly`, tentava migrar o índice legado automaticamente.
- Depois: requests não inicializam schema nem disparam backfill. Schema e migração têm comandos separados com flags de confirmação; a migração exige IDs explícitos e é limitada a 100.000 registros/200 páginas de 500.
- Motivo: remover DDL e migração/backfill do hot path e exigir ação operacional explícita.
- Impacto: schema deve existir antes de atender as rotas; `shared-map` falha de modo explícito se suas tabelas não existirem. Nenhum comando de schema/migração foi executado.
- Commit relacionado: ainda não criado.

## 2026-09-26 — Sincronização orientada a revisão/deltas

- Antes: o Desktop sincronizava o mapa em timer de 60 segundos; a revisão podia avançar incorretamente após escrita local; reindexação removia caminhos obsoletos com consulta sem paginação; algumas mudanças de clientes não atualizavam o mapa.
- Depois: validação de revisão sob demanda, deltas paginados, carga inicial do cache limitada operacionalmente a 100.000 arquivos, migração legada com cursor/high-water mark e correções de coerência para clientes e limpeza de dados. A migração descrita foi inicialmente acionada no primeiro acesso; desde 2026-09-27 está separada em comando explícito.
- Motivo: reduzir consultas periódicas desnecessárias sem deixar caches eternamente desatualizados e impedir paginação sem progresso.
- Impacto esperado: workspaces ociosos deixam de consultar o mapa a cada minuto; operações da Izza fazem validação barata e só buscam deltas quando a revisão divergir. Carga inicial grande pode parar com erro controlado.
- MAP_UPDATED e Repository Profile permanecem como evolução futura; não foram implementados nesta alteração. Sem migration, commit ou deployment.

## 2026-09-26 — Interpretação segura da Izza e atomicidade de revisão

- Antes: o Desktop substituiu a interpretação natural por heurística local; revisão do mapa podia ser observada antes da gravação dos deltas; o pipeline de entrada podia extrair texto de PDF automaticamente.
- Depois: o Desktop chama endpoint de interpretação isolado, que envia apenas a pergunta à IA e devolve filtros; o Desktop valida revisão e localiza apenas em metadados/cache. Atualizações e deltas do mapa são atômicos por página. O pipeline automático não chama `extractPdfText`.
- Motivo: preservar linguagem natural sem enviar documentos à IA, impedir perda de deltas entre dispositivos e enviar arquivos não identificados diretamente para Não Processados.
- Impacto: uma chamada de interpretação/OpenAI por pergunta bem-sucedida, mais registro de tokens; fallback determinístico local somente em indisponibilidade/falha de interpretação. Sem nova tabela ou migration. `P0.1 — AUDITORIA DE PENDÊNCIAS/POLLING` segue pendente.
