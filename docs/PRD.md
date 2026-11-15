# PRD — DevConnect

**Versão:** 1.0 · **Status:** Planejamento · **Data:** 19/10/2026

## 1. Visão do produto

### Nome

**DevConnect** — uma rede social acadêmica e profissional para desenvolvedores.

### Problema

Estudantes e profissionais iniciantes encontram dificuldade para descobrir pessoas com interesses técnicos semelhantes, trocar conhecimento e manter conversas organizadas em um único ambiente. Soluções genéricas misturam conteúdo profissional, comunidades e mensagens sem foco no desenvolvimento de carreira.

### Público-alvo

Estudantes de computação, desenvolvedores iniciantes, mentores voluntários e profissionais que desejam compartilhar conhecimento e formar conexões técnicas.

### Objetivos e benefícios

- permitir que usuários criem um perfil técnico e encontrem pessoas por habilidades;
- centralizar publicações, grupos, desafios e conversas;
- facilitar networking e mentoria com histórico de mensagens persistente;
- validar uma arquitetura que combine PostgreSQL para dados relacionais e MongoDB para conversas.

## 2. Escopo

### Funcionalidades previstas

1. Cadastro, autenticação e perfil profissional.
2. Habilidades, seguidores e amizades.
3. Publicações, comentários e curtidas.
4. Grupos temáticos e participação em desafios.
5. Ranking de participação em desafios.
6. Conversas privadas entre usuários, armazenadas em MongoDB.
7. Busca básica por usuários, habilidades e grupos.

### MVP

O MVP contempla cadastro e perfil, autenticação, publicação e interação básica, busca por usuários, criação de conversa privada entre usuários que possuam conexão aceita e envio/consulta de mensagens com histórico ordenado.

### Fora do MVP

Vídeo ou áudio em tempo real, chamadas, notificações push, recomendação por machine learning, moderação automática, monetização, integração com recrutadores e conversas em grupo. Essas ideias podem entrar em versões posteriores.

## 3. Requisitos

### Requisitos funcionais

| ID | Requisito |
| --- | --- |
| RF-01 | O sistema deve permitir cadastro com e-mail único, senha e nome. |
| RF-02 | O usuário deve manter perfil com cidade, cargo, empresa, formação e habilidades. |
| RF-03 | O usuário deve criar, editar e consultar publicações de texto e link. |
| RF-04 | Usuários devem poder comentar, curtir, seguir e solicitar amizade. |
| RF-05 | Usuários devem poder criar e participar de grupos e desafios. |
| RF-06 | Um usuário com amizade aceita deve iniciar uma conversa privada com o outro participante. |
| RF-07 | Participantes devem enviar, consultar e paginar mensagens de uma conversa. |
| RF-08 | O sistema deve preservar a ordem cronológica das mensagens e informar o horário de envio. |
| RF-09 | O usuário deve consultar seu ranking de desafios. |

### Requisitos não funcionais

- RNF-01: senhas devem ser armazenadas com hash forte; nenhuma senha ou segredo deve aparecer em logs.
- RNF-02: toda consulta de mensagens deve validar a autorização do participante.
- RNF-03: a primeira página do histórico deve responder em até 2 segundos em condições normais, com paginação por cursor.
- RNF-04: o sistema deve manter consistência transacional no PostgreSQL e durabilidade no MongoDB.
- RNF-05: APIs devem possuir logs estruturados, métricas e rastreamento distribuído com OpenTelemetry.
- RNF-06: o MVP deve ter testes unitários, de integração e end-to-end para os fluxos principais.
- RNF-07: interfaces futuras devem oferecer estados de skeleton, carregamento, erro, progresso e suporte a `prefers-reduced-motion`.

### Histórias de usuário e critérios de aceitação

#### US-01 — Criar perfil

Como estudante, quero criar um perfil técnico para ser encontrado por pessoas com interesses semelhantes.

- Dado um e-mail ainda não cadastrado, quando eu informar dados válidos, então o perfil será criado.
- Quando eu consultar meu perfil, então vejo meus dados e habilidades cadastradas.
- Dado um e-mail já usado, então o sistema recusa o cadastro e informa o conflito.

#### US-02 — Publicar conteúdo

Como usuário autenticado, quero publicar texto para compartilhar conhecimento.

- Uma publicação válida aparece no feed do autor.
- Texto vazio é recusado.
- Um link informado deve usar `http://` ou `https://`.

#### US-03 — Conversar com uma conexão

Como usuário, quero conversar com uma amizade aceita.

- Apenas participantes autorizados conseguem abrir a conversa e ler seu histórico.
- O envio de mensagem não aceita conteúdo vazio e retorna o identificador da mensagem.
- Ao consultar o histórico, as mensagens vêm ordenadas da mais antiga para a mais recente, com paginação estável.
- Uma mensagem persistida continua disponível após novo login.

## 4. Funcionalidade de conversa com NoSQL

### Participantes e início

Conversas do MVP são privadas e entre exatamente dois usuários. A conversa pode ser iniciada por qualquer participante depois que a solicitação de amizade estiver com status `aceita`. O sistema reutiliza a conversa existente para o mesmo par, impedindo duplicidade.

### Banco escolhido

