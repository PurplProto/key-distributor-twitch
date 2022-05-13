import config from '../bot-config.json';
import { App } from './app';
import { BotAuth } from './bot-auth';

/**
 * Bootstrap and start the app
 */
(async () => {
  console.warn(
    'Warning!',
    'The input files will be modified by this program.',
    'Keys and users that have been processed will be prefixed with a # symbol.',
    'Please ensure this is not the only copy of either file, if it is, please press CTRL + C NOW and provide a copy instead.',
  );

  const bot = new App(
    config,
    new BotAuth(config),
  );

  bot.init();
  bot.startBot();
})();
