import * as fs from "fs";
import * as path from "path";

export enum LogLevel {
  ERROR = "error",
  WARN = "warn",
  INFO = "info",
  DEBUG = "debug",
}

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  data?: any;
  tradeId?: string;
  symbol?: string;
}

// Configuration state
let logLevel: LogLevel = (process.env.LOG_LEVEL as LogLevel) || LogLevel.INFO;
let logToFile: boolean = process.env.LOG_TO_FILE === "true";
let logFilePath: string = process.env.LOG_FILE_PATH || "./logs/trading-bot.log";
let logDir: string = path.dirname(logFilePath);

// Initialize log directory
if (logToFile && !fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

function shouldLog(level: LogLevel): boolean {
  const levels = [LogLevel.ERROR, LogLevel.WARN, LogLevel.INFO, LogLevel.DEBUG];
  const currentLevelIndex = levels.indexOf(logLevel);
  const messageLevelIndex = levels.indexOf(level);
  return messageLevelIndex <= currentLevelIndex;
}

function formatLogEntry(entry: LogEntry): string {
  const baseLog = `[${entry.timestamp}] ${entry.level.toUpperCase()}: ${
    entry.message
  }`;

  if (entry.symbol) {
    return `${baseLog} | Symbol: ${entry.symbol}`;
  }

  if (entry.tradeId) {
    return `${baseLog} | Trade ID: ${entry.tradeId}`;
  }

  if (entry.data) {
    return `${baseLog} | Data: ${JSON.stringify(entry.data)}`;
  }

  return baseLog;
}

function writeToFile(logEntry: string): void {
  if (logToFile) {
    try {
      fs.appendFileSync(logFilePath, logEntry + "\n");
    } catch (error) {
      console.error("Failed to write to log file:", error);
    }
  }
}

function log(
  level: LogLevel,
  message: string,
  data?: any,
  tradeId?: string,
  symbol?: string
): void {
  if (!shouldLog(level)) {
    return;
  }

  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    data,
    tradeId,
    symbol,
  };

  const formattedLog = formatLogEntry(entry);

  // Console output with colors
  switch (level) {
    case LogLevel.ERROR:
      console.error("\x1b[31m%s\x1b[0m", formattedLog);
      break;
    case LogLevel.WARN:
      console.warn("\x1b[33m%s\x1b[0m", formattedLog);
      break;
    case LogLevel.INFO:
      console.info("\x1b[36m%s\x1b[0m", formattedLog);
      break;
    case LogLevel.DEBUG:
      console.debug("\x1b[90m%s\x1b[0m", formattedLog);
      break;
  }

  // File output
  writeToFile(formattedLog);
}

export function error(
  message: string,
  data?: any,
  tradeId?: string,
  symbol?: string
): void {
  log(LogLevel.ERROR, message, data, tradeId, symbol);
}

export function warn(
  message: string,
  data?: any,
  tradeId?: string,
  symbol?: string
): void {
  log(LogLevel.WARN, message, data, tradeId, symbol);
}

export function info(
  message: string,
  data?: any,
  tradeId?: string,
  symbol?: string
): void {
  log(LogLevel.INFO, message, data, tradeId, symbol);
}

export function debug(
  message: string,
  data?: any,
  tradeId?: string,
  symbol?: string
): void {
  log(LogLevel.DEBUG, message, data, tradeId, symbol);
}

// Specialized logging methods for trading activities
export function tradeExecuted(
  symbol: string,
  side: "buy" | "sell",
  quantity: number,
  price: number,
  tradeId: string
): void {
  info(
    `Trade executed: ${side.toUpperCase()} ${quantity} shares of ${symbol} at $${price}`,
    { side, quantity, price },
    tradeId,
    symbol
  );
}

export function tradeFailed(
  symbol: string,
  side: "buy" | "sell",
  reason: string,
  data?: any
): void {
  error(
    `Trade failed: ${side.toUpperCase()} ${symbol} - ${reason}`,
    data,
    undefined,
    symbol
  );
}

export function strategyDecision(
  symbol: string,
  decision: "buy" | "sell" | "hold",
  confidence: number,
  data?: any
): void {
  info(
    `Strategy decision: ${decision.toUpperCase()} ${symbol} (confidence: ${confidence})`,
    { decision, confidence, ...data },
    undefined,
    symbol
  );
}

export function botStatus(status: string, data?: any): void {
  info(`Bot status: ${status}`, data);
}

export function marketData(
  symbol: string,
  price: number,
  volume: number,
  timestamp: string
): void {
  debug(
    `Market data: ${symbol} - Price: $${price}, Volume: ${volume}`,
    { price, volume, timestamp },
    undefined,
    symbol
  );
}

// Configuration functions
export function setLogLevel(level: LogLevel): void {
  logLevel = level;
}

export function setLogToFile(enabled: boolean): void {
  logToFile = enabled;
}

export function setLogFilePath(filePath: string): void {
  logFilePath = filePath;
  logDir = path.dirname(filePath);

  if (logToFile && !fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }
}
