// The speech gate card's own HTTP channel.
//
// The card does not write the credentials store itself and cannot: the store is a
// Host service, and the browser half only knows the names the state handed it. So
// the routes are two calls — "what is configured and which names have values" and
// "store this value under that name" — riding the Host's authenticated `/api`
// channel (`connection.fetch`), the same way dsh-text-to-speech and dsh-nodes mount
// theirs. A bare path on the web server would answer the whole internet.
//
// The key is the one thing that does not travel back. It goes straight into the
// credentials store — the very seam `resolveApiKey()` in `index.mjs` resolves
// through — and only its reference and its presence are ever answered.

/** A credential reference: a POSIX-style name, upper case, as the store stores it. */
export const CREDENTIAL_REF_PATTERN = /^[A-Z][A-Z0-9_]{2,63}$/

export const BASE_PATH = '/api/speech-gate'

/** One row per route: mounting and the tests walk this same list. */
export const ROUTES = Object.freeze([
  { path: `${BASE_PATH}/state`, methods: ['GET'] },
  { path: `${BASE_PATH}/credential`, methods: ['POST'] },
])

const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }

const json = (status, body) => new Response(JSON.stringify(body), { status, headers: JSON_HEADERS })

/** A request the card sent wrong: its own message, its own status. */
function badRequest(message) {
  const error = new TypeError(message);
  error.code = 'speech-gate-http';
  return error;
}

/**
 * A refusal with a status and a machine-readable code of its own.
 * @param status - the HTTP status to answer with.
 * @param code - the code the card reads.
 * @param message - what to tell the person.
 * @returns the error to throw.
 */
function refusal(status, code, message) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  return error;
}

/**
 * Read a service through the registry, never through the property.
 *
 * `cordis` throws on a property this plugin did not declare in `inject`
 * ("cannot get property \"credentials\" without inject"), which is why
 * `resolveApiKey()` asks `ctx.get('credentials')` too. Same way in, same answer.
 * @param ctx - plugin context.
 * @param name - the service name.
 * @returns the service, or null when this Host has none.
 */
export function readService(ctx, name) {
  try {
    return ctx?.get?.(name) ?? null;
  } catch {
    return null;
  }
}

/**
 * Whether the store holds a non-empty value under this reference.
 *
 * A missing store, a store without `resolve()` and a reference the store refuses
 * all read as "no key": the card draws a state, it does not report an outage.
 * @param ref - the credential name.
 * @param credentials - the credentials service, or null.
 * @returns true only when a non-empty value came back.
 */
export async function refPresent(ref, credentials) {
  if (typeof ref !== 'string' || ref === '') return false;
  if (typeof credentials?.resolve !== 'function') return false;
  try {
    const resolved = await credentials.resolve(ref);
    return typeof resolved?.value === 'string' && resolved.value.trim() !== '';
  } catch {
    return false;
  }
}

/**
 * One row of the card's state: which recognizer it is and where its key lives.
 *
 * Every record that talks to a speech API has a name of its own, and a
 * `configured-model` record has the model connector behind it as well. The row
 * says which of the two holds the value (`keySource`), because the person's next
 * step differs: pasting a key here, or changing it in the model settings. A record
 * that takes no key — a local command — produces no row.
 * @param provider - one entry of `normalizeConfig(...).providers`.
 * @param credentials - the credentials service, or null.
 * @returns the state row, or null when this record takes no key.
 */
export async function stateRow(provider, credentials) {
  if (provider?.backend !== 'api') return null;
  const own = typeof provider.apiKeyRef === 'string' && provider.apiKeyRef !== '' ? provider.apiKeyRef : null;
  const connector = typeof provider.connectorApiKeyRef === 'string' && provider.connectorApiKeyRef !== ''
    ? provider.connectorApiKeyRef
    : null;
  if (own === null && connector === null) return null;
  // Own first: a value typed into this card is the one the recognizer uses, so it
  // is also the one that decides what the row says.
  const ownPresent = await refPresent(own, credentials);
  const connectorPresent = ownPresent ? false : await refPresent(connector, credentials);
  return {
    id: String(provider.id),
    name: typeof provider.displayName === 'string' && provider.displayName.trim() !== ''
      ? provider.displayName
      : String(provider.id),
    // The upstream service (`yandex`, `openai`, ...): the card points at the right
    // console from this, not from a guess about the id.
    provider: typeof provider.provider === 'string' ? provider.provider : null,
    // The name this record's own value belongs to — always set once the profile
    // has been read, since a name is generated for every API record.
    apiKeyRef: own,
    // The connector's credential, when this record may fall back to it.
    connectorRef: connector,
    keyPresent: ownPresent || connectorPresent,
    keySource: ownPresent ? 'own' : connectorPresent ? 'connector' : null,
  };
}

