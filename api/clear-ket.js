// api/clear-ket.js — Lovely Animals A2U TESTNET (v2, da ra soat an toan)
// Muc dich: GO KET khi pay A2U bi ket — NHUNG KHONG huy mu, KHONG xoa mu.
//  - Incomplete payment: kiem tra tung cai. Co txid -> HOAN TAT (complete),
//    khong co txid -> moi HUY (cancel). Khong bao gio cancel payment da co txid.
//  - Ledger Redis: UID "paid" giu nguyen. UID "needs_review"/"blocked_wrong_network"
//    thi doi chieu payment that tren Pi truoc khi reset; luu audit log truoc khi xoa.
//  - Batch lock: chi xoa khi lock da CU (batch chac chan da xong hoac crash).
//    Lock moi (< 120s) co nghia batch co the dang chay -> KHONG xoa.
// CHI ADMIN moi goi duoc (xac thuc bang Pi accessToken qua /v2/me, doi chieu UID
// voi ADMIN_UID — khong tin UID do client gui len).
// Khong dung toi giao dien — chi la API phu de go ket.

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
const AUDIT_PREFIX = "lovely:a2u:testnet:audit:";

// Lock moi hon nguong nay thi coi nhu batch co the dang chay -> KHONG xoa.
// Mot batch 5 UID mat khoang 45-120s (4 lan goi Pi API/UID + delay 1.2s).
const LOCK_STALE_AFTER_MS = 120000;

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

async function getMarker(env, key) {
  const raw = await kv(env, ["GET", key]);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return { state: "unknown", raw };
  }
}

async function saveMarker(env, key, marker) {
  await kv(env, ["SET", key, JSON.stringify(marker)]);
}

