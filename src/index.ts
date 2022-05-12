import { randomBytes } from 'crypto';
import { readFileSync } from 'fs';
import { createServer } from 'http';
import open from 'open';
import { ChatUserstate, Client, client, Options } from 'tmi.js';
import * as config from '../bot-config.json';
import { MessageDataItem, ParsedAuthResponse } from './types';

let bot: Client;
let users: MessageDataItem[];
let keys: MessageDataItem[];

(async () => {
  console.warn(
    'Warning!',
    'The input files will be modified by this program.',
    'Keys and users that have been processed will be prefixed with a # symbol.',
    'Please ensure this is not the only copy of either file, if it is, please press CTRL + C NOW and provide a copy instead.',
  );

  console.info('Validating config');
  validateConfig();
  console.info('Loading users and keys files');
  await loadFilesForMessages();

  console.info('Authenticating the bot');
  const bearerToken = await getBearerToken();

  if (!bearerToken) {
    console.error('Bot was not authorised to access the provided account.');
    process.exit(1);
  }

  // Cast our extended type to the restricted options the bot needs
  const botConfig: Options = config;
  (botConfig.identity || {}).password = bearerToken;

  console.info('Initialising the Twtich bot');
  // Create a client with our options
  bot = new client(botConfig);

  // Register our event handlers (defined below)
  bot.on('message', onMessageHandler);
  bot.on('connected', onConnectedHandler);

  // Connect to Twitch
  bot.connect();
})();

async function getBearerToken(): Promise<string | null> {
  const twitchAuthUrl = new URL('https://id.twitch.tv/oauth2/authorize');
  const csrfToken = randomBytes(32).toString('hex');
  const urlParams = [
    `client_id=${config.identity.clientId}`,
    'force_verify=false',
    `redirect_uri=${config.identity.callBackUrl}`,
    'response_type=token',
    `scope=${encodeURIComponent(config.identity.scopes)}`,
    `state=${csrfToken}`,
  ];
  twitchAuthUrl.search = urlParams.join('&');

  const authCallbackResult = new Promise<string | null>((resolve, reject) => {
    console.info('Starting the auth callback server');
    const authServer = createServer((req, res) => {
      const url = new URL(req.url || '', 'http://' + req.headers.host);
      console.info(`Callback server request received: [${req.method}] ${url.toString()}`);

      if (url.pathname === '/') {
        console.info(`Sending the authdata parser page`);
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.write(authDataParsePage);
        res.end();
        return;
      } else if (url.pathname === '/auth-token' && req.method === 'POST') {
        let bearerToken: string | null = null;
        console.info(`Checking auth token`);

        // CSRF token mis-match
        if (url.searchParams.get('state') !== csrfToken) {
          bearerToken = null;

          res.writeHead(500, { 'Content-Type': 'text/plain' });
          [
            'Authorisation failed!',
            'CSRF Token mismatch! This could mean (but does not prove) that you may have been targeted by a remote attacker executing a CSRF',
          ].forEach(errorMessage => {
            res.write(errorMessage);
            console.error(errorMessage);
          });
          // Twitch auth API error
        } else if (!!url.searchParams.get('error')) {
          bearerToken = null;

          res.writeHead(400, { 'Content-Type': 'text/plain' });
          [
            'Authorisation failed!',
            'Error: ' + url.searchParams.get('error'),
            'Description: ' + url.searchParams.get('error_description'),
          ].forEach(errorMessage => {
            res.write(errorMessage);
            console.error(errorMessage);
          });
          // Success response?
        } else {
          const parsedData = url.search.substring(1).split('&').reduce(
            (acc, next) => {
              const kvp = next.split('=');
              acc[ kvp[ 0 ] as keyof ParsedAuthResponse ] = decodeURIComponent(kvp[ 1 ]);
              return acc;
            },
            {} as ParsedAuthResponse,
          );

          console.info(`Auth token looks good!`);
          bearerToken = parsedData.access_token;
          res.writeHead(200, { 'Content-Type': 'text/plain' });
          res.write('Authorisation successful, you may now close this page! 🙂');
        }

        res.end();
        console.info(`Stopping the callback server`);
        authServer.close();

        return resolve(bearerToken);
      }
    });

    const callbackUrl = new URL(config.identity.callBackUrl);
    authServer.listen(
      parseInt(callbackUrl.port, 10),
      callbackUrl.hostname,
    );
  });

  await open(twitchAuthUrl.toString(), { wait: false });

  return authCallbackResult;
}

// Called every time a message comes in
function onMessageHandler(channel: string, context: ChatUserstate, msg: string, self: boolean) {
  if (self) { return; } // Only accept messages from self

  console.info(`[${context.username}] ${msg}`);

  // Do stuff with the chat message
  console.log('Sending pong');
  bot.say(channel, 'pong!');
}

// Called every time the bot connects to Twitch chat
function onConnectedHandler(addr: string, port: number) {
  console.log(`Twitch bot successfully connected to ${addr}:${port}`);
}

const authDataParsePage = `
<!DOCTYPE html>
<html>

<head>
  <meta charset='utf-8'>
  <meta http-equiv='X-UA-Compatible' content='IE=edge'>
  <title>Auth token receievd - transfering to the bot!</title>
  <meta name='viewport' content='width=device-width, initial-scale=1'>
</head>

<body>
  <h1>Auth token receievd</h1>
  <p>
    Transfering token to the bot!
  </p>
  <p id="msg"></p>
  <p id="error"></p>
  <script>
    const url = new URL(window.location);
    const parsedAuthData = url.hash.substring(1).split('&').reduce((curr, next) => {
      const [key, val] = next.split('=');
      curr[key] = decodeURIComponent(val);
      return curr;
    }, {});

    fetch(
      url.origin + '/auth-token?' + url.hash.substring(1),
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/JSON',
        },
        body: JSON.stringify(parsedAuthData),
      }
    )
      .then(_ => document.getElementById('msg').innerText = 'Sucessfully sent auth token to the bot, you may now close this page')
      .catch(error => {
        document.getElementById('msg').innerText = 'Unable to send the auth token to the bot! 😢 pls tell the dev it borked.';
        document.getElementById('error').innerText = JSON.stringify(error, null, 2);
      });
  </script>
</body>

</html>
`;

/**
 * Ensure all required config options are set and are not `null` or `undefined`
 * @returns Error messages for all invalid config options
 */
function validateConfig(): string[] {
  const errors: string[] = [];
  const hasvalue = (val: string) => !!val && val.length > 0;

  if (!config) {
    errors.push('The bot config is completely empty!');
    return errors;
  }

  const identity = config?.identity;
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

  const channels = config?.channels;
  if (channels && channels.length > 0) {
    channels.forEach((v, index) => {
      if (!hasvalue(v)) {
        errors.push(`The channel value at position ${index + 1} appears to be invalid or empty`);
      }
    });
  } else {
    errors.push('The bot config is missing all channels information');
  }

  const message = config?.message;
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

async function loadFilesForMessages(): Promise<void> {
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

  users = parseFile(config.message.userNamesFile);
  keys = parseFile(config.message.steamKeysFile);

  console.info('Here are the first 5 usernames we parsed: ', users.slice(0, 5));
  console.info('Here are the first 5 keys we parsed: ', keys.slice(0, 5));
  console.info('If these don\'t look correct, please press CTRL + C immediately');

  return new Promise<void>((resolve, _) => {
    console.info('Bot continues to launch in 5 seconds');

    setTimeout(() => {
      resolve();
    }, 5000);
  });
}
