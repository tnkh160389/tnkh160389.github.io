// api/clear-ket.js — Lovely Animals A2U TESTNET
// Muc dich: GO KET khi pay A2U bi ket.
//  - Huy tat ca incomplete server payments (A2U do dang) tren Pi server.
//  - Xoa cac key ledger Redis cua 5 UID + batch lock, de chay lai pay5uid tu dau.
// CHI ADMIN moi goi duoc (xac thuc bang Pi accessToken, giong pay5uid.js).
// Khong dung toi giao dien — chi la API phu de go ket.
//
// Cach dung (sau khi deploy):
//   1. Mo trang A2U Lovely trong Pi Browser, bam nut 1 XAC THUC ADMIN.
//   2. Goi POST /api/clear-ket voi { accessToken } (co the dung DevTools / curl).
//   3. Kiem tra ket qua tra ve (cancelled + cleared), roi chay lai nut 2 PAY 5 UID.
//
// Luu y an toan:
//   - Chi xoa ledger cua 5 UID Lovely (prefix lovely:a2u:testnet:v1:).
//   - UID nao da o trang thai "paid" thi KHONG bi xoa (khong pay lai 2 lan).
//   - Neu mot UID dang "paid" thi clear-ket se giu nguyen va bao cao lai (keptPaid).

import PiNetwork from "pi-backend";

const ADMIN_DEFAULT =
  "42e4b976-a279-43e3-afc1-3f3e75db0e16";

const TARGETS = [
  {
    username: "thuongsheva",
    uid: "42e4b976-a279-43e3-afc1-3f3e75db0e16"
  },
  {
    username: "nguyenanhuann113113",
    uid: "42e3690a-ca9d-4726-bc94-43abd7cecb60"
  },
  {
    username: "phithuong07",
    uid: "6d7867e6-9abb-4f76-9cb4-85e146eee486"
  },
  {
    username: "thuongsheva01",
    uid: "6b6080ea-081c-4e34-8b81-91fd173b7c36"
  },
  {
    username: "dttngan123",
    uid: "a46fa764-7725-4f23-bbfc-554b358e33d3"
  }
];

const PI_API_URL = "https://api.minepi.com/v2";
const BATCH_LOCK_KEY = "lovely:a2u:testnet:batch-lock";
const LEDGER_PREFIX = "lovely:a2u:testnet:v1:";

function getEnvironment() {
  const {
    PI_API_KEY,
    APP_WALLET_SEED,
    ADMIN_UID,
    KV_REST_API_URL,
    KV_REST_API_TOKEN
  } = process.env;

  if (!PI_API_KEY) throw new Error("Missing PI_API_KEY");
  if (!APP_WALLET_SEED) throw new Error("Missing APP_WALLET_SEED");
  if (!KV_REST_API_URL) throw new Error("Missing KV_REST_API_URL");
  if (!KV_REST_API_TOKEN) throw new Error("Missing KV_REST_API_TOKEN");

  return {
    PI_API_KEY,
    APP_WALLET_SEED,
    ADMIN_UID: ADMIN_UID || ADMIN_DEFAULT,
    KV_REST_API_URL,
    KV_REST_API_TOKEN
  };
}

// Upstash Redis REST
async function kv(env, command) {
  const response = await fetch(env.KV_REST_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.KV_REST_API_TOKEN}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(command)
  });

  const data = await response.json();

  if (!response.ok || data.error) {
    throw new Error(
      "Redis error: " + (data.error || response.status)
    );
  }

  return data.result;
}

async function verifyAdmin(accessToken, expectedUID) {
  const response = await fetch(`${PI_API_URL}/me`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json"
    }
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      "Pi authentication failed: " +
      JSON.stringify(data)
    );
  }

  if (data.uid !== expectedUID) {
    throw new Error(
      `403 ADMIN ONLY. Auth UID: ${data.uid}`
    );
  }

  return data;
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader(
    "Access-Control-Allow-Methods",
    "POST, OPTIONS"
  );
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization"
  );

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      error: "Method Not Allowed"
    });
  }

  let env;

  try {
    env = getEnvironment();
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }

  const accessToken = req.body?.accessToken;

  if (!accessToken) {
    return res.status(401).json({
      success: false,
      error: "Missing accessToken"
    });
  }

  try {
    // 1. VERIFY ADMIN
    const admin = await verifyAdmin(
      accessToken,
      env.ADMIN_UID
    );

    console.log("[CLEAR-KET AUTH OK]", admin.uid, admin.username);

    // 2. INIT PI BACKEND SDK
    const pi = new PiNetwork(
      env.PI_API_KEY,
      env.APP_WALLET_SEED
    );

    // 3. CANCEL INCOMPLETE SERVER PAYMENTS
    const incomplete = await pi.getIncompleteServerPayments();

    const cancelled = [];
    const cancelErrors = [];

    for (const p of incomplete) {
      try {
        await pi.cancelPayment(p.identifier);
        cancelled.push({
          paymentId: p.identifier,
          uid: p.user_uid,
          amount: p.amount,
          network: p.network
        });
        console.log("[CANCELLED]", p.identifier);
      } catch (error) {
        cancelErrors.push({
          paymentId: p.identifier,
          error: error.message
        });
        console.error("[CANCEL ERROR]", p.identifier, error.message);
      }
    }

    // 4. CLEAR REDIS LEDGER (chi xoa UID chua "paid")
    const cleared = [];
    const keptPaid = [];
    const ledgerErrors = [];

    for (const target of TARGETS) {
      const key = LEDGER_PREFIX + target.uid;
      try {
        const raw = await kv(env, ["GET", key]);
        let state = null;
        if (raw) {
          try {
            state = JSON.parse(raw).state;
          } catch {
            state = "unknown";
          }
        }

        if (state === "paid") {
          // Da pay thanh cong — GIU NGUYEN, khong xoa.
          keptPaid.push({
            uid: target.uid,
            username: target.username,
            state
          });
          continue;
        }

        if (raw) {
          await kv(env, ["DEL", key]);
          cleared.push({
            uid: target.uid,
            username: target.username,
            previousState: state
          });
          console.log("[LEDGER CLEARED]", target.username, state);
        } else {
          cleared.push({
            uid: target.uid,
            username: target.username,
            previousState: null
          });
        }
      } catch (error) {
        ledgerErrors.push({
          uid: target.uid,
          username: target.username,
          error: error.message
        });
        console.error("[LEDGER ERROR]", target.username, error.message);
      }
    }

    // 5. RELEASE BATCH LOCK (neu con sot)
    let lockReleased = false;
    try {
      const lock = await kv(env, ["GET", BATCH_LOCK_KEY]);
      if (lock) {
        await kv(env, ["DEL", BATCH_LOCK_KEY]);
        lockReleased = true;
        console.log("[LOCK RELEASED]");
      }
    } catch (error) {
      ledgerErrors.push({ key: BATCH_LOCK_KEY, error: error.message });
    }

    return res.status(200).json({
      success: true,
      environment: "TESTNET ONLY",
      incompleteFound: incomplete.length,
      cancelled,
      cancelErrors,
      ledgerCleared: cleared,
      ledgerKeptPaid: keptPaid,
      ledgerErrors,
      lockReleased,
      message:
        "Da go ket. Chay lai PAY 5 UID de pay tiep (UID nao da paid se duoc bo qua)."
    });
  } catch (error) {
    console.error("[CLEAR-KET FATAL]", error.message);

    return res.status(
      error.message.startsWith("403") ? 403 : 500
    ).json({
      success: false,
      error: error.message
    });
  }
}
