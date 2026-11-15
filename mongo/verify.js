// Verificação somente leitura. Execute no banco devconnect pelo mongosh.
const conversations = db.getCollectionInfos({ name: 'conversations' })[0];
const messages = db.getCollectionInfos({ name: 'messages' })[0];
assert(conversations, 'Coleção conversations ausente');
assert(messages, 'Coleção messages ausente');
assert(conversations.options.validator.$jsonSchema.properties.participantIds.maxItems === 2);
assert(messages.options.validator.$jsonSchema.properties.body.maxLength === 4000);
assert(db.conversations.getIndexes().some(i => i.name === 'pairKey_1' && i.unique));
assert(db.messages.getIndexes().some(i => i.name === 'conversationId_1_createdAt_1__id_1'));
assert(db.messages.getIndexes().some(i => i.name === 'conversationId_1_senderId_1_clientMessageId_1' && i.unique));
print('OK: coleções, validators e índices do chat');
