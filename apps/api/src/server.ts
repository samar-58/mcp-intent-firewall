import { createApiApp } from "./app";

const port = Number(process.env.PORT ?? 3000);

const { app } = await createApiApp();

const server = app.listen(port, () => {
  console.log(`API server listening on http://localhost:${port}`);
});

process.on("SIGINT", () => {
  server.close(() => process.exit(0));
});

process.on("SIGTERM", () => {
  server.close(() => process.exit(0));
});
