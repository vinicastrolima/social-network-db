# Contrato da API — DevConnect

Base `/api`, JSON, mesma origem. As operações de escrita exigem o header
`X-Devconnect: 1` e `Origin` igual a `APP_ORIGIN`. A interface faz isso automaticamente.
Sessão opaca em cookie HttpOnly/SameSite=Strict; Secure quando a origem é HTTPS.
Somente o hash do token é guardado em PostgreSQL. Expiração: sete dias; logout revoga.
Senha com scrypt e salt aleatório, mínimo 10/máximo 128 caracteres. Nenhum ID de
remetente fornecido pelo cliente substitui a identidade da sessão.

| Método/rota | Entrada | Acesso/resultado |
| --- | --- | --- |
| POST /auth/register | username, full_name, email, password | Cria conta e sessão; e-mail único |
| POST /auth/login | email, password | Abre sessão |
| POST /logout | — | Revoga sessão |
| GET/PUT /me | full_name, bio, city, job_title, company, education | Perfil próprio |
| GET /users?q= | termo | Busca nome/username, até 50 |
| GET/POST /skills | name, proficiency_level | Habilidades próprias |
| GET/POST /friends | userId | Lista relações/envia pedido |
| PATCH /friends/:id | status | Destinatário aceita/recusa pendente; qualquer participante bloqueia |
| POST /users/:id/follow | — | Segue usuário |
| GET/POST /conversations | userId no POST | Lista próprias/cria ou recupera conversa de amizade aceita |
| GET /conversations/:id/messages | limit (1–100), cursor | Histórico autorizado crescente por data e ObjectId |
| POST /conversations/:id/messages | body, clientMessageId | Participante com amizade aceita; confirmação só após persistir |
| GET/POST /posts | content, link_url opcional, group_id opcional | Feed/criação; grupo exige associação |
| PUT /posts/:id | content | Somente autor |
| POST /posts/:id/like | — | Curtida idempotente |
| GET/POST /posts/:id/comments | content no POST | Consulta/publicação de comentários |
| GET/POST /groups | name, topic, description | Lista/criação com autor membro administrador |
| POST /groups/:id/join | — | Entra no grupo |
| GET/POST /challenges | title, description, statement | Lista/criação; 100 pontos, dificuldade média |
| POST /challenges/:id/join | — | Inscrição |
| GET/POST /challenges/:id/solutions | source_code, language | Autor do desafio vê todas; participante vê próprias; envio exige inscrição |
| PATCH /solutions/:id | status aceita/rejeitada | Criador do desafio avalia outras pessoas; sem autoavaliação |
| GET /ranking | — | Ranking calculado pelo PostgreSQL |

IDs relacionais são strings decimais (BIGINT). IDs MongoDB são hexadecimais de
24 caracteres. `pairKey` é calculada no servidor com IDs ordenados numericamente.
O cursor é base64url de `{date,id}`. A resposta é `{items,hasMore,nextCursor}`;
o último cursor também pode consultar novas mensagens. A tela consulta a cada
3 segundos e pausa quando a aba está oculta. Não usa WebSocket.

`clientMessageId` é único por conversa/remetente. Reenvio com mesmo corpo retorna
a mensagem persistida; corpo diferente com a mesma chave retorna 409. O bloqueio
impede novos envios; os participantes mantêm acesso ao histórico anterior.
Usuários externos recebem 404 e não descobrem conteúdo/participantes pela rota.

Erros: 400 validação, 401 sessão, 403 autorização/origem, 404 recurso não visível,
409 conflito, 429 limite, 503 indisponibilidade. Respostas de erro incluem
`requestId`; logs não contêm corpo, cookies, senha ou conteúdo de mensagens.

Limites desta entrega: listas sociais limitadas a 50 e conversas a 100; sem
anexos, exclusão de conta, recuperação de senha ou desbloqueio. Não publicar na
internet com credenciais administrativas locais sem hardening.
