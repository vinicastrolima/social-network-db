# Entrega final e roteiro de apresentação

## Links

- Repositório: https://github.com/vinicastrolima/social-network-db
- PRD integrado em dev: https://github.com/vinicastrolima/social-network-db/blob/dev/docs/PRD.md
- Project público: https://github.com/users/usrJosephC/projects/3
- Aplicação local: http://localhost:3000

A entrega é local, permitida pelo enunciado. Após revisão, integrar a branch de
entrega em dev. A promoção para main deve usar PR próprio. Enquanto isso, entregar
o link da branch integrada evita apontar o avaliador para a main antiga.

O Project e o repositório têm proprietários diferentes. O GitHub recusou o vínculo
nativo (`Only projects owned by the same owner as the repository can be linked`).
As Issues do repositório estão no Project e há links recíprocos no README.
Para satisfazer um vínculo nativo exigido pelo avaliador, o proprietário
`vinicastrolima` precisa criar/manter o Project em sua conta ou numa organização
compartilhada. Não houve transferência de propriedade nesta entrega.

## Demonstração (duas janelas de navegador)

1. Copiar `.env.example` para `.env` e executar `docker compose up -d --build --wait`.
2. Cadastrar Ana na janela normal e Bruno na janela anônima; usar e-mails diferentes.
3. Preencher perfil/habilidades, publicar um texto e comentar com a segunda conta.
4. Em Conexões, Ana encontra Bruno e envia pedido. Bruno aceita e clica em Conversar.
5. Ambos enviam mensagens. Mostrar horário, confirmação de persistência e respostas.
6. Recarregar, sair e entrar novamente: o histórico continua disponível.
7. Reiniciar apenas o container app (`docker compose restart app`) e reabrir o chat.
8. Inspecionar coleções MongoDB com MongoDB Compass em localhost:27018, usando os
   dados do `.env` e authSource=admin. Mostrar conversas, participantes e mensagens.
9. Bloquear a amizade: novos envios são recusados; participantes ainda leem o histórico.
10. Criar grupo, participar, publicar; criar desafio, enviar solução com a outra
    conta e aceitar pelo autor. Mostrar o ranking atualizado (115 pontos).

## Evidências automatizadas

- Unidade: normalização BIGINT, validação de texto, hash/salt e senhas inválidas.
- Contrato de arquitetura: domínio independente de HTTP/bancos; cliente sem segredos.
- Integração com bancos reais: autorização do terceiro, origem externa, edição
  alheia, bloqueio, idempotência, empate na ordenação, paginação, login novamente,
  grupos, habilidades e pontuação de solução aceita.
- Playwright: duas sessões isoladas, cadastro, amizade, conversa, histórico e layout
  mobile; screenshot e trace em `test-results`.
- Biome, Knip, Commitlint e Stryker configurados; mutação focada no domínio.
- Verificação local em 15/11: fluxo E2E aprovado, cobertura de linhas de API/DB/domínio
  acima de 82% e mutação do domínio de 90,63% (87 de 96 mutantes detectados).
  Cobertura não inclui a interface nem prova ausência de defeitos.
- CI em PRs para dev/main; artefatos de cobertura/E2E e upload Codecov configurado.

## Observabilidade

`GET /health` verifica PostgreSQL e MongoDB; falha retorna erro, não sucesso falso.
Logs JSON registram requestId, método, rota normalizada, status e duração, sem
conteúdo privado. `GET /metrics` exige `Authorization: Bearer <METRICS_TOKEN>` e
fica desabilitado se o token não for configurado.

Métricas: `devconnect_http_requests_total` e `devconnect_http_duration_seconds`.
As regras de alerta em `ops/alerts.yml` podem ser carregadas em Prometheus. Elas
são configuração de monitoramento, não um serviço de notificações já contratado.

Para rastreamento, definir `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT` com endpoint OTLP
HTTP do collector (ex.: `http://collector:4318/v1/traces`). O SDK emite spans HTTP
com rota/status, sem payloads ou credenciais. O collector pode encaminhar a um
backend compatível. Sem endpoint, não há exportação externa; não requer conta paga.

Codecov pode exigir `CODECOV_TOKEN` no GitHub. Nenhum token privado está versionado.

## Segurança e dados

Ambiente acadêmico local: serviços publicados apenas em localhost. Volumes são
persistentes; `docker compose down` os preserva. Nunca usar `down -v` para parar
uma demonstração com dados importantes. A aplicação não reexecuta o SQL destrutivo;
somente cria a tabela de sessões e índice único de amizade se ainda não existirem.
Para deploy público, provisionar usuários de banco com privilégios mínimos,
HTTPS, segredos reais, backup e limites distribuídos (o rate limit atual é por processo).
