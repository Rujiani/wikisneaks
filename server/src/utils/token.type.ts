const TokenType = {
  ACCESS: 'access',
  REFRESH: 'refresh',
} as const;

type TokenType = (typeof TokenType)[keyof typeof TokenType];

export { TokenType };
