import type { Portal } from './types';

export const portalTemplates: Omit<Portal, 'id'>[] = [
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
];
