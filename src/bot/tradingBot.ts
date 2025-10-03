import * as alpacaService from "../services/alpacaService";
import * as strategyService from "../services/strategyService";
import * as logger from "../services/loggerService";
import * as scheduler from "./scheduler";
import type {
  AlpacaQuote,
  AlpacaPosition,
  AlpacaOrder,
  OptionsChain,
  CreateOptionsOrderRequest,
} from "../services/alpacaService";
import type { MarketData, StrategyDecision } from "../services/strategyService";
import type { BotStatus } from "./scheduler";

export interface BotConfig {
  symbols: string[];
  maxPositions: number;
  riskPercentage: number;
  maxPositionSize: number;
  useConsensus: boolean; // Use consensus from multiple strategies vs best decision
  dryRun: boolean; // Don't actually place trades
  enableLogging: boolean;
  // Options trading configuration
  useOptions: boolean; // Trade options instead of stocks
  optionType: "call" | "put"; // Default option type
  maxStrikePrice?: number; // Maximum strike price for options
  minVolume: number; // Minimum volume for options selection
  expirationDays: number; // Days to expiration for options (default 30)
}

export interface BotMetrics {
  totalTrades: number;
  successfulTrades: number;
  failedTrades: number;
  totalProfit: number;
  lastTradeTime?: Date;
  symbolsTraded: Set<string>;
  strategiesUsed: Set<string>;
}

export interface TradeResult {
  success: boolean;
  orderId?: string;
  symbol: string;
  action: "buy" | "sell";
  quantity: number;
  price: number;
  reason: string;
  strategyName?: string;
  error?: string;
}

// Bot state
let config: BotConfig = {
  symbols: ["AAPL", "MSFT", "GOOGL", "TSLA", "AMZN"], // Default symbols
  maxPositions: 10,
  riskPercentage: 0.02,
  maxPositionSize: 1000,
  useConsensus: true,
  dryRun: false,
  enableLogging: true,
  // Options trading configuration
  useOptions: true, // Enable options trading
  optionType: "call", // Default to call options
  maxStrikePrice: undefined, // No limit by default
  minVolume: 10, // Minimum volume for options
  expirationDays: 30, // 30 days to expiration
};

let metrics: BotMetrics = {
  totalTrades: 0,
  successfulTrades: 0,
  failedTrades: 0,
  totalProfit: 0,
  symbolsTraded: new Set(),
  strategiesUsed: new Set(),
};

let isInitialized: boolean = false;
let lastTradeTime: Date | null = null;

// Initialize bot
function initializeBot(customConfig?: Partial<BotConfig>): void {
  config = {
    ...config,
    ...customConfig,
  };

  metrics = {
    totalTrades: 0,
    successfulTrades: 0,
    failedTrades: 0,
    totalProfit: 0,
    symbolsTraded: new Set(),
    strategiesUsed: new Set(),
  };

  isInitialized = false;
  lastTradeTime = null;

  logger.info("Trading bot initialized", config);
}

export async function initialize(): Promise<void> {
  if (isInitialized) {
    logger.warn("Bot is already initialized");
    return;
  }

  try {
    // Test Alpaca connection
    await alpacaService.getAccount();
    logger.info("Alpaca connection verified");

    // Set up scheduler callback
    scheduler.setCallback(() => runTradingCycle());

    isInitialized = true;
    logger.info("Trading bot initialized successfully");
  } catch (error) {
    logger.error("Failed to initialize trading bot", error);
    throw error;
  }
}

export async function start(): Promise<void> {
  if (!isInitialized) {
    await initialize();
  }

  if (scheduler.getStatus().isRunning) {
    logger.warn("Bot is already running");
    return;
  }

  await scheduler.start();
  logger.botStatus("Bot started successfully");
}

export async function stop(): Promise<void> {
  scheduler.stop();
  logger.botStatus("Bot stopped");
}

