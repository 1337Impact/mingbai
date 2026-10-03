// A tiny OpenAI-compatible server for tests: streams a canned annotation of the
// test page's passage, and also serves that page.
import { createServer } from 'node:http';

export const PASSAGE =
  '自古以来，中国就是个农业大国，种庄稼一直都是老百姓最重要的工作。只有庄稼长得好，人才能有饭吃。';

export const SHADOW_TEXT = '大家不会歧视这种有明确正面意义的纹身的';

const REPLY = `{"en":"Ever since ancient times, China has been a major agricultural country. Farming has always been the most important job for ordinary people."}
["自古以来","zì gǔ yǐ lái","since ancient times"]
["，"]
["中国","Zhōng guó","China"]
["就是","jiù shì","is precisely; exactly"]
["个","gè","(measure word)"]
["农业","nóng yè","agriculture; farming"]
["大国","dà guó","major country; great power"]
["，"]
["种","zhòng","to plant; to grow"]
["庄稼","zhuāng jia","crops"]
["一直","yì zhí","always; all along"]
["都","dōu","all"]
["是","shì","to be"]
["老百姓","lǎo bǎi xìng","ordinary people"]
["最","zuì","most"]
["重要","zhòng yào","important"]
["的","de","(possessive particle)"]
["工作","gōng zuò","job; work"]
["。"]
{"en":"Only when the crops grow well can people have food to eat."}
["只有","zhǐ yǒu","only if"]
["庄稼","zhuāng jia","crops"]
["长","zhǎng","to grow"]
["得","de","(complement particle)"]
["好","hǎo","well; good"]
["，"]
["人","rén","people"]
["才","cái","only then"]
["能","néng","can"]
["有","yǒu","to have"]
["饭","fàn","food; meal"]
["吃","chī","to eat"]
["。"]
`;
export const WORD_COUNT = REPLY.split('\n').filter((line) => line.split('","').length === 3).length;

const PAGE = `<!doctype html>
<html lang="zh">
  <meta charset="utf-8" />
  <title>拔苗助长</title>
  <body style="max-width: 640px; margin: 60px auto; font: 18px/1.9 sans-serif">
    <h1>拔苗助长</h1>
    <p id="passage">${PASSAGE}</p>
    <p id="english">This paragraph has no Chinese in it.</p>
    <!-- Text inside nested shadow roots, the way some sites render comments. -->
    <div id="open-shadow"></div>
    <div id="closed-shadow"></div>
    <script>
      for (const mode of ['open', 'closed']) {
        const outer = document.getElementById(mode + '-shadow').attachShadow({ mode });
        const inner = outer.appendChild(document.createElement('div')).attachShadow({ mode });
        const p = inner.appendChild(document.createElement('p'));
        p.id = 'contents';
        p.textContent = '${SHADOW_TEXT}';
      }
    </script>
  </body>
</html>`;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

/** Starts the server. `chunkDelay` is the pause in ms between streamed chunks. */
export async function startMockApi({ chunkDelay = 5 } = {}) {
  const requests = [];

  const server = createServer(async (req, res) => {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, CORS).end();
      return;
    }
    if (req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(PAGE);
      return;
    }

    let raw = '';
    for await (const chunk of req) raw += chunk;
    const body = JSON.parse(raw);
    requests.push({ url: req.url, authorization: req.headers.authorization, body });

    if (req.headers.authorization !== 'Bearer test-key') {
      res.writeHead(401, { ...CORS, 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: { message: 'Invalid API key', code: 401 } }));
      return;
    }

    res.writeHead(200, { ...CORS, 'Content-Type': 'text/event-stream' });
    const send = (delta, finish_reason = null) =>
      res.write(`data: ${JSON.stringify({ id: 'mock', object: 'chat.completion.chunk', choices: [{ index: 0, delta, finish_reason }] })}\n\n`);
    // Uneven chunks that split lines and multi-byte characters' JSON, like a real stream.
    for (const chunk of REPLY.match(/[\s\S]{1,11}/g)) {
      send({ content: chunk });
      await new Promise((resolve) => setTimeout(resolve, chunkDelay));
    }
    send({}, 'stop');
    res.end('data: [DONE]\n\n');
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  return { origin, baseURL: `${origin}/v1`, requests, close: () => server.close() };
}
