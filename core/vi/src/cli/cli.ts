#!/usr/bin/env node

import { loadConfig } from '../config/config.js';
import { initializeLogger } from '../telemetry/logger.js';
import { initializeTelemetry } from '../telemetry/telemetry.js';
import {
  handleChatCommand,
  handleAskCommand,
  handleDebugCommand,
  handleHelpCommand,
  handleVersionCommand,
} from './commands.js';

async function main(): Promise<void> {
  const config = loadConfig();
  initializeLogger(config.logging.level);
  initializeTelemetry(config.telemetry.path, config.telemetry.enabled);

  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === 'help' || args[0] === '--help' || args[0] === '-h') {
    await handleHelpCommand();
    process.exit(0);
  }

  if (args[0] === '--version' || args[0] === '-v') {
    await handleVersionCommand();
    process.exit(0);
  }

  try {
    switch (args[0]) {
      case 'chat': {
        await handleChatCommand(args.slice(1));
        break;
      }
      case 'ask': {
        await handleAskCommand(args.slice(1));
        break;
      }
      case 'debug': {
        await handleDebugCommand(args.slice(1));
        break;
      }
      default: {
        console.error(`Unknown command: ${args[0]}`);
        console.error('Run "vi --help" for usage information');
        process.exit(1);
      }
    }
  } catch (error) {
    console.error('Fatal error:', error);
    process.exit(1);
  }
}

main();
