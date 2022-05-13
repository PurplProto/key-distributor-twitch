import { randomBytes } from 'crypto';
import { createServer, IncomingMessage, ServerResponse } from 'http';
import open from 'open';
import { Config, ParsedAuthResponse } from './types';

type RequestContext = {
  req: IncomingMessage;
  res: ServerResponse;
  url: URL;
  tokenFulfilled: (value: string | PromiseLike<string>) => void;
};

export class BotAuth {
  /**
   * This token should be use on a unique request
   */
  private readonly csrfToken: string;

  constructor(private botConfig: Config) {
    this.csrfToken = randomBytes(32).toString('hex');
  }

  public async getBearerToken(): Promise<string> {
    const authCallbackResult = new Promise<string>((resolve, _) => {
      console.info('Starting the auth callback server');

      const authServer = createServer((req, res) => {
        const tokenFulfilled = (value: string | PromiseLike<string>) => {
          // Once we have the bearer token, close the callback server and return the token
          console.info(`Stopping the callback server`);
          authServer.close();
          return resolve(value);
        };

        // Build the URL of the incomming request
        const url = new URL(req.url || '', 'http://' + req.headers.host);
        this.handleRequest({ req, res, url, tokenFulfilled });
      });

      // This is the URL our callback server will listen on
      // By default that URL is: http://localhost:4827
      const callbackUrl = new URL(this.botConfig.identity.callBackUrl);
      authServer.listen(
        parseInt(callbackUrl.port, 10),
        callbackUrl.hostname,
      );
    });

    // Open the auth page in the user's prefered browser
    const twitchAuthUrl = this.buildTwitchAuthURL();
    await open(twitchAuthUrl.toString(), { wait: false });

    // Resolved by the `tokenFulfilled` function
    return authCallbackResult;
  }

  private handleRequest(ctx: RequestContext) {
    console.info(`Callback server request received: [${ctx.req.method}] ${ctx.url.toString()}`);

    if (ctx.url.pathname === '/') {
      return this.handleDefaultRoute(ctx);
    } else if (ctx.url.pathname === '/auth-token' && ctx.req.method === 'POST') {
      return this.handleAuthTokenRoute(ctx);
    } else {
      return this.handleUnkownRequest(ctx);
    }
  }

  private handleUnkownRequest(ctx: RequestContext) {
    ctx.res.writeHead(404, { 'Content-Type': 'text/plain' });
    ctx.res.write(notFoundPage);
    ctx.res.end();
  }

  private handleAuthTokenRoute(ctx: RequestContext) {
    let bearerToken: string;
    console.info(`Checking auth token`);

    // CSRF token mis-match
    if (ctx.url.searchParams.get('state') !== this.csrfToken) {
      ctx.res.writeHead(500, { 'Content-Type': 'text/plain' });
      [
        'Authorisation failed!',
        'CSRF Token mismatch! This could mean (but does not prove) that you may have been targeted by a remote attacker executing a CSRF',
      ].forEach(errorMessage => {
        ctx.res.write(errorMessage);
        console.error(errorMessage);
      });
      throw new Error('CSRF token mismatch detected, authentication token cannot be used.');
      // Twitch auth API error
    } else if (!!ctx.url.searchParams.get('error')) {
      ctx.res.writeHead(400, { 'Content-Type': 'text/plain' });
      [
        'Authorisation failed!',
        'Error: ' + ctx.url.searchParams.get('error'),
        'Description: ' + ctx.url.searchParams.get('error_description'),
      ].forEach(errorMessage => {
        ctx.res.write(errorMessage);
        console.error(errorMessage);
      });
      throw new Error('The bot was not authorised to access the account, cannot continue.');
      // Success response?
    } else {
      const parsedUrlParams = ctx.url.search
        .substring(1) // Remove the leading '?'
        .split('&') // Split each key value pair
        .reduce(
          (acc, next) => {
            const [ key, value ] = next.split('='); // Split the key and value
            acc[ key as keyof ParsedAuthResponse ] = decodeURIComponent(value); // Decode the value and assign it to the result object
            return acc;
          },
          {} as ParsedAuthResponse
        );

      console.info(`Auth token looks good!`);
      bearerToken = parsedUrlParams.access_token;
      ctx.res.writeHead(200, { 'Content-Type': 'text/plain' });
      ctx.res.write('Authorisation successful, you may now close this page! 🙂');
    }

    ctx.res.end();

    return ctx.tokenFulfilled(bearerToken);
  }

  private handleDefaultRoute(ctx: RequestContext) {
    console.info(`Sending the authdata parser page`);
    ctx.res.writeHead(200, { 'Content-Type': 'text/html' });
    ctx.res.write(authDataParsePage);
    ctx.res.end();
  }

  private buildTwitchAuthURL() {
    const twitchAuthUrl = new URL('https://id.twitch.tv/oauth2/authorize');
    const urlParams = [
      `client_id=${this.botConfig.identity.clientId}`,
      'force_verify=false',
      `redirect_uri=${this.botConfig.identity.callBackUrl}`,
      'response_type=token',
      `scope=${encodeURIComponent(this.botConfig.identity.scopes)}`,
      `state=${this.csrfToken}`,
    ];
    twitchAuthUrl.search = urlParams.join('&');
    return twitchAuthUrl;
  }
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

const notFoundPage = `
<!DOCTYPE html>
<html>

<head>
  <meta charset='utf-8'>
  <meta http-equiv='X-UA-Compatible' content='IE=edge'>
  <title>Error 404 - Not Found</title>
  <meta name='viewport' content='width=device-width, initial-scale=1'>
</head>

<body>
  <h1>Error 404 - Not Found</h1>
  <p>
    Not sure how you ended up here, but I've got nothing for you. Sorry 😞.
    But have a random cat!
    <img src="https://cataas.com/cat" width="600" height="600" />
  </p>
</body>

</html>
`;