export async function runTradingCycle(): Promise<void> {
  if (!isInitialized) {
    logger.error("Bot not initialized");
    return;
  }

  try {
    logger.info("Starting trading cycle", { symbols: config.symbols });

    // Get current positions
    const positions = await alpacaService.getPositions();
    const positionMap = new Map<string, AlpacaPosition>();
    positions.forEach((pos) => positionMap.set(pos.symbol, pos));

    // Process each symbol
    for (const symbol of config.symbols) {
      try {
        await processSymbol(symbol, positionMap.get(symbol));
      } catch (error) {
        logger.error(`Failed to process symbol ${symbol}`, error);
      }
    }

    logger.info("Trading cycle completed", {
      symbolsProcessed: config.symbols.length,
      totalTrades: metrics.totalTrades,
    });
  } catch (error) {
    logger.error("Trading cycle failed", error);
  }
}

async function processSymbol(
  symbol: string,
  position?: AlpacaPosition
): Promise<void> {
  try {
    // Get current quote
    const quote = await alpacaService.getQuote(symbol);
    const currentPrice = (quote.bid + quote.ask) / 2;

    // Get options chain if options trading is enabled
    let optionsChain: OptionsChain[] | undefined;
    if (config.useOptions) {
      try {
        optionsChain = await alpacaService.getOptionsChain(symbol);
        if (optionsChain && Array.isArray(optionsChain)) {
          logger.debug(`Retrieved options chain for ${symbol}`, {
            count: optionsChain.length,
          });
        } else {
          logger.warn(`Invalid options chain response for ${symbol}`, {
            optionsChain,
          });
          optionsChain = [];
        }
      } catch (error) {
        logger.warn(`Failed to get options chain for ${symbol}`, error);
        optionsChain = [];
      }
    }

    // Prepare market data
    const marketData: MarketData = {
      symbol,
      currentPrice,
      volume: quote.bid_size + quote.ask_size,
      timestamp: quote.timestamp,
      quote,
      position,
      optionsChain,
    };

    // Get strategy decisions
    const decisions = await strategyService.analyzeSymbol(symbol, marketData);

    if (decisions.length === 0) {
      logger.debug(`No strategy decisions for ${symbol}`);
      return;
    }

    // Get final decision (consensus or best)
    const finalDecision = config.useConsensus
      ? strategyService.getConsensusDecision(decisions)
      : strategyService.getBestDecision(decisions);

    if (!finalDecision) {
      logger.debug(`No final decision for ${symbol}`);
      return;
    }

    // Execute trade if decision is not hold
    if (finalDecision.action !== "hold") {
      const tradeResult = await executeTrade(
        symbol,
        finalDecision as StrategyDecision & { action: "buy" | "sell" },
        position
      );

      if (tradeResult.success) {
        metrics.successfulTrades++;
        metrics.symbolsTraded.add(symbol);
        if (finalDecision.metadata?.strategyName) {
          metrics.strategiesUsed.add(finalDecision.metadata.strategyName);
        }
      } else {
        metrics.failedTrades++;
      }

      metrics.totalTrades++;
      lastTradeTime = new Date();
    }
  } catch (error) {
    logger.error(`Error processing symbol ${symbol}`, error);
  }
}

