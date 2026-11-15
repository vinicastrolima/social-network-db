# Entrega final — plano de implementação

Auditoria em 14/11/2026. Prazo mostrado na atividade: 16/11/2026 às 06h.
Alvo: demonstração local reproduzível; deploy público é opcional.

## Estado verificado

| Área | Estado | Próxima ação |
| --- | --- | --- |
| PRD e regras de contribuição | PRs #4 e #14 mescladas em dev | Revisar e promover dev para main por PR ao finalizar |
| PostgreSQL | Script, constraints, triggers, views e diagramas presentes | Validar em banco descartável |
| Conversas | Apenas planejamento NoSQL; SQL legado contém chat relacional | Usar exclusivamente MongoDB para o chat da aplicação |
| Aplicação e interface | Ausentes | Implementar API e interface |
| Autenticação e autorização | Ausentes | Implementar sessões, senhas seguras e regras de amizade |
| Testes e observabilidade | Ausentes | Cobrir fluxos críticos e diagnósticos |
| Project público | Issues #5–#13 presentes; sem campo Priority e sem responsáveis nos itens consultados | Atualizar progresso e atribuições |

## Ordem de execução

1. **Infraestrutura e contrato de dados (#15, #6, #7), 14–15/11:** Compose, volumes, healthchecks, índices e validação MongoDB. Primeira implementação desta branch.
2. **API e segurança (#8, #9), 15/11:** Node.js, PostgreSQL, MongoDB; cadastro/login/logout, sessão em cookie HttpOnly, hash de senha, perfil, busca e aceite/bloqueio de amizade. Proteção CSRF e limitação de tentativas.
3. **Chat (#13), 15/11:** conversa única por par, envio idempotente, histórico por cursor e atualização periódica. Autorizar participação e amizade em cada envio; histórico acessível apenas aos participantes. Sem confirmação antes de persistir.
4. **Interface e interação básica (#9, #12), 15/11:** login, perfil, busca, amizades, publicações, curtidas/comentários e chat. Estados vazios/erro/carregamento, acessibilidade, skeleton e movimento reduzido. Grupos, desafios e ranking são expansão após o MVP.
5. **Qualidade e demonstração (#11, #10), 15–16/11:** testes de API e bancos reais, E2E com dois usuários, teste negativo com terceiro usuário, persistência após reinício e paginação com timestamps iguais. Logs sem mensagens/senhas, métricas e rastreamento. Documentar instalação e roteiro de apresentação.
6. **Publicação, antes das 06h de 16/11:** PRs para dev, validação integrada, PR dev → main e links do repositório, PRD e Project. Não considerar pronto antes de o cenário completo passar.

## Decisões para a implementação

- IDs PostgreSQL BIGSERIAL serão strings decimais nas APIs e no MongoDB, evitando perda de precisão JavaScript.
- IDs das conversas/mensagens serão ObjectId. A API calculará pairKey ordenando numericamente os dois IDs e unindo-os com `:`. Nunca confiar nesse campo enviado pelo cliente.
- Ordenação por `(createdAt, _id)` e cursor com os dois valores. Datas geradas pelo servidor. Limite máximo de 100 mensagens por página.
- `clientMessageId` permite repetir uma requisição sem duplicar o envio. Índice único por conversa, remetente e chave.
- Validators MongoDB validam formato, mas não substituem autorização e verificação de existência dos usuários na API.
- PostgreSQL continua responsável por usuários/amizades. As tabelas SQL legadas conversations/messages ficam preservadas para a atividade anterior e não serão usadas pelo novo chat.
- O SQL legado é destrutivo quando reexecutado. O Compose só o aplica ao inicializar um volume vazio; evolução futura exige migrations incrementais.
- Responsabilidades humanas seguem o PRD como proposta do grupo. Nesta etapa, Joseph acompanha a infraestrutura; atribuições adicionais precisam refletir a divisão real da equipe.

## Critério de entrega

Dois usuários devem cadastrar-se, aceitar amizade, trocar mensagens e reler o histórico após sair e voltar. Um terceiro usuário não pode ler/enviar nessa conversa. A apresentação deve mostrar os documentos no MongoDB, o histórico ordenado e a execução local a partir do README. Não basta demonstrar apenas documentos ou mocks.

O PRD descreve a etapa anterior de planejamento. Este plano inicia a entrega final, sem declarar implementados os recursos ainda pendentes.
