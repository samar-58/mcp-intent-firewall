import express from "express";

const port = Number(process.env.PORT ?? 3000);

const app = express();

app.use(express.json());

app.get("/api/health", (_request, response) => {
  response.json({
    ok: true,
    service: "mcp-intent-firewall-api",
  });
});

app.use((_request, response) => {
  response.status(404).json({
    error: "Not found",
  });
});

app.listen(port, () => {
  console.log(`API server listening on http://localhost:${port}`);
});
