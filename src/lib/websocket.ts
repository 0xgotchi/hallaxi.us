export const getWebSocketUrl = (path: string): string => {
  const serverUrl = process.env.NEXT_PUBLIC_HALLAXIUS_SERVER_URL || 'http://localhost:3070';
  const wsProtocol = serverUrl.startsWith('https') ? 'wss' : 'ws';
  const baseUrl = serverUrl.replace(/^https?:\/\//, '');
  return `${wsProtocol}://${baseUrl}${path.startsWith('/') ? path : `/${path}`}`;
};