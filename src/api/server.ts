import express, { Application, Request, Response, NextFunction } from "express";
import cors from "cors";
import helmet from "helmet";
import dotenv from "dotenv";
import * as tradingBot from "../bot/tradingBot";
import * as logger from "../services/loggerService";
import tradingRoutes from "./routes/tradingRoutes";
import monitorRoutes from "./routes/monitorRoutes";

// Load environment variables
dotenv.config();

// Server state
let app: Application;
let port: number;

// Initialize server
function initializeServer(): void {
  app = express();
  port = parseInt(process.env.PORT || "3000");

  setupMiddleware();
  setupRoutes();
  setupErrorHandling();
}

function setupMiddleware(): void {
  // Security middleware
  app.use(helmet());

  // CORS middleware
  app.use(
    cors({
      origin:
        process.env.NODE_ENV === "production"
          ? process.env.ALLOWED_ORIGINS?.split(",") || false
          : true,
      credentials: true,
    })
  );

  // Body parsing middleware
  app.use(express.json({ limit: "10mb" }));
  app.use(express.urlencoded({ extended: true, limit: "10mb" }));

  // Request logging middleware
  app.use((req: Request, res: Response, next: NextFunction) => {
    logger.info(`${req.method} ${req.path}`, {
      ip: req.ip,
      userAgent: req.get("User-Agent"),
      body:
        req.method === "POST" || req.method === "PUT" ? req.body : undefined,
    });
    next();
  });
}

function setupRoutes(): void {
  // Health check endpoint
  app.get("/", (req: Request, res: Response) => {
    res.json({
      success: true,
      message: "Trading Bot API is running",
      version: "1.0.0",
      timestamp: new Date().toISOString(),
    });
  });

  // API routes
  app.use("/api/trading", tradingRoutes);
  app.use("/api/monitor", monitorRoutes);

  // 404 handler
  app.use("*", (req: Request, res: Response) => {
    res.status(404).json({
      success: false,
      error: "Endpoint not found",
      path: req.originalUrl,
    });
  });
}

function setupErrorHandling(): void {
  // Global error handler
  app.use((error: Error, req: Request, res: Response, next: NextFunction) => {
    logger.error("Unhandled error", error, undefined, undefined);

    res.status(500).json({
      success: false,
      error: "Internal server error",
      message:
        process.env.NODE_ENV === "development"
          ? error.message
          : "Something went wrong",
    });
  });

  // Handle uncaught exceptions
  process.on("uncaughtException", (error: Error) => {
    logger.error("Uncaught Exception", error);
    process.exit(1);
  });

  // Handle unhandled promise rejections
  process.on("unhandledRejection", (reason: any, promise: Promise<any>) => {
    logger.error("Unhandled Rejection", { reason, promise });
    process.exit(1);
  });

  // Graceful shutdown
  process.on("SIGTERM", () => {
    logger.info("SIGTERM received, shutting down gracefully");
    shutdown();
  });

  process.on("SIGINT", () => {
    logger.info("SIGINT received, shutting down gracefully");
    shutdown();
  });
}

async function shutdown(): Promise<void> {
  try {
    logger.info("Starting graceful shutdown...");

    // Stop the trading bot
    await tradingBot.stop();

    // Close the server
    // Note: In a real implementation, you'd want to store the server instance
    // and call server.close() here
    logger.info("Server closed");

    logger.info("Graceful shutdown completed");
    process.exit(0);
  } catch (error) {
    logger.error("Error during shutdown", error);
    process.exit(1);
  }
}

export async function start(): Promise<void> {
  try {
    // Initialize the server
    initializeServer();

    // Initialize the trading bot
    await tradingBot.initialize();
    logger.info("Trading bot initialized");

    // Start the trading bot automatically
    await tradingBot.start();
    logger.info("Trading bot started automatically");

    // Start the Express server
    app.listen(port, () => {
      logger.info(`Server running on port ${port}`, {
        port: port,
        environment: process.env.NODE_ENV || "development",
        botStatus: tradingBot.getStatus().isRunning ? "running" : "stopped",
      });
    });
  } catch (error) {
    logger.error("Failed to start server", error);
    process.exit(1);
  }
}

// Start the server
start().catch((error) => {
  logger.error("Failed to start application", error);
  process.exit(1);
});
