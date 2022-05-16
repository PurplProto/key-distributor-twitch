import { readFileSync } from 'fs';
import { Client } from 'tmi.js';
import { OnDestroy } from './on-destroy';
import { Config, MessageDataItem } from './types';

export class MessageQueue extends OnDestroy {

  private users: MessageDataItem[];
  private keys: MessageDataItem[];

  constructor(
    private config: Config,
    private bot: Client,
  ) {
    super();
  }

  /**
   * sendWhispers
   */
  public sendWhispers() {
    const userKeyPair = this.users.map((user, i) => ({
      user,
      key: this.keys[ i ],
    }));

    userKeyPair.forEach(async (p) => {
      return new Promise<void>((resolve, _) => {
        const key = this.config.message.template.replace('<STEAM_KEY>', p.key.value);
        this.bot.whisper(p.user.value, key);
        setTimeout(() => {
          resolve();
        }, 1000 * 20);
      });
    });
  }

  /**
   * statusReport
   */
  public statusReport() {

  }

  public async loadFilesForMessages(): Promise<void> {
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

    const keys = parseFile(this.config.message.steamKeysFile);
    const validKeys = keys.filter(k => !k.used);
    const users = parseFile(this.config.message.userNamesFile);
    const validUsers = users.filter(u => !u.used);

    if (keys.length !== validKeys.length) {
      console.info('Some keys have already been used, these will be omitted from the pool.');
    }

    if (users.length !== validUsers.length) {
      console.info('Some users have already gotten a key, these will be omitted from the pool.');
    }

    if (validKeys.length < validUsers.length) {
      throw new Error('There are not enough keys for all the given users!');
    }

    this.keys = keys;
    this.users = users;

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

  protected destroy(): void {
    // Write file
  }
}