// Xac thuc admin: lay UID TU Pi server qua /v2/me (token cua nguoi goi),
// roi doi chieu voi ADMIN_UID. Khong tin bat cu UID nao client gui len.
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
    // 1. VERIFY ADMIN (qua /v2/me, doi chieu UID)
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

    // 3. XU LY INCOMPLETE SERVER PAYMENTS — KIEM TRA TUNG CAI
    //    Co txid -> HOAN TAT (khong huy). Khong txid -> moi HUY.
    const incomplete = await pi.getIncompleteServerPayments();

    const completed = [];
    const cancelled = [];
    const needsManualReview = [];

    for (const p of incomplete) {
      const paymentId = p.identifier;
      let full = p;

      // Lay trang thai day du nhat cua payment
      try {
        full = await pi.getPayment(paymentId);
      } catch (error) {
        console.error("[GET PAYMENT ERROR]", paymentId, error.message);
      }

      const txid = full.transaction?.txid || null;

      if (txid) {
        // DA CO GIAO DICH BLOCKCHAIN -> KHONG HUY, phai HOAN TAT.
        try {
          const done = await pi.completePayment(paymentId, txid);
          const verified =
            done.status?.transaction_verified === true &&
            done.status?.developer_completed === true &&
            done.transaction?.verified === true &&
            done.transaction?.txid === txid;

          if (verified) {
            completed.push({
              paymentId,
              uid: full.user_uid,
              amount: full.amount,
              txid,
              network: full.network
            });
            console.log("[COMPLETED]", paymentId, txid);
          } else {
            needsManualReview.push({
              paymentId,
              uid: full.user_uid,
              amount: full.amount,
              txid,
              reason: "COMPLETION_RETURNED_BUT_NOT_FULLY_VERIFIED",
              payment: full
            });
            console.error("[COMPLETE NOT VERIFIED]", paymentId);
          }
        } catch (error) {
          needsManualReview.push({
            paymentId,
            uid: full.user_uid,
            amount: full.amount,
            txid,
            reason: "COMPLETE_FAILED: " + error.message,
            payment: full
          });
          console.error("[COMPLETE ERROR]", paymentId, error.message);
        }
      } else {
        // CHUA CO GIAO DICH BLOCKCHAIN -> an toan de HUY.
        try {
          await pi.cancelPayment(paymentId);
          cancelled.push({
            paymentId,
            uid: full.user_uid,
            amount: full.amount,
            network: full.network
          });
          console.log("[CANCELLED]", paymentId);
        } catch (error) {
          needsManualReview.push({
            paymentId,
            uid: full.user_uid,
            amount: full.amount,
            reason: "CANCEL_FAILED: " + error.message,
            payment: full
          });
          console.error("[CANCEL ERROR]", paymentId, error.message);
        }
      }
    }

    // 4. XU LY LEDGER REDIS — DOI CHIEU VOI PI TRUOC KHI RESET
    const ledgerCleared = [];
    const ledgerKeptPaid = [];
    const ledgerRecoveredPaid = [];
    const ledgerNeedsReview = [];
    const auditKeys = [];

    for (const target of TARGETS) {
      const key = LEDGER_PREFIX + target.uid;
      const marker = await getMarker(env, key);

      if (!marker) {
        continue; // Khong co ledger -> khong co gi de go.
      }

      if (marker.state === "paid") {
        // DA PAY THANH CONG — GIU NGUYEN, tuyet doi khong xoa.
        ledgerKeptPaid.push({
          uid: target.uid,
          username: target.username,
          state: marker.state,
          txid: marker.txid || null,
          paymentId: marker.paymentId || null
        });
        continue;
      }

      // Ledger ket (needs_review / blocked_wrong_network / processing):
      // doi chieu payment that tren Pi truoc khi quyet dinh.
      let disposition = "reset"; // mac dinh: reset neu payment xac nhan chua xong
      let piPayment = null;

      if (marker.paymentId) {
        try {
          piPayment = await pi.getPayment(marker.paymentId);
          const txid = piPayment.transaction?.txid || null;

          if (txid) {
            // Payment da co giao dich blockchain -> thu HOAN TAT.
            try {
              const done = await pi.completePayment(marker.paymentId, txid);
              const verified =
                done.status?.transaction_verified === true &&
                done.status?.developer_completed === true &&
                done.transaction?.verified === true &&
                done.transaction?.txid === txid;

              if (verified) {
                // Hoa ra da pay xong — danh dau PAID chu khong xoa.
                await saveMarker(env, key, {
                  state: "paid",
                  uid: target.uid,
                  username: target.username,
                  paymentId: marker.paymentId,
                  txid,
                  network: done.network,
                  amount: done.amount,
                  toAddress: done.to_address,
                  recoveredBy: "clear-ket",
                  recoveredAt: new Date().toISOString()
                });
                ledgerRecoveredPaid.push({
                  uid: target.uid,
                  username: target.username,
                  previousState: marker.state,
                  paymentId: marker.paymentId,
                  txid
                });
                console.log("[LEDGER RECOVERED PAID]", target.username, txid);
                disposition = "recovered";
              } else {
                disposition = "manual";
              }
            } catch (error) {
              disposition = "manual";
            }
          } else if (
            piPayment.status?.cancelled === true ||
            piPayment.status?.user_cancelled === true
          ) {
            // Payment da bi huy tren Pi -> an toan de reset.
            disposition = "reset";
          } else {
            // Payment ton tai, chua co txid, chua bi huy -> huy no truoc roi reset.
            try {
              await pi.cancelPayment(marker.paymentId);
              disposition = "reset";
            } catch (error) {
              disposition = "manual";
            }
          }
        } catch (error) {
          // Khong doc duoc payment tren Pi -> KHONG tu y xoa, de admin xem tay.
          disposition = "manual";
        }
      }
      // Neu marker khong co paymentId (ket o buoc reserve, chua tao payment)
      // thi khong co giao dich nao tren Pi -> an toan de reset.

      if (disposition === "recovered") {
        continue;
      }

      if (disposition === "manual") {
        ledgerNeedsReview.push({
          uid: target.uid,
          username: target.username,
          previousState: marker.state,
          paymentId: marker.paymentId || null,
          txid: marker.txid || null,
          reason: "CANNOT_CONFIRM_PI_STATE — khong tu y xoa, can admin kiem tra tay"
        });
        console.error("[LEDGER MANUAL REVIEW]", target.username, marker.state);
        continue;
      }

      // RESET: luu audit log TRUOC khi xoa, roi moi xoa.
      const auditKey =
        AUDIT_PREFIX + target.uid + ":" + Date.now();
      try {
        await saveMarker(env, auditKey, {
          ...marker,
          clearedBy: admin.uid,
          clearedAt: new Date().toISOString(),
          reason: "clear-ket reset after Pi reconciliation",
          piPayment: piPayment
            ? {
                identifier: piPayment.identifier,
                network: piPayment.network,
                direction: piPayment.direction,
                amount: piPayment.amount,
                status: piPayment.status,
                txid: piPayment.transaction?.txid || null
              }
            : null
        });
        auditKeys.push(auditKey);
      } catch (error) {
        // Khong luu duoc audit -> DUNG LAI, khong xoa de tranh mat dau.
        ledgerNeedsReview.push({
          uid: target.uid,
          username: target.username,
          previousState: marker.state,
          reason: "AUDIT_LOG_FAILED: " + error.message
        });
        console.error("[AUDIT FAILED]", target.username, error.message);
        continue;
      }

      await kv(env, ["DEL", key]);
      ledgerCleared.push({
        uid: target.uid,
        username: target.username,
        previousState: marker.state,
        paymentId: marker.paymentId || null,
        auditKey
      });
      console.log("[LEDGER CLEARED]", target.username, marker.state);
    }

    // 5. BATCH LOCK — CHI XOA KHI LOCK DA CU (batch chac chan khong con chay)
    let lockStatus = "none";
    let lockReleased = false;
    let lockAgeMs = null;

    try {
      const lockToken = await kv(env, ["GET", BATCH_LOCK_KEY]);

      if (lockToken) {
        // Token co dang "<Date.now()>-<random>" (xem pay5uid.js).
        const createdAt = parseInt(
          String(lockToken).split("-")[0],
          10
        );

        if (Number.isFinite(createdAt)) {
          lockAgeMs = Date.now() - createdAt;

          if (lockAgeMs >= LOCK_STALE_AFTER_MS) {
            await kv(env, ["DEL", BATCH_LOCK_KEY]);
            lockReleased = true;
            lockStatus = "stale_released";
            console.log("[LOCK RELEASED]", "age_ms:", lockAgeMs);
          } else {
            lockStatus = "active_kept";
            console.log("[LOCK ACTIVE — KEPT]", "age_ms:", lockAgeMs);
          }
        } else {
          // Khong doc duoc thoi gian tao lock -> KHONG tu y xoa.
          lockStatus = "unknown_kept";
          console.log("[LOCK UNKNOWN — KEPT]", lockToken);
        }
      }
    } catch (error) {
      lockStatus = "error: " + error.message;
      console.error("[LOCK ERROR]", error.message);
    }

    return res.status(200).json({
      success: true,
      environment: "TESTNET ONLY",
      incompleteFound: incomplete.length,
      incompleteCompleted: completed,
      incompleteCancelled: cancelled,
      incompleteNeedsManualReview: needsManualReview,
      ledgerCleared,
      ledgerKeptPaid,
      ledgerRecoveredPaid,
      ledgerNeedsReview,
      auditKeys,
      lock: {
        status: lockStatus,
        released: lockReleased,
        ageMs: lockAgeMs
      },
      message:
        "Da go ket an toan. UID nao da paid (hoac vua khoi phuc paid) se duoc bo qua " +
        "khi chay lai PAY 5 UID. UID nao o muc needsManualReview thi can admin kiem tra tay truoc."
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
