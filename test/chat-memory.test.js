import test from 'node:test';
import assert from 'node:assert/strict';
import { loadChat, saveChat, clearChat, buildChatMessages, answerParts } from '../src/chat-memory.js';
import { docxXmlToText } from '../src/doc-extract.js';

function memoryStorage(limit = Infinity) {
  const data = new Map();
  return {
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => {
      if (v.length > limit) throw Error('QuotaExceededError');
      data.set(k, v);
    },
    removeItem: (k) => data.delete(k),
  };
}

test('the conversation is saved per project without the full images', () => {
  const storage = memoryStorage();
  const messages = [
    {
      role: 'user',
      content: 'Lis ça',
      attachments: [{ name: 'a.jpg', kind: 'image', image: 'data:big', thumb: 'data:s' }],
    },
    { role: 'assistant', content: 'C’est une équation.' },
  ];
  assert.equal(saveChat('p1', messages, storage), true);
  const back = loadChat('p1', storage);
  assert.equal(back.length, 2);
  assert.equal(back[0].attachments[0].image, undefined);
  assert.equal(back[0].attachments[0].thumb, 'data:s');
  assert.deepEqual(loadChat('p2', storage), []);
  clearChat('p1', storage);
  assert.deepEqual(loadChat('p1', storage), []);
});

test('a full storage drops thumbnails before giving up', () => {
  const thumb = 'x'.repeat(5000);
  const storage = memoryStorage(3000);
  const messages = [{ role: 'user', content: 'image', attachments: [{ name: 'a.png', kind: 'image', thumb }] }];
  assert.equal(saveChat('p', messages, storage), true);
  assert.equal(loadChat('p', storage)[0].attachments[0].thumb, undefined);
  assert.equal(saveChat('p', [{ role: 'user', content: 'y'.repeat(4000) }], storage), false);
});

test('recent exchanges are remembered and older ones summarised as topics', () => {
  const history = [];
  for (let n = 1; n <= 30; n++)
    history.push(
      { role: 'user', content: `Question ${n} ` + 'a'.repeat(400) },
      { role: 'assistant', content: 'b'.repeat(600) },
    );
  const { messages, remembered, forgotten } = buildChatMessages({ history, question: 'Et maintenant ?', budget: 8000 });
  assert.equal(messages[0].role, 'system');
  assert.equal(messages[1].role, 'user');
  assert.equal(messages.at(-1).content, 'Et maintenant ?');
  assert.ok(remembered > 0 && forgotten > 0);
  assert.equal(remembered + forgotten, 30);
  assert.match(messages[0].content, /Sujets abordés plus tôt/);
  assert.match(messages[0].content, /- Question 23 /);
  assert.doesNotMatch(messages[0].content, /- Question 1 /);
  assert.match(messages.at(-3).content, /Question 30/);
  assert.ok(messages.reduce((n, m) => n + m.content.length, 0) < 9000);
});

test('attachments and the open file reach the model', () => {
  const { messages } = buildChatMessages({
    history: [],
    question: 'Résume',
    attachments: [{ name: 'cours.pdf', kind: 'pdf', text: 'Théorème de Pythagore' }],
    source: '\\documentclass{article}',
    log: '! Undefined control sequence.',
  });
  assert.match(messages.at(-1).content, /\[Pièce jointe : cours\.pdf\]\nThéorème de Pythagore/);
  assert.match(messages[0].content, /FICHIER OUVERT/);
  assert.match(messages[0].content, /Undefined control sequence/);
});

test('answers are split into text and code, also while streaming', () => {
  assert.deepEqual(answerParts('Voici :\n```latex\n\\alpha\n```\nFin'), [
    { type: 'text', text: 'Voici :\n' },
    { type: 'code', lang: 'latex', text: '\\alpha' },
    { type: 'text', text: '\nFin' },
  ]);
  assert.deepEqual(answerParts('A\n```latex\n\\be'), [
    { type: 'text', text: 'A\n' },
    { type: 'code', lang: 'latex', text: '\\be' },
  ]);
});

test('Word paragraphs become text lines', () => {
  const xml =
    '<w:body><w:p><w:r><w:t>Titre &amp; plan</w:t></w:r></w:p><w:p><w:r><w:t>a</w:t><w:tab/><w:t>b</w:t></w:r></w:p></w:body>';
  assert.equal(docxXmlToText(xml), 'Titre & plan\na\tb');
});
