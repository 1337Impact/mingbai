import assert from 'node:assert/strict';
import { test } from 'node:test';
import { StreamParser, type ParsedEvent } from '../lib/stream-parser.ts';

function run(source: string, chunks: string[]) {
  const events: ParsedEvent[] = [];
  const parser = new StreamParser(source, (event) => events.push(event));
  for (const chunk of chunks) parser.push(chunk);
  const truncated = parser.end();
  const tokens = events.flatMap((e) => (e.type === 'token' ? [e.token] : []));
  const sentences = events.flatMap((e) => (e.type === 'sentence' ? [e.en] : []));
  return { events, tokens, sentences, truncated };
}

const SOURCE = '他每天都去地里看庄稼。';
const OUTPUT = `{"en":"He goes to the fields every day to look at the crops."}
["他","tā","he"]
["每天","měi tiān","every day"]
["都","dōu","all; always"]
["去","qù","to go"]
["地里","dì lǐ","in the fields"]
["看","kàn","to look at; to see"]
["庄稼","zhuāng jia","crops"]
["。"]`;

test('parses sentences and tokens', () => {
  const { tokens, sentences, truncated, events } = run(SOURCE, [OUTPUT]);
  assert.deepEqual(sentences, ['He goes to the fields every day to look at the crops.']);
  assert.equal(events[0].type, 'sentence');
  assert.equal(tokens.length, 8);
  assert.deepEqual(tokens[1], { text: '每天', pinyin: 'měi tiān', gloss: 'every day' });
  assert.deepEqual(tokens[7], { text: '。', pinyin: '', gloss: '' });
  assert.equal(truncated, false);
});

test('gives the same result however the stream is chunked', () => {
  const whole = run(SOURCE, [OUTPUT]);
  const byChar = run(SOURCE, [...OUTPUT]);
  const uneven = run(SOURCE, OUTPUT.match(/[\s\S]{1,7}/g) ?? []);
  assert.deepEqual(byChar.events, whole.events);
  assert.deepEqual(uneven.events, whole.events);
});

test('tokens always concatenate back to the source', () => {
  const source = '他每天 都去地里\n看庄稼。';
  // The model skips the whitespace, a word (去) and the final punctuation.
  const output = `{"en":"x"}
["他","tā","he"]
["每天","měi tiān","every day"]
["都","dōu","all"]
["地里","dì lǐ","in the fields"]
["看","kàn","to look at"]
["庄稼","zhuāng jia","crops"]`;
  const { tokens, truncated } = run(source, [output]);
  assert.equal(tokens.map((t) => t.text).join(''), source);
  assert.deepEqual(
    tokens.filter((t) => !t.pinyin).map((t) => t.text),
    [' ', '去', '\n', '。'],
  );
  assert.equal(truncated, true);
});

test('drops lines that are not part of the passage', () => {
  const output = `Here is the annotated passage:
\`\`\`json
{"en":"He goes to the fields every day to look at the crops."}
["他","tā","he"]
["你好","nǐ hǎo","hello"]
["每天","měi tiān","every day"],
not json at all
["都去地里看庄稼。","x","y"]
\`\`\``;
  const { tokens, truncated } = run(SOURCE, [output]);
  assert.deepEqual(tokens.map((t) => t.text), ['他', '每天', '都去地里看庄稼。']);
  assert.equal(truncated, false);
});

test('a token the model altered does not derail the rest', () => {
  const source = '你好,世界。你好,朋友。';
  // The model converts the ASCII commas to full-width ones.
  const output = `{"en":"Hello, world."}
["你好","nǐ hǎo","hello"]
["，"]
["世界","shì jiè","world"]
["。"]
{"en":"Hello, friend."}
["你好","nǐ hǎo","hello"]
["，"]
["朋友","péng you","friend"]
["。"]`;
  const { tokens, sentences } = run(source, [output]);
  assert.equal(tokens.map((t) => t.text).join(''), source);
  assert.equal(sentences.length, 2);
  assert.deepEqual(
    tokens.filter((t) => t.pinyin).map((t) => t.text),
    ['你好', '世界', '你好', '朋友'],
  );
});

test('ignores inline <think> reasoning, including draft tokens inside it', () => {
  const output = `<think>
Let me segment this.
["他","tā","he"]
</think>
${OUTPUT}`;
  const { events } = run(SOURCE, [...output]);
  assert.deepEqual(events, run(SOURCE, [OUTPUT]).events);
});

test('tokens before any sentence line get an empty sentence', () => {
  const { events } = run('你好', ['["你好","nǐ hǎo","hello"]\n']);
  assert.deepEqual(events[0], { type: 'sentence', en: '' });
  assert.equal(events.length, 2);
});

test('skipped non-Chinese text of any length does not lose the words after it', () => {
  const source = '我喜欢 TypeScript and JavaScript 这两种语言。';
  const output = `{"en":"I like these two languages."}
["我","wǒ","I"]
["喜欢","xǐ huan","to like"]
["这","zhè","this"]
["两","liǎng","two"]
["种","zhǒng","kind"]
["语言","yǔ yán","language"]
["。"]`;
  const { tokens } = run(source, [output]);
  assert.equal(tokens.map((t) => t.text).join(''), source);
  assert.deepEqual(
    tokens.filter((t) => t.pinyin).map((t) => t.text),
    ['我', '喜欢', '这', '两', '种', '语言'],
  );
});

test('resynchronises after the model skips a long stretch of Chinese', () => {
  const source = '宋国有个农民，种了一大片庄稼。他每天都去地里看庄稼。';
  const output = `{"en":"x"}
["宋国","Sòng guó","State of Song"]
["他","tā","he"]
["每天","měi tiān","every day"]
["都","dōu","all"]
["去","qù","to go"]
["地里","dì lǐ","in the fields"]`;
  const { tokens } = run(source, [output]);
  assert.equal(tokens.map((t) => t.text).join(''), source);
  assert.ok(tokens.some((t) => t.text === '地里' && t.pinyin));
});
