import { Router, Request, Response } from "express";
import * as tradingBot from "../../bot/tradingBot";
import * as alpacaService from "../../services/alpacaService";
import * as scheduler from "../../bot/scheduler";
import * as strategyService from "../../services/strategyService";
import * as logger from "../../services/loggerService";

const router = Router();

// GET /account - Get Alpaca account information
router.get("/account", async (req: Request, res: Response) => {
  try {
    const account = await alpacaService.getAccount();

    res.json({
      success: true,
      data: {
        id: account.id,
        account_number: account.account_number,
        status: account.status,
        currency: account.currency,
        buying_power: parseFloat(account.buying_power),
        cash: parseFloat(account.cash),
        portfolio_value: parseFloat(account.portfolio_value),
        equity: parseFloat(account.equity),
        long_market_value: parseFloat(account.long_market_value),
        short_market_value: parseFloat(account.short_market_value),
        pattern_day_trader: account.pattern_day_trader,
        trading_blocked: account.trading_blocked,
        transfers_blocked: account.transfers_blocked,
        account_blocked: account.account_blocked,
        created_at: account.created_at,
      },
    });
  } catch (error) {
    logger.error("Failed to get account information", error);
    res.status(500).json({
      success: false,
      error: "Failed to get account information",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

// GET /positions - Get current positions
router.get("/positions", async (req: Request, res: Response) => {
  try {
    const positions = await alpacaService.getPositions();

    const formattedPositions = positions.map((pos) => ({
      symbol: pos.symbol,
      qty: parseFloat(pos.qty),
      side: pos.side,
      market_value: parseFloat(pos.market_value),
      cost_basis: parseFloat(pos.cost_basis),
      unrealized_pl: parseFloat(pos.unrealized_pl),
      unrealized_plpc: parseFloat(pos.unrealized_plpc),
      unrealized_intraday_pl: parseFloat(pos.unrealized_intraday_pl),
      unrealized_intraday_plpc: parseFloat(pos.unrealized_intraday_plpc),
      current_price: parseFloat(pos.current_price),
      lastday_price: parseFloat(pos.lastday_price),
      change_today: parseFloat(pos.change_today),
      asset_class: pos.asset_class,
      exchange: pos.exchange,
    }));

    res.json({
      success: true,
      data: formattedPositions,
      count: formattedPositions.length,
    });
  } catch (error) {
    logger.error("Failed to get positions", error);
    res.status(500).json({
      success: false,
      error: "Failed to get positions",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

// GET /position/:symbol - Get specific position
router.get("/position/:symbol", async (req: Request, res: Response) => {
  try {
    const { symbol } = req.params;
    const position = await alpacaService.getPosition(symbol.toUpperCase());

    if (!position) {
      return res.status(404).json({
        success: false,
        error: "Position not found",
      });
    }

    return res.json({
      success: true,
      data: {
        symbol: position.symbol,
        qty: parseFloat(position.qty),
        side: position.side,
        market_value: parseFloat(position.market_value),
        cost_basis: parseFloat(position.cost_basis),
        unrealized_pl: parseFloat(position.unrealized_pl),
        unrealized_plpc: parseFloat(position.unrealized_plpc),
        unrealized_intraday_pl: parseFloat(position.unrealized_intraday_pl),
        unrealized_intraday_plpc: parseFloat(position.unrealized_intraday_plpc),
        current_price: parseFloat(position.current_price),
        lastday_price: parseFloat(position.lastday_price),
        change_today: parseFloat(position.change_today),
        asset_class: position.asset_class,
        exchange: position.exchange,
      },
    });
  } catch (error) {
    logger.error(`Failed to get position for ${req.params.symbol}`, error);
    return res.status(500).json({
      success: false,
      error: "Failed to get position",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

// GET /quote/:symbol - Get current quote for a symbol
router.get("/quote/:symbol", async (req: Request, res: Response) => {
  try {
    const { symbol } = req.params;
    const quote = await alpacaService.getQuote(symbol.toUpperCase());

    res.json({
      success: true,
      data: {
        symbol: quote.symbol,
        bid: quote.bid,
        ask: quote.ask,
        bid_size: quote.bid_size,
        ask_size: quote.ask_size,
        timestamp: quote.timestamp,
        spread: quote.ask - quote.bid,
        mid_price: (quote.bid + quote.ask) / 2,
      },
    });
  } catch (error) {
    logger.error(`Failed to get quote for ${req.params.symbol}`, error);
    res.status(500).json({
      success: false,
      error: "Failed to get quote",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

// GET /orders - Get recent orders
router.get("/orders", async (req: Request, res: Response) => {
  try {
    const { status, limit } = req.query;
    const orders = await alpacaService.getOrders(
      status as string,
      limit ? parseInt(limit as string) : undefined
    );

    const formattedOrders = orders.map((order) => ({
      id: order.id,
      client_order_id: order.client_order_id,
      symbol: order.symbol,
      side: order.side,
      type: order.type,
      status: order.status,
      qty: order.qty ? parseFloat(order.qty) : null,
      notional: order.notional ? parseFloat(order.notional) : null,
      filled_qty: parseFloat(order.filled_qty),
      filled_avg_price: order.filled_avg_price
        ? parseFloat(order.filled_avg_price)
        : null,
      limit_price: order.limit_price ? parseFloat(order.limit_price) : null,
      stop_price: order.stop_price ? parseFloat(order.stop_price) : null,
      time_in_force: order.time_in_force,
      created_at: order.created_at,
      updated_at: order.updated_at,
      submitted_at: order.submitted_at,
      filled_at: order.filled_at,
      expired_at: order.expired_at,
      canceled_at: order.canceled_at,
      failed_at: order.failed_at,
      extended_hours: order.extended_hours,
    }));

    res.json({
      success: true,
      data: formattedOrders,
      count: formattedOrders.length,
    });
  } catch (error) {
    logger.error("Failed to get orders", error);
    res.status(500).json({
      success: false,
      error: "Failed to get orders",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

// GET /status - Get bot status and metrics
router.get("/status", async (req: Request, res: Response) => {
  try {
    const botStatus = tradingBot.getStatus();
    const performance = tradingBot.getPerformanceSummary();
    const marketStatus = await scheduler.isMarketOpen();
    const timeUntilNext = scheduler.getTimeUntilNextSession();

    res.json({
      success: true,
      data: {
        bot: {
          isRunning: botStatus.isRunning,
          lastRun: botStatus.lastRun,
          nextRun: botStatus.nextRun,
          startTime: botStatus.startTime,
          totalRuns: botStatus.totalRuns,
          errors: botStatus.errors,
          lastError: botStatus.lastError,
        },
        market: {
          isOpen: marketStatus,
          timeUntilNext: timeUntilNext,
        },
        performance: {
          successRate: performance.successRate,
          totalTrades: performance.totalTrades,
          symbolsTraded: performance.symbolsTraded,
          strategiesUsed: performance.strategiesUsed,
          lastTradeTime: performance.lastTradeTime,
        },
        config: {
          symbols: botStatus.config.symbols,
          maxPositions: botStatus.config.maxPositions,
          riskPercentage: botStatus.config.riskPercentage,
          maxPositionSize: botStatus.config.maxPositionSize,
          useConsensus: botStatus.config.useConsensus,
          dryRun: botStatus.config.dryRun,
        },
        scheduler: {
          interval: scheduler.getConfig().intervalMs,
          tradingHours: `${scheduler.getConfig().tradingStartTime}-${
            scheduler.getConfig().tradingEndTime
          }`,
          tradingDays: scheduler.getConfig().tradingDays,
        },
      },
    });
  } catch (error) {
    logger.error("Failed to get bot status", error);
    res.status(500).json({
      success: false,
      error: "Failed to get bot status",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

// GET /strategies - Get available trading strategies
router.get("/strategies", async (req: Request, res: Response) => {
  try {
    const strategies = strategyService.getAllStrategies();

    const formattedStrategies = strategies.map((strategy) => ({
      name: strategy.name,
      config: {
        enabled: strategy.config.enabled,
        riskPercentage: strategy.config.riskPercentage,
        maxPositionSize: strategy.config.maxPositionSize,
        minConfidence: strategy.config.minConfidence,
        parameters: strategy.config.parameters,
      },
    }));

    res.json({
      success: true,
      data: formattedStrategies,
      count: formattedStrategies.length,
    });
  } catch (error) {
    logger.error("Failed to get strategies", error);
    res.status(500).json({
      success: false,
      error: "Failed to get strategies",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

// PUT /strategies/:name - Update strategy configuration
router.put("/strategies/:name", async (req: Request, res: Response) => {
  try {
    const { name } = req.params;
    const {
      enabled,
      riskPercentage,
      maxPositionSize,
      minConfidence,
      parameters,
    } = req.body;

    const strategy = strategyService.getStrategy(name);
    if (!strategy) {
      return res.status(404).json({
        success: false,
        error: "Strategy not found",
      });
    }

    const newConfig: any = {};

    if (typeof enabled === "boolean") {
      newConfig.enabled = enabled;
    }

    if (typeof riskPercentage === "number") {
      newConfig.riskPercentage = riskPercentage;
    }

    if (typeof maxPositionSize === "number") {
      newConfig.maxPositionSize = maxPositionSize;
    }

    if (typeof minConfidence === "number") {
      newConfig.minConfidence = minConfidence;
    }

    if (parameters && typeof parameters === "object") {
      newConfig.parameters = { ...strategy.config.parameters, ...parameters };
    }

    strategyService.updateStrategyConfig(name, newConfig);

    return res.json({
      success: true,
      message: "Strategy configuration updated successfully",
      data: {
        name: name,
        config: strategy.config,
      },
    });
  } catch (error) {
    logger.error(`Failed to update strategy ${req.params.name}`, error);
    return res.status(500).json({
      success: false,
      error: "Failed to update strategy",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

// GET /market/status - Get market status
router.get("/market/status", async (req: Request, res: Response) => {
  try {
    const isOpen = await alpacaService.isMarketOpen();
    const timeUntilNext = scheduler.getTimeUntilNextSession();

    res.json({
      success: true,
      data: {
        isOpen,
        timeUntilNext,
        tradingHours: `${scheduler.getConfig().tradingStartTime}-${
          scheduler.getConfig().tradingEndTime
        }`,
        tradingDays: scheduler.getConfig().tradingDays,
      },
    });
  } catch (error) {
    logger.error("Failed to get market status", error);
    res.status(500).json({
      success: false,
      error: "Failed to get market status",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

// GET /health - Health check endpoint
router.get("/health", async (req: Request, res: Response) => {
  try {
    // Test Alpaca connection
    await alpacaService.getAccount();

    res.json({
      success: true,
      status: "healthy",
      timestamp: new Date().toISOString(),
      services: {
        alpaca: "connected",
        bot: tradingBot.getStatus().isRunning ? "running" : "stopped",
        scheduler: scheduler.getStatus().isRunning ? "running" : "stopped",
      },
    });
  } catch (error) {
    logger.error("Health check failed", error);
    res.status(503).json({
      success: false,
      status: "unhealthy",
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

export default router;
