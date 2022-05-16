import { ChatUserstate, Client, client, Options } from 'tmi.js';
import { BotAuth } from './bot-auth';
import { MessageQueue } from './message';
import { Config } from './types';

export class App {
  private message: MessageQueue;

  private bot: Client;
  private bearerToken: string;

  constructor(
    private config: Config,
    private botAuth: BotAuth,
  ) {
    this.message = new MessageQueue(
      config,
      this.bot,
    );
  }

  public async init() {
    console.info('Validating config');
    this.validateConfig();

    console.info('Loading users and keys files');
    await this.message.loadFilesForMessages();

    console.info('Authenticating the bot');
    this.bearerToken = await this.botAuth.getBearerToken();

    if (!this.bearerToken) {
      console.error('Bot was not authorised to access the provided account.');
      process.exit(1);
    }
  }

  public startBot() {
    // Cast our extended type to the restricted options the bot needs
    const botConfig: Options = this.config;
    (botConfig.identity || {}).password = this.bearerToken;

    console.info('Initialising the Twtich bot');
    // Create a client with our options
    this.bot = new client(botConfig);

    // Register our event handlers (defined below)
    this.bot.on('message', this.onMessageHandler);
    this.bot.on('connected', this.onConnectedHandler);

    // Connect to Twitch
    this.bot.connect();
  }

  /**
   * Ensure all required config options are set and are not `null` or `undefined`
   * @returns Error messages for all invalid config options
   */
  private validateConfig(): string[] {
    const errors: string[] = [];
    const hasvalue = (val: string) => !!val && val.length > 0;

    if (!this.config) {
      errors.push('The bot config is completely empty!');
      return errors;
    }

    const identity = this.config?.identity;
    if (identity) {
      if (!identity.callBackUrl) {
        errors.push('The bot config is missing the "identity.callBackUrl" value');
      }

      if (!identity.clientId) {
        errors.push('The bot config is missing the "identity.clientId" value');
      }

      if (!identity.scopes) {
        errors.push('The bot config is missing the "identity.scopes" value');
      }

      if (!identity.username) {
        errors.push('The bot config is missing the "identity.username" value');
      }
    } else {
      errors.push('The bot config is missing all identity information');
    }

    const channels = this.config?.channels;
    if (channels && channels.length > 0) {
      channels.forEach((v, index) => {
        if (!hasvalue(v)) {
          errors.push(`The channel value at position ${index + 1} appears to be invalid or empty`);
        }
      });
    } else {
      errors.push('The bot config is missing all channels information');
    }

    const message = this.config?.message;
    if (message) {
      if (!message.steamKeysFile && message.steamKeysFile.length > 0) {
        errors.push('The bot config is missing the "message.steamKeysFile" path');
      }

      if (!message.userNamesFile && message.userNamesFile.length > 0) {
        errors.push('The bot config is missing the "message.steamKeysFile" path');
      }
    } else {
      errors.push('The bot config is missing all message information');
    }

    return errors;
  }

  // Called every time a message comes in
  private onMessageHandler(channel: string, context: ChatUserstate, msg: string, self: boolean) {
    if (self) { return; } // Don't accept messages from self

    console.info(`[${context.username}] ${msg}`);

    // Trigger sending the messages
    if (msg.toLowerCase().startsWith('!spgsend')) {
      this.message.sendWhispers();
    }

    // Status report
    if (msg.toLowerCase().startsWith('!spgstatus')) {
      this.message.statusReport();
    }
  }

  // Called every time the bot connects to Twitch chat
  private onConnectedHandler(addr: string, port: number) {
    console.log(`Twitch bot successfully connected to ${addr}:${port}`);
  }
}
