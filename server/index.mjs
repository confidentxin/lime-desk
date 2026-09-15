import { createServer } from "node:http";
import { codexGenerateMiddleware } from "./codex/api.mjs";

const HOST = "127.0.0.1";
const PORT = Number(process.env.MINT_BACKEND_PORT || 52881);
const ALLOWED_ORIGIN = "http://127.0.0.1:52880";

function applyCors(req, res) {
  if (req.headers.origin !== ALLOWED_ORIGIN) return;
  res.setHeader("Access-Control-Allow-Origin", ALLOWED_ORIGIN);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Max-Age", "600");
}

function sendJson(res, status, payload) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
}

const handleApi = codexGenerateMiddleware();

const server = createServer((req, res) => {
  applyCors(req, res);

  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }

  handleApi(req, res, () => {
    if (!res.headersSent) {
      sendJson(res, 404, {
        ok: false,
        code: "NOT_FOUND",
        error: "未知端点。",
      });
    }
  }).catch((error) => {
    if (res.headersSent) {
      res.end();
      return;
    }
    sendJson(res, 500, {
      ok: false,
      code: "INTERNAL_ERROR",
      error: error?.message || "本地生成服务发生未知错误。",
    });
  });
});

server.listen(PORT, HOST, () => {
  console.log(`Lime Desk backend listening at http://${HOST}:${PORT}`);
  console.log(`CORS origin: ${ALLOWED_ORIGIN}`);
  console.log("Press Ctrl+C to stop the backend server.");
});

server.on("error", (error) => {
  console.error(`Backend server error: ${error.message}`);
  process.exitCode = 1;
});
