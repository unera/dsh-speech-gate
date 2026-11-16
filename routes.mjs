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
  { path: `${BASE_PATH}/enabled`, methods: ['POST'] },
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
 * One row of the card's state: which recognizer it is, where its key lives and
 * whether it is any use right now.
 *
 * Every recognizer this package drives is a row — a local one too, because "no key
 * needed" is a fact the card has to say out loud instead of leaving a person
 * wondering where the key field went. A remote record has a name of its own, and a
 * `configured-model` record has the model connector behind it as well; the row says
 * which of the two holds the value (`keySource`), because the person's next step
 * differs: pasting a key here, or changing it in the model settings.
 * @param provider - one entry of `normalizeConfig(...).providers`.
 * @param credentials - the credentials service, or null.
 * @param options - `configured` (a function that answers whether the record really
 *   works, so a key from the environment or a file counts too).
 * @returns the state row, or null for a record this card cannot draw.
 */
export async function stateRow(provider, credentials, options = {}) {
  if (provider === null || typeof provider !== 'object') return null;
  const local = provider.local === true;
  if (!local && provider.backend !== 'api') return null;
  const own = typeof provider.apiKeyRef === 'string' && provider.apiKeyRef !== '' ? provider.apiKeyRef : null;
  const connector = typeof provider.connectorApiKeyRef === 'string' && provider.connectorApiKeyRef !== ''
    ? provider.connectorApiKeyRef
    : null;
  // Own first: a value typed into this card is the one the recognizer uses, so it
  // is also the one that decides what the row says.
  const ownPresent = await refPresent(own, credentials);
  const connectorPresent = ownPresent ? false : await refPresent(connector, credentials);
  const keyPresent = ownPresent || connectorPresent;
  return {
    id: String(provider.id),
    name: typeof provider.displayName === 'string' && provider.displayName.trim() !== ''
      ? provider.displayName
      : String(provider.id),
    // The upstream service (`yandex`, `openai`, ...): the card points at the right
    // console from this, not from a guess about the id.
    provider: typeof provider.provider === 'string' ? provider.provider : null,
    // Runs on this machine: no key, no key field, only a line saying so.
    local,
    // The card's own switch, as the profile has it.
    enabled: provider.enabled !== false,
    // Is this recognizer any use right now? The gate registers exactly these.
    configured: typeof options.configured === 'function'
      ? (await options.configured(provider)) === true
      : local || keyPresent,
    // Why it stands where it stands, when the gate can say (`no-key`,
    // `no-connector`, `disabled`, …): the card prints that reason instead of
    // reading "no key" into every record it does not offer.
    reason: typeof options.reasonOf === 'function'
      ? (options.reasonOf(provider) ?? null)
      : null,
    // The name this record's own value belongs to — null for a local one, which
    // never gets a name at all.
    apiKeyRef: own,
    // The connector's credential, when this record may fall back to it.
    connectorRef: connector,
    keyPresent,
    keySource: ownPresent ? 'own' : connectorPresent ? 'connector' : null,
  };
}

/**
 * The state the card draws: one row per recognizer, in configuration order.
 * @param providers - `normalizeConfig(...).providers`.
 * @param credentials - the credentials service, or null.
 * @param options - see `stateRow`.
 * @returns `{ providers: [...] }`, in configuration order.
 */
export async function stateOf(providers, credentials, options = {}) {
  const rows = [];
  for (const provider of Array.isArray(providers) ? providers : []) {
    const row = await stateRow(provider, credentials, options);
    if (row !== null) rows.push(row);
  }
  return { providers: rows };
}

/**
 * The credential names the configured records own.
 *
 * A grammar-valid name is not a name that belongs to us: `OPENAI_API_KEY` is the
 * model connector's, and `POST /credential` writing there would let the card plant
 * a value for a service this package only reads. So the write is checked against
 * this list — one entry per record, the `apiKeyRef` each of them works with.
 * @param providers - the configured records, as `/state` draws them.
 * @returns the set of names this package may write under.
 */
export function ownRefsOf(providers) {
  const refs = new Set();
  for (const provider of Array.isArray(providers) ? providers : []) {
    const ref = provider?.apiKeyRef;
    if (typeof ref === 'string' && ref !== '') refs.add(ref);
  }
  return refs;
}

/**
 * Turn an untrusted body into the reference and the value it carries.
 *
 * The value is trimmed and never logged, never echoed and never kept here: it is
 * handed to `credentials.set()` and forgotten. The reference is checked against
 * the store's own grammar before it gets there — a card sending something else is
 * a mistake, not a key. Grammar is all this function answers; whether the name
 * belongs to one of our records is the handler's question (`ownRefsOf`).
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

/**
 * Turn an untrusted body into the switch the card flipped.
 *
 * Only the id and the boolean travel: the record itself stays where it lives, in
 * the profile and in the gate's own memory.
 * @param body - parsed request body.
 * @returns the id and the new state.
 */