async function executeTrade(
  symbol: string,
  decision: StrategyDecision & { action: "buy" | "sell" },
  position?: AlpacaPosition
): Promise<TradeResult> {
  const { action, quantity, reason, metadata } = decision;

  try {
    if (config.useOptions && action === "buy") {
      return await executeOptionsTrade(symbol, decision, position);
    }

    if (config.dryRun) {
      logger.info(
        `DRY RUN: Would ${action} ${quantity || 1} shares of ${symbol}`,
        {
          reason,
          strategy: metadata?.strategyName,
        }
      );

      return {
        success: true,
        symbol,
        action,
        quantity: quantity || 1,
        price: 0,
        reason,
        strategyName: metadata?.strategyName,
      };
    }

    // Validate trade
    const validation = validateTrade(symbol, action, quantity, position);
    if (!validation.valid) {
      return {
        success: false,
        symbol,
        action,
        quantity: quantity || 0,
        price: 0,
        reason: validation.reason,
        error: validation.reason,
      };
    }

    // Place order
    const orderRequest = {
      symbol,
      side: action,
      type: "market" as const,
      time_in_force: "day" as const,
      qty: quantity,
    };

    const order = await alpacaService.createOrder(orderRequest);

    logger.tradeExecuted(symbol, action, quantity || 0, 0, order.id);

    return {
      success: true,
      orderId: order.id,
      symbol,
      action,
      quantity: quantity || 0,
      price: 0, // Will be filled when order executes
      reason,
      strategyName: metadata?.strategyName,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.tradeFailed(symbol, action, errorMessage, error);

    return {
      success: false,
      symbol,
      action,
      quantity: quantity || 0,
      price: 0,
      reason,
      error: errorMessage,
    };
  }
}

async function executeOptionsTrade(
  symbol: string,
  decision: StrategyDecision & { action: "buy" | "sell" },
  position?: AlpacaPosition
): Promise<TradeResult> {
  const { action, reason, metadata } = decision;

  try {
    // Check if we already have a position for this symbol (for options, we check the underlying)
    if (action === "buy" && position && parseFloat(position.qty) > 0) {
      return {
        success: false,
        symbol,
        action,
        quantity: 0,
        price: 0,
        reason: `Already have position in ${symbol} (${position.qty} shares)`,
        error: "Position already exists",
      };
    }

    // Get options chain for the symbol
    const optionsChain = await alpacaService.getOptionsChain(symbol);

    if (
      !optionsChain ||
      !Array.isArray(optionsChain) ||
      optionsChain.length === 0
    ) {
      return {
        success: false,
        symbol,
        action,
        quantity: 0,
        price: 0,
        reason: "No options available for this symbol",
        error: "No options chain found",
      };
    }

    // Find the best options contract
    const bestOption = alpacaService.findBestOptionsContract(
      optionsChain,
      config.optionType,
      config.maxStrikePrice,
      config.minVolume
    );

    if (!bestOption) {
      return {
        success: false,
        symbol,
        action,
        quantity: 0,
        price: 0,
        reason: `No suitable ${config.optionType} options found`,
        error: "No suitable options contract",
      };
    }

    // Check if we already have any position in the underlying stock
    if (action === "buy") {
      try {
        const existingStockPosition = await alpacaService.getPosition(symbol);
        if (
          existingStockPosition &&
          parseFloat(existingStockPosition.qty) > 0
        ) {
          return {
            success: false,
            symbol,
            action,
            quantity: 0,
            price: 0,
            reason: `Already have position in underlying stock ${symbol} (${existingStockPosition.qty} shares) - skipping options trade`,
            error: "Underlying stock position already exists",
          };
        }
      } catch (error) {
        // If position doesn't exist, that's fine - we can proceed
        logger.debug(
          `No existing position found for underlying stock ${symbol}`
        );
      }
    }

    if (config.dryRun) {
      logger.info(
        `DRY RUN: Would ${action} 1 ${config.optionType} option contract of ${symbol}`,
        {
          optionSymbol: bestOption.symbol,
          strikePrice: bestOption.strike_price,
          expirationDate: bestOption.expiration_date,
          closePrice: bestOption.close_price,
          reason,
          strategy: metadata?.strategyName,
        }
      );

      return {
        success: true,
        symbol: bestOption.symbol,
        action,
        quantity: 1,
        price: parseFloat(bestOption.close_price || "0"),
        reason,
        strategyName: metadata?.strategyName,
      };
    }

    // Place options order
    const optionsOrderRequest: CreateOptionsOrderRequest = {
      symbol: bestOption.symbol,
      qty: 1, // Options are typically traded in single contracts
      side: action,
      type: "market",
      time_in_force: "day",
    };

    const order = await alpacaService.createOptionsOrder(optionsOrderRequest);

    logger.tradeExecuted(
      bestOption.symbol,
      action,
      1,
      parseFloat(bestOption.close_price || "0"),
      order.id
    );

    return {
      success: true,
      orderId: order.id,
      symbol: bestOption.symbol,
      action,
      quantity: 1,
      price: parseFloat(bestOption.close_price || "0"),
      reason,
      strategyName: metadata?.strategyName,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.tradeFailed(symbol, action, errorMessage, error);

    return {
      success: false,
      symbol,
      action,
      quantity: 0,
      price: 0,
      reason,
      error: errorMessage,
    };
  }
}

function validateTrade(
  symbol: string,
  action: "buy" | "sell",
  quantity?: number,
  position?: AlpacaPosition
): { valid: boolean; reason: string } {
  if (!quantity || quantity <= 0) {
    return { valid: false, reason: "Invalid quantity" };
  }

  if (action === "sell") {
    if (!position || parseFloat(position.qty) < quantity) {
      return { valid: false, reason: "Insufficient shares to sell" };
    }
  }

  if (action === "buy") {
    // Check if we already have a position for this symbol
    if (position && parseFloat(position.qty) > 0) {
      return {
        valid: false,
        reason: `Already have position in ${symbol} (${position.qty} shares)`,
      };
    }

    // Check if we already have too many positions
    // This would require getting all positions, but for now we'll skip this check
    // In a real implementation, you'd want to check position limits
  }

  return { valid: true, reason: "Trade validated" };
}

// Manual trade execution methods
export async function buy(
  symbol: string,
  quantity: number,
  reason: string = "Manual buy"
): Promise<TradeResult> {
  const decision: StrategyDecision = {
    action: "buy",
    confidence: 1.0,
    reason,
    quantity,
  };

  const position = await alpacaService.getPosition(symbol);
  return executeTrade(
    symbol,
    decision as StrategyDecision & { action: "buy" | "sell" },
    position || undefined
  );
}

export async function sell(
  symbol: string,
  quantity: number,
  reason: string = "Manual sell"
): Promise<TradeResult> {
  const decision: StrategyDecision = {
    action: "sell",
    confidence: 1.0,
    reason,
    quantity,
  };

  const position = await alpacaService.getPosition(symbol);
  return executeTrade(
    symbol,
    decision as StrategyDecision & { action: "buy" | "sell" },
    position || undefined
  );
}

// Status and monitoring methods
export function getStatus(): BotStatus & {
  metrics: BotMetrics;
  config: BotConfig;
} {
  return {
    ...scheduler.getStatus(),
    metrics: { ...metrics },
    config: { ...config },
  };
}

export function getMetrics(): BotMetrics {
  return { ...metrics };
}

export function getConfig(): BotConfig {
  return { ...config };
}

export function updateConfig(newConfig: Partial<BotConfig>): void {
  config = { ...config, ...newConfig };
  logger.info("Bot configuration updated", config);
}

// Utility methods
export async function getAccountInfo() {
  return await alpacaService.getAccount();
}

export async function getPositions() {
  return await alpacaService.getPositions();
}

export async function getPosition(symbol: string) {
  return await alpacaService.getPosition(symbol);
}

export async function getQuote(symbol: string) {
  return await alpacaService.getQuote(symbol);
}

export async function getOrders(status?: string) {
  return await alpacaService.getOrders(status);
}

// Reset metrics (useful for testing)
export function resetMetrics(): void {
  metrics = {
    totalTrades: 0,
    successfulTrades: 0,
    failedTrades: 0,
    totalProfit: 0,
    symbolsTraded: new Set(),
    strategiesUsed: new Set(),
  };
  logger.info("Bot metrics reset");
}

// Get performance summary
export function getPerformanceSummary(): {
  successRate: number;
  totalTrades: number;
  symbolsTraded: number;
  strategiesUsed: number;
  lastTradeTime?: Date;
} {
  const successRate =
    metrics.totalTrades > 0
      ? (metrics.successfulTrades / metrics.totalTrades) * 100
      : 0;

  return {
    successRate: Math.round(successRate * 100) / 100,
    totalTrades: metrics.totalTrades,
    symbolsTraded: metrics.symbolsTraded.size,
    strategiesUsed: metrics.strategiesUsed.size,
    lastTradeTime: lastTradeTime || undefined,
  };
}

// Initialize on module load
initializeBot();