/**
 * The state the card draws: one row per recognizer that takes a key.
 * @param providers - `normalizeConfig(...).providers`.
 * @param credentials - the credentials service, or null.
 * @returns `{ providers: [...] }`, in configuration order.
 */
export async function stateOf(providers, credentials) {
  const rows = [];
  for (const provider of Array.isArray(providers) ? providers : []) {
    const row = await stateRow(provider, credentials);
    if (row !== null) rows.push(row);
  }
  return { providers: rows };
}

/**
 * Turn an untrusted body into the reference and the value it carries.
 *
 * The value is trimmed and never logged, never echoed and never kept here: it is
 * handed to `credentials.set()` and forgotten. The reference is checked against
 * the store's own grammar before it gets there — a card sending something else is
 * a mistake, not a key.
 *
 * The name is passed on as a plain string rather than a branded `credentialRef`:
 * this package carries no runtime dependency on the credentials package, and the
 * store accepts the string. The pattern above is that package's own, narrowed.
 * @param body - parsed request body.
 * @returns the reference and the possibly empty secret.
 */
export function credentialFrom(body) {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    throw badRequest('тело запроса должно быть JSON-объектом');
  }
  const ref = body.ref;
  if (typeof ref !== 'string' || !CREDENTIAL_REF_PATTERN.test(ref)) {
    throw badRequest(`ref должен быть именем ключа в хранилище (${String(CREDENTIAL_REF_PATTERN)}), получено ${JSON.stringify(ref)}`);
  }
  if (body.value !== undefined && typeof body.value !== 'string') {
    throw badRequest('value должно быть строкой');
  }
  return { ref, value: typeof body.value === 'string' ? body.value.trim() : '' };
}

/** The HTTP status for a thrown error. */
export function statusOf(error) {
  if (Number.isInteger(error?.status)) return error.status;
  if (error?.code === 'speech-gate-http') return 400;
  return 500;
}

/**
 * Parse a JSON body, or say that it is not JSON.
 * @param request - the incoming request.
 * @returns the parsed body, `{}` for an empty one.
 */
async function bodyOf(request) {
  const text = await request.text();
  try {
    return text === '' ? {} : JSON.parse(text);
  } catch {
    throw badRequest('тело запроса не разбирается как JSON');
  }
}

/**
 * The request handler, with the provider list and the credentials seam as
 * dependencies.
 *
 * Split from the mounting so a test drives it with a fake Request and a fake
 * store, without a Host and without a connection service.
 * @param providers - the configured recognizers (a function when they are read
 *   lazily), already carrying the `apiKeyRef` each of them works with.
 * @param options - `warn` receives request failures, `log` the fact of a saved
 *   key (never the key), `credentials` returns the credentials service — a
 *   function when the service may mount later, as it does on a live Host.
 * @returns a fetch-shaped function.
 */
