import type { Portal } from './types';

export const portalTemplates: Omit<Portal, 'id'>[] = [
  {
    name: 'ESP32 Board',
    description: 'An ESP32 microcontroller connected via USB serial',
    mechanism: 'serial',
    status: 'unconfigured',
    capabilities: [
      { id: 'led-control', name: 'LED on/off/blink', kind: 'action', description: 'Control the onboard LED' },
      { id: 'read-sensor', name: 'Read sensor', kind: 'query', description: 'Read a sensor value from the board' },
      { id: 'button-pressed', name: 'Button pressed', kind: 'event', description: 'React when a button is pressed' },
      { id: 'play-sound', name: 'Play sound', kind: 'action', description: 'Play a tone through the buzzer' },
    ],
    serialConfig: { baudRate: 115200, boardType: 'esp32' },
    templateId: 'esp32',
  },
  {
    name: 'LoRa Radio',
    description: 'A LoRa radio module for long-range wireless messaging',
    mechanism: 'serial',
    status: 'unconfigured',
    capabilities: [
      { id: 'send-message', name: 'Send message', kind: 'action', description: 'Send a wireless message via LoRa' },
      { id: 'message-received', name: 'Message received', kind: 'event', description: 'React when a wireless message arrives' },
    ],
    serialConfig: { baudRate: 115200, boardType: 'lora' },
    templateId: 'lora',
  },
  {
    name: 'File System',
    description: 'Read and write files on the local file system',
    mechanism: 'mcp',
    status: 'unconfigured',
    capabilities: [
      { id: 'read-file', name: 'Read file', kind: 'query', description: 'Read the contents of a file' },
      { id: 'write-file', name: 'Write file', kind: 'action', description: 'Write content to a file' },
      { id: 'list-files', name: 'List files', kind: 'query', description: 'List files in a directory' },
    ],
    mcpConfig: { command: 'npx', args: ['-y', '@anthropic-ai/mcp-filesystem'] },
    templateId: 'filesystem',
  },
  {
    name: 'GitHub',
    description: 'Create issues, read repos, and search code on GitHub',
    mechanism: 'mcp',
    status: 'unconfigured',
    capabilities: [
      { id: 'create-issue', name: 'Create issue', kind: 'action', description: 'Create a new issue in a GitHub repository' },
      { id: 'read-repo', name: 'Read repo', kind: 'query', description: 'Read files and metadata from a GitHub repository' },
      { id: 'search-code', name: 'Search code', kind: 'query', description: 'Search for code across GitHub repositories' },
    ],
    mcpConfig: {
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-github'],
      env: { GITHUB_PERSONAL_ACCESS_TOKEN: '' },
    },
    templateId: 'github',
  },
  {
    name: 'Brave Search',
    description: 'Search the web and find local businesses using Brave Search',
    mechanism: 'mcp',
    status: 'unconfigured',
    capabilities: [
      { id: 'web-search', name: 'Web search', kind: 'query', description: 'Search the web for information' },
      { id: 'local-search', name: 'Local search', kind: 'query', description: 'Search for local businesses and places' },
    ],
    mcpConfig: {
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-brave-search'],
      env: { BRAVE_API_KEY: '' },
    },
    templateId: 'brave-search',
  },
  {
    name: 'Cloud Run Deploy',
    description: 'Deploy your project to Google Cloud Run (requires gcloud CLI)',
    mechanism: 'cli',
    status: 'unconfigured',
    capabilities: [
      { id: 'deploy', name: 'Deploy to Cloud Run', kind: 'action', description: 'Build and deploy to Google Cloud Run' },
    ],
    cliConfig: {
      command: 'gcloud',
      args: ['run', 'deploy', '--source', '.', '--allow-unauthenticated'],
    },
    templateId: 'cloud-run',
  },
];
