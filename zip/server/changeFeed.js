const FEED_VERSION = 1;
const RETENTION_MS = 24 * 60 * 60 * 1000;
const MAX_BATCH_SIZE = 100;

function createChangeFeedService(syncDbRoot) {
  const feeds = new Map();

  const readFeed = (businessCode) => {
    if (!feeds.has(businessCode)) {
      feeds.set(businessCode, {
        version: FEED_VERSION,
        lastSeq: 0,
        purgedThrough: 0,
        lastPurgeDay: "",
        changes: [],
      });
    }
    return feeds.get(businessCode);
  };

  const purgeExpired = (feed, now = Date.now()) => {
    const purgeDay = new Date(now).toISOString().slice(0, 10);
    if (feed.lastPurgeDay === purgeDay) return false;

    const expiration = now - RETENTION_MS;
    while (
      feed.changes.length &&
      Date.parse(feed.changes[0].receivedAt) < expiration
    ) {
      const expired = feed.changes.shift();
      feed.purgedThrough = Math.max(feed.purgedThrough, expired.seq);
    }
    feed.lastPurgeDay = purgeDay;
    return true;
  };

  const getChanges = (businessCode, { since, limit, now } = {}) => {
    const feed = readFeed(businessCode);
    purgeExpired(feed, now);

    if (since === "latest") {
      return {
        changes: [],
        nextCursor: feed.lastSeq,
        latestSeq: feed.lastSeq,
        oldestSeq: feed.changes[0]?.seq ?? feed.lastSeq + 1,
        purgedThrough: feed.purgedThrough,
      };
    }

    const cursor = Number(since ?? 0);
    if (!Number.isSafeInteger(cursor) || cursor < 0) {
      const error = new Error("The sync cursor must be a non-negative integer.");
      error.status = 400;
      throw error;
    }
    if (cursor < feed.purgedThrough) {
      const error = new Error(
        "The device has been offline beyond the 24-hour sync retention window. Import a current export, then reconnect sync.",
      );
      error.status = 410;
      error.code = "sync_window_expired";
      throw error;
    }

    const pageSize = Math.max(
      1,
      Math.min(Number(limit) || MAX_BATCH_SIZE, MAX_BATCH_SIZE),
    );
    const changes = feed.changes
      .filter((change) => change.seq > cursor)
      .slice(0, pageSize);
    return {
      changes,
      nextCursor: changes.length
        ? changes[changes.length - 1].seq
        : feed.lastSeq,
      latestSeq: feed.lastSeq,
      oldestSeq: feed.changes[0]?.seq ?? feed.lastSeq + 1,
      purgedThrough: feed.purgedThrough,
    };
  };

  const appendChanges = (businessCode, { deviceId, changes, now } = {}) => {
    if (
      typeof deviceId !== "string" ||
      deviceId.length < 1 ||
      deviceId.length > 128
    ) {
      const error = new Error("A valid device ID is required.");
      error.status = 400;
      throw error;
    }
    if (
      !Array.isArray(changes) ||
      changes.length < 1 ||
      changes.length > MAX_BATCH_SIZE
    ) {
      const error = new Error(
        `Submit between 1 and ${MAX_BATCH_SIZE} changes per request.`,
      );
      error.status = 400;
      throw error;
    }

    const feed = readFeed(businessCode);
    purgeExpired(feed, now);
    const latestById = new Map();
    for (const existing of feed.changes) {
      latestById.set(existing.id, existing.doc);
    }

    let accepted = 0;
    const receivedAt = new Date(now ?? Date.now()).toISOString();
    for (const change of changes) {
      if (
        !change ||
        typeof change.id !== "string" ||
        !change.id ||
        change.id.startsWith("_local/") ||
        !change.doc ||
        typeof change.doc !== "object" ||
        Array.isArray(change.doc) ||
        change.doc._id !== change.id ||
        (change.doc._deleted !== true &&
          (typeof change.doc.createdAt !== "string" ||
            typeof change.doc.updatedAt !== "string"))
      ) {
        const error = new Error("The request contains an invalid database change.");
        error.status = 400;
        throw error;
      }

      const previous = latestById.get(change.id);
      if (previous && stableStringify(previous) === stableStringify(change.doc)) {
        continue;
      }

      const event = {
        seq: ++feed.lastSeq,
        receivedAt,
        deviceId,
        id: change.id,
        doc: change.doc,
      };
      feed.changes.push(event);
      latestById.set(change.id, change.doc);
      accepted += 1;
    }

    return { accepted, latestSeq: feed.lastSeq };
  };

  return { getChanges, appendChanges };
}

function stableStringify(value) {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  if (value && typeof value === "object") {
    const entries = Object.keys(value)
      .filter((key) => !["_rev", "_revisions", "_conflicts"].includes(key))
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`);
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(value);
}

module.exports = { createChangeFeedService };
