import WebSocket from 'ws';

export function listenForEvents(
  url: string,
  onEvent: (event: Record<string, unknown>) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);

    ws.on('open', () => {
      // Connection established
    });

    ws.on('message', (data) => {
      try {
        const event = JSON.parse(data.toString()) as Record<string, unknown>;
        onEvent(event);

        const type = event.type as string;
        if (type === 'session_complete') {
          ws.close();
          resolve();
        }
        if (type === 'error' && event.recoverable === false) {
          ws.close();
          resolve();
        }
      } catch {
        // Ignore non-JSON messages
      }
    });

    ws.on('close', () => {
      resolve(); // Resolve on close in case server closes first
    });

    ws.on('error', (err) => {
      reject(err);
    });
  });
}
