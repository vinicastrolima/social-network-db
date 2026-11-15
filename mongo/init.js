// Executado apenas na criação de um volume MongoDB vazio.
const chat = db.getSiblingDB('devconnect');
chat.createCollection('conversations', {
  validator: { $jsonSchema: {
    bsonType: 'object',
    required: ['pairKey', 'participantIds', 'createdAt'],
    properties: {
      pairKey: { bsonType: 'string', minLength: 3 },
      participantIds: {
        bsonType: 'array', minItems: 2, maxItems: 2, uniqueItems: true,
        items: { bsonType: 'string', pattern: '^[1-9][0-9]*$' },
      },
      createdAt: { bsonType: 'date' },
    },
  } },
});
chat.conversations.createIndex({ pairKey: 1 }, { unique: true });
chat.conversations.createIndex({ participantIds: 1 });
chat.createCollection('messages', {
  validator: { $jsonSchema: {
    bsonType: 'object',
    required: ['conversationId', 'senderId', 'body', 'createdAt', 'clientMessageId'],
    properties: {
      conversationId: { bsonType: 'objectId' },
      senderId: { bsonType: 'string', pattern: '^[1-9][0-9]*$' },
      body: { bsonType: 'string', minLength: 1, maxLength: 4000, pattern: '\\S' },
      createdAt: { bsonType: 'date' },
      clientMessageId: { bsonType: 'string', minLength: 1, maxLength: 100 },
    },
  } },
});
chat.messages.createIndex({ conversationId: 1, createdAt: 1, _id: 1 });
chat.messages.createIndex(
  { conversationId: 1, senderId: 1, clientMessageId: 1 }, { unique: true },
);
