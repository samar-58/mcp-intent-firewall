const port = Number(process.env.PORT ?? 3000);

const server = Bun.serve({
  port,
  fetch(request) {
    const url = new URL(request.url);

    if (url.pathname === "/api/health") {
      return Response.json({
        ok: true,
        service: "mcp-intent-firewall-api",
      });
    }

    return Response.json(
      {
        error: "Not found",
      },
      { status: 404 },
    );
  },
});

console.log(`API server listening on http://localhost:${server.port}`);
