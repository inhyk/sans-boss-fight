import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";

const host = "127.0.0.1";
const port = Number(process.env.PORT || 4173);
const root = process.cwd();

const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml; charset=utf-8",
};

const server = createServer(async (req, res) => {
  const requestPath = new URL(req.url || "/", "http://localhost").pathname;
  const normalizedPath = requestPath === "/" ? "/index.html" : requestPath;
  const filePath = path.join(root, normalizedPath);

  try {
    const content = await readFile(filePath);
    const ext = path.extname(filePath);
    res.writeHead(200, { "Content-Type": mimeTypes[ext] || "text/plain; charset=utf-8" });
    res.end(content);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not found");
  }
});

server.listen(port, host, () => {
  console.log(`Sans Boss Fight listening on http://${host}:${port}`);
});