export function createHandler(providers, options = {}) {
  const warn = options.warn ?? (() => {});
  const log = options.log ?? warn;
  // The credentials service may mount after this handler is built, so a getter is
  // read at use time: the same seam the provider resolves its key through.
  const credentialsOf = () => (typeof options.credentials === 'function' ? options.credentials() : options.credentials ?? null);
  const listOf = async () => (typeof providers === 'function' ? await providers() : providers);

  return async function handle(request) {
    let pathname = '';
    let method = '';
    try {
      const url = new URL(request.url, 'http://localhost');
      pathname = url.pathname;
      method = String(request.method ?? 'GET').toUpperCase();
      if (pathname === `${BASE_PATH}/state` && method === 'GET') {
        return json(200, await stateOf(await listOf(), credentialsOf()));
      }
      if (pathname === `${BASE_PATH}/credential` && method === 'POST') {
        const { ref, value } = credentialFrom(await bodyOf(request));
        const credentials = credentialsOf();
        // An empty field is the card sending the form as it stands — usually
        // because a stored key is never drawn back into the field. Two different
        // answers hide behind it: there is a key to leave alone, or there is
        // nothing to keep and the person has to type something.
        if (value === '') {
          if (!(await refPresent(ref, credentials))) {
            throw refusal(400, 'empty_value', 'значение ключа пустое: сохранять нечего — ключа в хранилище ещё нет');
          }
          // The reference and the fact, never the value: this line is a log.
          log(`credential ${ref}: значение не пришло, ключ не изменён`);
          return json(200, { ok: true, ref, present: true, unchanged: true });
        }
        if (typeof credentials?.set !== 'function') {
          throw refusal(503, 'credentials_unavailable', `служба учётных данных недоступна: ключ ${ref} сохранить некуда`);
        }
        try {
          await credentials.set(ref, value);
        } catch (error) {
          // The store may throw a sentence of its own (a read-only layer, a bad
          // reference); the card shows it as text and never sees the value back.
          throw refusal(503, 'credentials_unavailable', `служба учётных данных отказала на ${ref}: ${error?.message ?? error}`);
        }
        // The reference and the fact, never the value: this line is a log.
        log(`credential ${ref}: сохранён`);
        return json(200, { ok: true, ref, present: await refPresent(ref, credentials) });
      }
      return json(404, { code: 'not-found', error: `нет такого маршрута: ${method} ${pathname}` });
    } catch (error) {
      const status = statusOf(error);
      const code = typeof error?.code === 'string' && error.code !== '' && !error.code.startsWith('speech-gate-')
        ? error.code
        : (status === 400 ? 'bad-request' : 'failed');
      warn(`${method} ${pathname} → ${status}: ${error?.message ?? error}`);
      return json(status, { code, error: String(error?.message ?? error) });
    }
  };
}

/**
 * Read the connection service without declaring it.
 *
 * `cordis` refuses the property itself when the plugin did not declare it, so the
 * direct read is wrapped and `inject` stays the way in.
 * @param ctx - plugin context.
 * @returns the service, or null.
 */
function readConnection(ctx) {
  try {
    return ctx?.connection ?? null;
  } catch {
    return null;
  }
}

/**
 * Mount the routes on a Host.
 *
 * `connection` is read from the context when it is already there and through
 * `inject` otherwise, because the plugin mounts while the session services are
 * still arriving.
 * @param ctx - plugin context.
 * @param providers - the configured recognizers, or a function returning them.
 * @param options - `warn`, `log`, `credentials` (see `createHandler`).
 * @returns a disposer, or a no-op when this Host has no connection service.
 */
export function mountRoutes(ctx, providers, options = {}) {
  const warn = options.warn ?? ((message) => console.warn(`[dsh-speech-gate] ${message}`));
  const log = options.log ?? ((message) => console.info(`[dsh-speech-gate] ${message}`));
  const handle = createHandler(providers, {
    warn,
    log,
    // Read at use time: the credentials service mounts after this handler does,
    // and it is the very service the keyed provider resolves its key through.
    credentials: options.credentials ?? (() => readService(ctx, 'credentials')),
  });

  const install = (connection) => {
    if (typeof connection?.fetch?.register !== 'function') {
      warn('connection не умеет fetch.register: карточка распознавания речи останется без сервера');
      return () => {};
    }
    const disposers = [];
    for (const route of ROUTES) {
      try {
        disposers.push(connection.fetch.register({
          path: route.path,
          methods: route.methods,
          requestBody: 'buffered',
          fetch: handle,
        }));
      } catch (error) {
        warn(`маршрут ${route.methods.join('/')} ${route.path} не встал: ${error?.message ?? error}`);
      }
    }
    return () => {
      for (const dispose of disposers) {
        try { dispose?.(); } catch { /* уже снят */ }
      }
    };
  };

  const direct = readConnection(ctx);
  if (direct !== null && typeof direct?.fetch?.register === 'function') {
    const dispose = install(direct);
    // Registered as an effect so unloading the plugin takes the routes with it;
    // mounted outside one because the route has to be there when the page asks.
    ctx.effect?.(() => dispose, 'dsh-speech-gate: маршруты карточки');
    return dispose;
  }

  if (typeof ctx?.inject !== 'function') {
    warn('нет ни connection, ни inject: карточка распознавания речи останется без сервера');
    return () => {};
  }

  let dispose = () => {};
  ctx.inject(['connection'], (child) => {
    const connection = child?.connection ?? child?.get?.('connection') ?? null;
    dispose = install(connection);
    child?.effect?.(() => dispose, 'dsh-speech-gate: маршруты карточки');
  });
  return () => dispose();
}
