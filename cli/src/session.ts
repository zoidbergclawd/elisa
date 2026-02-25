export class SessionClient {
  private baseUrl: string;
  private token: string;

  constructor(port: number, token: string) {
    this.baseUrl = `http://127.0.0.1:${port}`;
    this.token = token;
  }

  private headers(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${this.token}`,
    };
  }

  async create(): Promise<string> {
    const res = await fetch(`${this.baseUrl}/api/sessions`, {
      method: 'POST',
      headers: this.headers(),
    });
    if (!res.ok) throw new Error(`Create session failed: ${res.status}`);
    const body = (await res.json()) as { session_id: string };
    return body.session_id;
  }

  async start(
    sessionId: string,
    spec: Record<string, unknown>,
    workspacePath?: string,
  ): Promise<{ status: string }> {
    const res = await fetch(`${this.baseUrl}/api/sessions/${sessionId}/start`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({ spec, workspace_path: workspacePath }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(`Start session failed: ${res.status} ${JSON.stringify(body)}`);
    }
    return res.json() as Promise<{ status: string }>;
  }

  async stop(sessionId: string): Promise<{ status: string }> {
    const res = await fetch(`${this.baseUrl}/api/sessions/${sessionId}/stop`, {
      method: 'POST',
      headers: this.headers(),
    });
    if (!res.ok) throw new Error(`Stop session failed: ${res.status}`);
    return res.json() as Promise<{ status: string }>;
  }

  async getStatus(sessionId: string): Promise<Record<string, unknown>> {
    const res = await fetch(`${this.baseUrl}/api/sessions/${sessionId}`, {
      headers: this.headers(),
    });
    if (!res.ok) throw new Error(`Get status failed: ${res.status}`);
    return res.json() as Promise<Record<string, unknown>>;
  }
}