O banco escolhido é **MongoDB**. Ele permite documentos flexíveis para evolução de metadados, índices eficientes por conversa e tempo, paginação por cursor e escalabilidade horizontal adequada ao crescimento de mensagens. O PostgreSQL continua como fonte dos dados relacionais de usuários e amizades; o serviço de conversa referencia os usuários por ID.

### Organização dos dados

Coleção `conversations`:

```json
{
  "_id": "conv_01",
  "participantIds": ["usr_01", "usr_02"],
  "createdAt": "2026-10-19T12:00:00Z",
  "lastMessageAt": "2026-10-19T12:05:00Z",
  "lastMessagePreview": "Vamos revisar o desafio?"
}
```

Coleção `messages`:

```json
{
  "_id": "msg_01",
  "conversationId": "conv_01",
  "senderId": "usr_01",
  "body": "Vamos revisar o desafio?",
  "createdAt": "2026-10-19T12:05:00Z",
  "editedAt": null,
  "status": "sent"
}
```

Índices obrigatórios: `conversations.participantIds`, combinação única normalizada dos dois participantes e `messages.conversationId + createdAt + _id`. A combinação de data e ID evita empates na ordenação.

### Regras de acesso

- somente os dois IDs em `participantIds` podem consultar ou enviar mensagens;
- o remetente deve ser o usuário autenticado;
- a API nunca aceita `senderId` confiado apenas no corpo da requisição;
- usuários bloqueados não podem iniciar novas conversas nem enviar mensagens;
- exclusão ou anonimização deve preservar a integridade do histórico conforme a política de privacidade;
- mensagens e tokens não devem aparecer em logs de aplicação.

### Critérios de aceitação da conversa

- criar ou recuperar uma conversa não gera duas conversas para o mesmo par;
- mensagem válida é gravada com `conversationId`, `senderId` e `createdAt`;
- mensagem vazia, usuário não participante ou amizade não aceita resulta em erro de autorização/validação;
- consulta retorna somente mensagens da conversa autorizada;
- consulta suporta `limit` e cursor, sem duplicar ou pular mensagens;
- ordenação padrão é crescente por `createdAt` e `_id`, e a interface pode inverter a apresentação;
- duas mensagens enviadas rapidamente mantêm ordem determinística;
- falha temporária do MongoDB não confirma o envio ao cliente antes da persistência.

## 5. Gerência do projeto

### Integrantes e responsabilidades

| Integrante | Responsabilidade |
| --- | --- |
| Lucas Raphael | Modelagem de dados e documentação técnica |
| Izabelle Luna | Requisitos, UX e critérios de aceitação |
| Joseph Cavalcante | Integração, revisão e organização do GitHub |
| Anthony Gabriel | Arquitetura da conversa NoSQL e testes |

### Backlog priorizado

| Prioridade | Atividade | Entrega |
| --- | --- | --- |
| P0 | Validar PRD e arquitetura PostgreSQL/MongoDB | PRD aprovado |
| P0 | Definir contrato de autenticação e autorização | API contract |
| P0 | Modelar conversas, mensagens e índices MongoDB | Schema NoSQL |
| P1 | Implementar cadastro, perfil e amizades | Fluxo de usuários |
| P1 | Implementar envio e histórico de mensagens | MVP de conversa |
| P1 | Adicionar testes unitários, integração e E2E | Pipeline verde |
| P2 | Implementar publicações, grupos e desafios | Funcionalidades sociais |
| P2 | Observabilidade e métricas | Dashboard operacional |

### Etapas e prazos

1. Semana 1: validar PRD, riscos, modelo de dados e contratos.
2. Semana 2: implementar autenticação, perfis e amizades.
3. Semana 3: implementar persistência e API de conversas no MongoDB.
4. Semana 4: integrar frontend, testes, observabilidade e revisão do MVP.
5. Semana 5: correções, demonstração e entrega.

### Dependências

PostgreSQL 14+, MongoDB 7+, ambiente de execução da API, autenticação, definição dos IDs compartilhados entre os bancos, CI no GitHub e ambiente para testes E2E.

### Riscos e mitigação

| Risco | Mitigação |
| --- | --- |
| Divergência entre usuário no PostgreSQL e referência no MongoDB | contrato de IDs, validação na API e testes de integração |
| Acesso indevido ao histórico | autorização no servidor, testes negativos e auditoria |
| Crescimento excessivo da coleção de mensagens | índices, paginação por cursor e política de retenção |
| Escopo maior que o prazo | proteger o MVP e priorizar P0 antes de P1/P2 |
| Falha de serviço NoSQL | backups, métricas, alertas e procedimento de retry idempotente |

### Acompanhamento

O GitHub Project público organiza as Issues por status **A fazer**, **Em andamento** e **Concluído**, com prioridade e responsável. Cada mudança será feita em branch própria e revisada por Pull Request vinculado à Issue. A equipe fará uma revisão semanal do backlog e registrará bloqueios nas Issues.

## 6. Fora desta entrega

Esta entrega é exclusivamente de planejamento. Não é necessário implementar a aplicação, APIs, telas ou bancos. O resultado esperado é este PRD, o backlog organizado no GitHub e os links públicos para avaliação.
