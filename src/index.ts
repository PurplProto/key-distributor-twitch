import { randomBytes } from 'crypto';
import { createServer } from 'http';
import open from 'open';
import { ChatUserstate, Client, client, Options } from 'tmi.js';
import * as config from '../bot-config.json';
import { ParsedAuthResponse } from './types';

let bot: Client;

(async () => {
  const bearerToken = await getBearerToken();

  if (!bearerToken) {
    console.error('Bot was not authorised to access the provided account.');
    process.exit(1);
  }

  // Cast our extended type to the restricted options the bot needs
  const botConfig: Options = config;
  (botConfig.identity || {}).password = bearerToken;

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
    const authServer = createServer((req, res) => {
      const url = new URL(req.url || '', 'http://' + req.headers.host);

      if (url.pathname === '/') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.write(authDataParsePage);
        res.end();
        return;
      } else if (url.pathname === '/auth-token' && req.method === 'POST') {
        let bearerToken: string | null = null;

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

          bearerToken = parsedData.access_token;
          res.writeHead(200, { 'Content-Type': 'text/plain' });
          res.write('Authorisation successful, you may now close this page! 🙂');
        }

        res.end();
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

  console.info('New message: ', msg);

  // Do stuff with the chat message
  console.log('Sending pong');
  bot.say(channel, 'pong!');
}

// Called every time the bot connects to Twitch chat
function onConnectedHandler(addr: string, port: number) {
  console.log(`* Connected to ${addr}:${port}`);
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
