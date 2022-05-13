import { readFileSync } from 'fs';
import { ChatUserstate, Client, client, Options } from 'tmi.js';
import { BotAuth } from './bot-auth';
import { Config, MessageDataItem } from './types';

export class App {
  private bot: Client;
  private bearerToken: string;
  private users: MessageDataItem[];
  private keys: MessageDataItem[];

  constructor(
    private config: Config,
    private botAuth: BotAuth,
  ) { }

  public async init() {
    console.info('Validating config');
    this.validateConfig();

    console.info('Loading users and keys files');
    await this.loadFilesForMessages();

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
    if (self) { return; } // Only accept messages from self

    console.info(`[${context.username}] ${msg}`);

    // Do stuff with the chat message
    console.log('Sending pong');
    this.bot.say(channel, 'pong!');
  }

  // Called every time the bot connects to Twitch chat
  private onConnectedHandler(addr: string, port: number) {
    console.log(`Twitch bot successfully connected to ${addr}:${port}`);
  }

  private async loadFilesForMessages(): Promise<void> {
    const parseFile = (filePath: string): MessageDataItem[] => {
      try {
        const file = readFileSync(filePath, { encoding: 'utf-8', flag: 'r' });
        return file.split('\n').map<MessageDataItem>(v => ({
          value: v.startsWith('#') ? v.substring(1) : v,
          used: v.startsWith('#'),
        })).filter(v => !!v.value);
      } catch (error: unknown) {
        const err = error as Error & { code: string; };

        console.error(`Failed to parse the given file: "${filePath}"`);

        if (err.code && err.code === 'ENOENT') {
          console.error('The file does not appear to exist!');
        } else {
          console.error(
            'The following error message might give you a clue about what went wrong: ',
            JSON.stringify(err, null, 2)
          );
        }

        process.exit(1);
      }
    };

    this.users = parseFile(this.config.message.userNamesFile);
    this.keys = parseFile(this.config.message.steamKeysFile);

    console.info('Here are the first 5 usernames we parsed: ', this.users.slice(0, 5));
    console.info('Here are the first 5 keys we parsed: ', this.keys.slice(0, 5));
    console.info('If these don\'t look correct, please press CTRL + C immediately');

    return new Promise<void>((resolve, _) => {
      console.info('Bot continues to launch in 5 seconds');

      setTimeout(() => {
        resolve();
      }, 5000);
    });
  }
}
