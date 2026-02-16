# Troubleshooting

## Readiness badge

The readiness badge in the top-right corner of the header tells you if Elisa is ready to build:

| Badge | Color | Meaning | Fix |
|-------|-------|---------|-----|
| **Ready** | Green | Everything is configured and working | None needed |
| **Checking...** | Gray | Elisa is testing the connection | Wait a moment |
| **Needs API Key** | Yellow | No API key, or the key is invalid | See "API key issues" below |
| **Not Ready** | Yellow | Backend is running but something is wrong | Check the tooltip for details |
| **Offline** | Red | Cannot reach the backend server | See "Backend not running" below |

## API key issues

**"No API key found"**
- In the Electron app: Go to settings and enter your Anthropic API key.
- In dev mode: Set the `ANTHROPIC_API_KEY` environment variable before starting the backend.

**"That API key didn't work"**
- Check that you copied the full key (starts with `sk-ant-`).
- Verify the key is active at [console.anthropic.com](https://console.anthropic.com).
- Make sure there are no extra spaces or newline characters.

## Backend not running

If the badge shows "Offline":
- **Electron app**: The backend starts automatically. Try restarting the app.
- **Dev mode**: Make sure the backend is running (`cd backend && npm run dev`). It should be on port 8000.
- Check the terminal for error messages.

## WebSocket disconnected

The frontend auto-reconnects every 3 seconds. If you see lost updates:
- Check if the backend is still running.
- If the backend crashed, restart it and start a new build (the old session is lost).

## Build stuck or errors

**Build seems stuck**
- Check the Progress tab in the bottom bar for the current phase.
- Check the Tokens tab -- if usage is near the budget limit (500k tokens default), the build may have been stopped.
- Press STOP and try again with a simpler design.

**Error banner appears**
- A red banner at the top shows error messages. Click the X to dismiss.
- "Elisa can't connect to her AI brain" -- The API key is missing or invalid.
- Build errors include details about what went wrong. Check the message for clues.
- For validation errors, the message includes which fields have problems.

## Board not detected

- Check the USB cable (some are charge-only with no data wires).
- Try a different USB port.
- Install the USB driver for your board's chip (CP210x, CH9102).
- On Windows, open Device Manager and look for the COM port under "Ports".
- See the [Hardware](hardware.md) page for the full list of supported boards.

## Port conflicts

- Backend defaults to port 8000. If something else is using it, change `PORT` in the environment.
- Frontend defaults to port 5173 in dev mode.
- Both ports must be available for Elisa to work in dev mode.

## Tests fail with "pytest not found"

Install Python and pytest:

```bash
pip install pytest pytest-cov
```

The test runner calls `pytest tests/ -v --cov=src`. Both `python` and `pytest` must be on your PATH.

## Token budget exceeded

Each build session has a default budget of 500,000 tokens. When usage reaches 80%, a warning appears. When the budget is exceeded, the build stops gracefully.

To work within the budget:
- Use simpler designs with fewer features.
- Use the "Keep working" option after a build completes to iterate instead of starting from scratch.
- Add fewer agents -- each agent uses tokens independently.

## Common error messages

| Error | Meaning | Fix |
|-------|---------|-----|
| "Elisa can't connect to her AI brain" | API key issue | Check your Anthropic API key |
| "Elisa couldn't get ready to build" | Session creation failed | Restart the backend |
| "No ESP32 board detected" | Hardware flash failed | Connect board, check USB cable |
| "mpremote not found" | Flash tool missing | Run `pip install mpremote` |
| "Flash timed out after 60 seconds" | Board not responding | Reset the board and try again |
| "Agent SDK not installed" | Missing dependency | Run `npm install` in the backend folder |