export function enabledFrom(body) {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    throw badRequest('тело запроса должно быть JSON-объектом');
  }
  const id = typeof body.id === 'string' ? body.id.trim() : '';
  if (id === '') throw badRequest(`id должен быть непустой строкой, получено ${JSON.stringify(body.id)}`);
  if (typeof body.enabled !== 'boolean') {
    throw badRequest(`enabled должен быть true или false, получено ${JSON.stringify(body.enabled)}`);
  }
  return { id, enabled: body.enabled };
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
 *   function when the service may mount later, as it does on a live Host — and
 *   `gate` keeps the Host's roster in step with the card's switch.
 * @returns a fetch-shaped function.
 */
export function createHandler(providers, options = {}) {
  const warn = options.warn ?? (() => {});
  const log = options.log ?? warn;
  // The credentials service may mount after this handler is built, so a getter is
  // read at use time: the same seam the provider resolves its key through.
  const credentialsOf = () => (typeof options.credentials === 'function' ? options.credentials() : options.credentials ?? null);
  // The gate holds the live state of a record — the switch may have moved since
  // the config was read — so a row is drawn from the gate when there is one.
  const gateOf = () => options.gate ?? null;
  const listOf = async () => {
    const list = typeof providers === 'function' ? await providers() : providers;
    const gate = gateOf();
    if (typeof gate?.record !== 'function') return list;
    return (Array.isArray(list) ? list : []).map((provider) => gate.record(provider?.id) ?? provider);
  };
  // Whether a record is really configured is the gate's answer when there is one,
  // because a key may come from the environment or a file and not only from the
  // store; without a gate `stateRow` falls back to the store alone.
  const configuredOf = (gate) => (typeof gate?.isConfigured === 'function'
    ? (provider) => gate.isConfigured(provider?.id)
    : undefined);
  // The same answer for "why": the gate already recorded the reason word of its
  // last settle, so the card does not have to guess it from "no key".
  const reasonOf = (gate) => (typeof gate?.reasonOf === 'function'
    ? (provider) => gate.reasonOf(provider?.id)
    : undefined);

  return async function handle(request) {
    let pathname = '';
    let method = '';
    try {
      const url = new URL(request.url, 'http://localhost');
      pathname = url.pathname;
      method = String(request.method ?? 'GET').toUpperCase();
      if (pathname === `${BASE_PATH}/state` && method === 'GET') {
        const gate = gateOf();
        return json(200, await stateOf(await listOf(), credentialsOf(), {
          configured: configuredOf(gate),
          reasonOf: reasonOf(gate),
        }));
      }
      if (pathname === `${BASE_PATH}/credential` && method === 'POST') {
        const { ref, value } = credentialFrom(await bodyOf(request));
        // The grammar says the name is a name; it does not say the name is ours.
        // `OPENAI_API_KEY` is the model connector's, and writing under it would
        // plant a value for a service this package only reads — so only a name one
        // of our own records works with is written. 403, not 400: the request is
        // well formed, it just asks for somebody else's secret.
        if (!ownRefsOf(await listOf()).has(ref)) {
          throw refusal(403, 'unknown_ref', `ref ${ref} не принадлежит ни одному распознавателю этой карточки`);
        }
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
        // A key is what makes a remote recognizer usable, so the roster is brought
        // in line right away: else the person would have to restart the Host for
        // the recognizer to appear in the picker.
        await gateOf()?.refreshAll?.();
        return json(200, { ok: true, ref, present: await refPresent(ref, credentials) });
      }
      if (pathname === `${BASE_PATH}/enabled` && method === 'POST') {
        const { id, enabled } = enabledFrom(await bodyOf(request));
        const gate = gateOf();
        if (typeof gate?.setEnabled !== 'function') {
          throw refusal(503, 'gate_unavailable', 'служба распознавания недоступна: переключатель некуда применить');
        }
        const outcome = await gate.setEnabled(id, enabled);
        if (outcome === null) {
          throw refusal(404, 'unknown_provider', `нет такого распознавателя: ${id}`);
        }
        // The fact, never the value: this line is a log for the operator.
        log(`распознаватель ${id}: ${enabled ? 'включён' : 'выключен'}, регистрация ${outcome.outcome}`);
        return json(200, {
          ok: true,
          id,
          enabled: outcome.enabled,
          registered: outcome.registered,
          // Why it is not registered, when it was asked to be: `no-key`,
          // `no-connector`, … — the card says the reason instead of "провайдер
          // выключен", which would be a lie about the person's own switch.
          reason: outcome.reason ?? null,
          saved: outcome.saved,
        });
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
    // The switch and the roster live in one object: flipping it withdraws the
    // registration right away instead of waiting for a restart.
    gate: options.gate,
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
