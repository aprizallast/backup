export function buildLocalDevOrigins(
  ports: number[] = [8080, 8081, 8082, 8083, 8084, 8085, 3000, 5173],
): string[] {
  const seen = new Set<number>();
  const extraPorts = [
    Number.parseInt(process.env.PORT ?? "", 10),
    Number.parseInt(process.env.VITE_PORT ?? "", 10),
  ].filter((port): port is number => Number.isInteger(port) && port > 0);

  for (const port of [...ports, ...extraPorts]) {
    seen.add(port);
  }

  return Array.from(seen)
    .sort((a, b) => a - b)
    .flatMap((port) => [
      `http://localhost:${port}`,
      `http://127.0.0.1:${port}`,
      `http://[::1]:${port}`,
    ]);
}
