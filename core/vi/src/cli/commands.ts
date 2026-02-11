import { getLogger } from '../telemetry/logger.js';
import { NotImplementedByDesign } from '../errors/NotImplementedByDesign.js';

export async function handleChatCommand(args: string[]): Promise<void> {
  const logger = getLogger();

  if (args.length === 0) {
    logger.info('No input provided for chat command');
    console.log('Usage: vi chat [message]');
    return;
  }

  const message = args.join(' ');
  logger.info({ message }, 'CLI chat command boundary hit');

  throw new NotImplementedByDesign(
    'CLI chat interface not yet implemented',
    {
      phase: 'M9.1',
      reason: 'Requires HTTP client or in-process pipeline wiring',
      when: 'After M9 chat endpoint is verified',
      workaround: 'Use HTTP endpoint: curl -X POST http://localhost:3000/v1/chat -H "Content-Type: application/json" -d \'{"message":"' + message + '"}\'',
    }
  );
}

export async function handleAskCommand(args: string[]): Promise<void> {
  const logger = getLogger();

  if (args.length === 0) {
    logger.info('No input provided for ask command');
    console.log('Usage: vi ask [question]');
    return;
  }

  const question = args.join(' ');
  logger.info({ question }, 'CLI ask command boundary hit');

  throw new NotImplementedByDesign(
    'CLI ask interface not yet implemented',
    {
      phase: 'M9.1',
      reason: 'Requires HTTP client or in-process pipeline wiring',
      when: 'After M9 chat endpoint is verified',
      workaround: 'Use HTTP endpoint: curl -X POST http://localhost:3000/v1/chat -H "Content-Type: application/json" -d \'{"message":"' + question + '"}\'',
    }
  );
}

export async function handleDebugCommand(args: string[]): Promise<void> {
  const logger = getLogger();

  const subcommand = args[0] || 'info';
  logger.debug({ subcommand }, 'Debug command received');

  switch (subcommand) {
    case 'config': {
      console.log('Debug: Config');
      console.log('Note: Config inspection not yet implemented');
      break;
    }
    case 'telemetry': {
      console.log('Debug: Telemetry');
      console.log('Note: Telemetry inspection not yet implemented');
      break;
    }
    default: {
      console.log('Debug info:');
      console.log('  - Config inspection: vi debug config');
      console.log('  - Telemetry status: vi debug telemetry');
    }
  }
}

export async function handleHelpCommand(): Promise<void> {
  console.log(`Vi - Tentai Sovereign AI Runtime

Usage: vi [command] [options]

Commands:
  chat [message]     Start an interactive chat session
  ask [question]     Ask a single question
  debug [subcommand] Debug information
  help               Show this help message
  --version          Show version information

Examples:
  vi chat "Hello Vi, how are you?"
  vi ask "What is 2 + 2?"
  vi debug config

For more information, visit: https://github.com/tentai/vi`);
}

export async function handleVersionCommand(): Promise<void> {
  console.log('Vi version 0.1.0');
}
