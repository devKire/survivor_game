import {
  clientMessage,
  serverMessage,
  type ClientMessage,
  type ServerMessage,
} from "./protocol";
export class RealtimeClient {
  socket?: WebSocket;
  closed = false;
  attempt = 0;
  timer: ReturnType<typeof setTimeout> | undefined;
  heartbeat: ReturnType<typeof setInterval> | undefined;
  rtt = 0;
  packets = 0;
  constructor(
    private ticket: () => Promise<string>,
    private receive: (message: ServerMessage) => void,
    private status: (value: string) => void,
  ) {}
  async connect() {
    if (this.closed) return;
    this.status("Conectando…");
    try {
      const ticket = await this.ticket();
      if (this.closed) return;
      const socket = new WebSocket(
        process.env.NEXT_PUBLIC_REALTIME_URL || "ws://localhost:3001",
      );
      this.socket = socket;
      socket.onopen = () => {
        this.attempt = 0;
        socket.send(JSON.stringify({ type: "HELLO", ticket }));
        this.heartbeat = setInterval(
          () =>
            this.send({
              type: "PING",
              at: performance.now(),
              rtt: Math.min(60000, this.rtt),
            }),
          2000,
        );
      };
      socket.onmessage = (e) => {
        if (typeof e.data !== "string" || e.data.length > 2_000_000) return;
        let data: unknown;
        try {
          data = JSON.parse(e.data);
        } catch {
          return;
        }
        const v = serverMessage.safeParse(data);
        if (!v.success) {
          this.status("Resposta de rede inválida.");
          return;
        }
        this.packets++;
        if (v.data.type === "ACCOUNT") this.status("Online");
        if (v.data.type === "PONG") this.rtt = performance.now() - v.data.at;
        this.receive(v.data);
      };
      socket.onclose = (e) => {
        clearInterval(this.heartbeat);
        if (this.closed) return;
        if (e.code === 4001 || e.code === 4401) {
          this.status(
            e.code === 4001
              ? "Conta conectada em outra aba."
              : "Sessão expirada. Entre novamente.",
          );
          return;
        }
        this.retry();
      };
      socket.onerror = () => socket.close();
    } catch {
      this.retry();
    }
  }
  private retry() {
    if (this.closed) return;
    this.status("Reconectando… janela de 60 s");
    clearTimeout(this.timer);
    this.timer = setTimeout(
      () => void this.connect(),
      Math.min(5000, 500 * 2 ** this.attempt++),
    );
  }
  send(message: ClientMessage) {
    if (this.socket?.readyState === WebSocket.OPEN)
      this.socket.send(JSON.stringify(clientMessage.parse(message)));
  }
  close() {
    this.closed = true;
    clearTimeout(this.timer);
    clearInterval(this.heartbeat);
    this.socket?.close();
  }
}
