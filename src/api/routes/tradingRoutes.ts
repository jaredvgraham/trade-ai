import { Router, Request, Response } from "express";
import * as tradingBot from "../../bot/tradingBot";
import * as logger from "../../services/loggerService";

const router = Router();

// POST /buy - Manually trigger a buy order
router.post("/buy", async (req: Request, res: Response) => {
  try {
    const { symbol, quantity, reason } = req.body;

    // Validate input
    if (!symbol || !quantity) {
      return res.status(400).json({
        success: false,
        error: "Symbol and quantity are required",
      });
    }

    if (
      typeof symbol !== "string" ||
      typeof quantity !== "number" ||
      quantity <= 0
    ) {
      return res.status(400).json({
        success: false,
        error: "Invalid symbol or quantity",
      });
    }

    logger.info(`Manual buy order requested`, { symbol, quantity, reason });

    const result = await tradingBot.buy(
      symbol.toUpperCase(),
      quantity,
      reason || "Manual buy order"
    );

    if (result.success) {
      return res.json({
        success: true,
        message: "Buy order placed successfully",
        data: {
          orderId: result.orderId,
          symbol: result.symbol,
          action: result.action,
          quantity: result.quantity,
          price: result.price,
          reason: result.reason,
        },
      });
    } else {
      return res.status(400).json({
        success: false,
        error: result.error || "Failed to place buy order",
        data: {
          symbol: result.symbol,
          action: result.action,
          quantity: result.quantity,
          reason: result.reason,
        },
      });
    }
  } catch (error) {
    logger.error("Manual buy order failed", error);
    return res.status(500).json({
      success: false,
      error: "Internal server error",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

// POST /sell - Manually trigger a sell order
router.post("/sell", async (req: Request, res: Response) => {
  try {
    const { symbol, quantity, reason } = req.body;

    // Validate input
    if (!symbol || !quantity) {
      return res.status(400).json({
        success: false,
        error: "Symbol and quantity are required",
      });
    }

    if (
      typeof symbol !== "string" ||
      typeof quantity !== "number" ||
      quantity <= 0
    ) {
      return res.status(400).json({
        success: false,
        error: "Invalid symbol or quantity",
      });
    }

    logger.info(`Manual sell order requested`, { symbol, quantity, reason });

    const result = await tradingBot.sell(
      symbol.toUpperCase(),
      quantity,
      reason || "Manual sell order"
    );

    if (result.success) {
      return res.json({
        success: true,
        message: "Sell order placed successfully",
        data: {
          orderId: result.orderId,
          symbol: result.symbol,
          action: result.action,
          quantity: result.quantity,
          price: result.price,
          reason: result.reason,
        },
      });
    } else {
      return res.status(400).json({
        success: false,
        error: result.error || "Failed to place sell order",
        data: {
          symbol: result.symbol,
          action: result.action,
          quantity: result.quantity,
          reason: result.reason,
        },
      });
    }
  } catch (error) {
    logger.error("Manual sell order failed", error);
    return res.status(500).json({
      success: false,
      error: "Internal server error",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

// POST /bot/start - Start the trading bot
router.post("/bot/start", async (req: Request, res: Response) => {
  try {
    await tradingBot.start();

    res.json({
      success: true,
      message: "Trading bot started successfully",
    });
  } catch (error) {
    logger.error("Failed to start trading bot", error);
    res.status(500).json({
      success: false,
      error: "Failed to start trading bot",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

// POST /bot/stop - Stop the trading bot
router.post("/bot/stop", async (req: Request, res: Response) => {
  try {
    await tradingBot.stop();

    res.json({
      success: true,
      message: "Trading bot stopped successfully",
    });
  } catch (error) {
    logger.error("Failed to stop trading bot", error);
    res.status(500).json({
      success: false,
      error: "Failed to stop trading bot",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

// PUT /bot/config - Update bot configuration
router.put("/bot/config", async (req: Request, res: Response) => {
  try {
    const {
      symbols,
      maxPositions,
      riskPercentage,
      maxPositionSize,
      useConsensus,
      dryRun,
    } = req.body;

    const newConfig: any = {};

    if (symbols && Array.isArray(symbols)) {
      newConfig.symbols = symbols.map((s: string) => s.toUpperCase());
    }

    if (typeof maxPositions === "number") {
      newConfig.maxPositions = maxPositions;
    }

    if (typeof riskPercentage === "number") {
      newConfig.riskPercentage = riskPercentage;
    }

    if (typeof maxPositionSize === "number") {
      newConfig.maxPositionSize = maxPositionSize;
    }

    if (typeof useConsensus === "boolean") {
      newConfig.useConsensus = useConsensus;
    }

    if (typeof dryRun === "boolean") {
      newConfig.dryRun = dryRun;
    }

    tradingBot.updateConfig(newConfig);

    res.json({
      success: true,
      message: "Bot configuration updated successfully",
      config: tradingBot.getConfig(),
    });
  } catch (error) {
    logger.error("Failed to update bot configuration", error);
    res.status(500).json({
      success: false,
      error: "Failed to update bot configuration",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

// POST /bot/cycle - Manually trigger a trading cycle
router.post("/bot/cycle", async (req: Request, res: Response) => {
  try {
    await tradingBot.runTradingCycle();

    res.json({
      success: true,
      message: "Trading cycle executed successfully",
    });
  } catch (error) {
    logger.error("Failed to execute trading cycle", error);
    res.status(500).json({
      success: false,
      error: "Failed to execute trading cycle",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

// POST /bot/reset - Reset bot metrics
router.post("/bot/reset", async (req: Request, res: Response) => {
  try {
    tradingBot.resetMetrics();

    res.json({
      success: true,
      message: "Bot metrics reset successfully",
    });
  } catch (error) {
    logger.error("Failed to reset bot metrics", error);
    res.status(500).json({
      success: false,
      error: "Failed to reset bot metrics",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

export default router;
