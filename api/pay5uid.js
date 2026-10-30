
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

const AMOUNT = 1;
const NETWORK_REQUIRED = "Pi Testnet";
const PI_API_URL = "https://api.minepi.com/v2";

const sleep = ms =>
  new Promise(resolve => setTimeout(resolve, ms));

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
  await kv(env, [
    "SET",
    key,
    JSON.stringify(marker)
  ]);
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

function incompleteSummary(payments) {
  return payments.map(p => ({
    paymentId: p.identifier,
    uid: p.user_uid,
    amount: p.amount,
    network: p.network,
    txid: p.transaction?.txid || null,
    status: p.status
  }));
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

    console.log(
      "[AUTH OK]",
      admin.uid,
      admin.username
    );

    // 2. INITIALIZE OFFICIAL PI BACKEND SDK
    const pi = new PiNetwork(
      env.PI_API_KEY,
      env.APP_WALLET_SEED
    );

    // 3. CHECK EXISTING INCOMPLETE PAYMENTS
    const initialIncomplete =
      await pi.getIncompleteServerPayments();

    if (initialIncomplete.length > 0) {
      console.log(
        "[STOP] Existing incomplete A2U payments",
        incompleteSummary(initialIncomplete)
      );

      return res.status(409).json({
        success: false,
        error: "INCOMPLETE_PAYMENT_FOUND",
        message:
          "Có giao dịch A2U cũ chưa hoàn tất. Không tạo payment mới.",
        incompletePayments:
          incompleteSummary(initialIncomplete)
      });
    }

    // 4. GLOBAL BATCH LOCK
    const lockKey = "lovely:a2u:testnet:batch-lock";
    const lockToken =
      Date.now() + "-" + Math.random().toString(36).slice(2);

    const lockResult = await kv(env, [
      "SET",
      lockKey,
      lockToken,
      "NX",
      "EX",
      900
    ]);

    if (lockResult !== "OK") {
      return res.status(409).json({
        success: false,
        error: "BATCH_ALREADY_RUNNING",
        message: "Một batch khác đang chạy."
      });
    }

    const results = [];
    let stopBatch = false;

    try {
      // 5. PROCESS FIVE UIDS SEQUENTIALLY
      for (let i = 0; i < TARGETS.length; i++) {
        const target = TARGETS[i];

        const ledgerKey =
          `lovely:a2u:testnet:v1:${target.uid}`;

        console.log(
          `[START] ${i + 1}/${TARGETS.length}`,
          target.username,
          target.uid
        );

        // A. CHECK PERMANENT PAYMENT LEDGER
        const previous = await getMarker(
          env,
          ledgerKey
        );

        if (previous?.state === "paid") {
          console.log(
            "[SKIP ALREADY PAID]",
            target.username
          );

          results.push({
            uid: target.uid,
            username: target.username,
            success: true,
            skipped: true,
            txid: previous.txid,
            paymentId: previous.paymentId
          });

          continue;
        }

        if (previous) {
          results.push({
            uid: target.uid,
            username: target.username,
            success: false,
            error: "PREVIOUS_PAYMENT_NEEDS_REVIEW",
            previous
          });

          stopBatch = true;
          break;
        }

        // B. RESERVE UID BEFORE CREATING PAYMENT
        const reservation = {
          state: "processing",
          stage: "reserved",
          uid: target.uid,
          username: target.username,
          createdAt: new Date().toISOString()
        };

        const reserved = await kv(env, [
          "SET",
          ledgerKey,
          JSON.stringify(reservation),
          "NX"
        ]);

        if (reserved !== "OK") {
          results.push({
            uid: target.uid,
            username: target.username,
            success: false,
            error: "UID_LOCKED_BY_ANOTHER_REQUEST"
          });

          stopBatch = true;
          break;
        }

        let paymentId = null;
        let txid = null;

        try {
          // C. RECHECK INCOMPLETE PAYMENTS
          const incomplete =
            await pi.getIncompleteServerPayments();

          if (incomplete.length > 0) {
            throw new Error(
              "INCOMPLETE_PAYMENT_FOUND: " +
              JSON.stringify(incompleteSummary(incomplete))
            );
          }

          // D. CREATE A2U PAYMENT
          const paymentData = {
            amount: AMOUNT,
            memo:
              `Lovely Animals Testnet A2U - ${target.username}`,
            metadata: {
              app: "lovelyanimals",
              environment: "testnet",
              target_uid: target.uid,
              target_username: target.username,
              batch_index: i + 1
            },
            uid: target.uid
          };

          paymentId = await pi.createPayment(
            paymentData
          );

          console.log(
            "[CREATE OK]",
            target.username,
            paymentId
          );

          await saveMarker(env, ledgerKey, {
            ...reservation,
            state: "processing",
            stage: "created",
            paymentId
          });

          // E. VERIFY PAYMENT BEFORE SIGNING
          const payment = await pi.getPayment(
            paymentId
          );

          console.log(
            "[PAYMENT CHECK]",
            JSON.stringify({
              identifier: payment.identifier,
              uid: payment.user_uid,
              amount: payment.amount,
              network: payment.network,
              direction: payment.direction,
              from: payment.from_address,
              to: payment.to_address
            })
          );

          // STRICT TESTNET GUARD
          if (payment.network !== NETWORK_REQUIRED) {
            if (!payment.transaction?.txid) {
              try {
                await pi.cancelPayment(paymentId);
              } catch (cancelError) {
                console.error(
                  "[WRONG NETWORK CANCEL ERROR]",
                  cancelError.message
                );
              }
            }

            await saveMarker(env, ledgerKey, {
              ...reservation,
              state: "blocked_wrong_network",
              paymentId,
              network: payment.network
            });

            throw new Error(
              `NETWORK BLOCKED: expected ${NETWORK_REQUIRED}, received ${payment.network}`
            );
          }

          if (payment.direction !== "app_to_user") {
            throw new Error(
              "WRONG PAYMENT DIRECTION"
            );
          }

          if (payment.user_uid !== target.uid) {
            throw new Error(
              "RECIPIENT UID MISMATCH"
            );
          }

          if (Number(payment.amount) !== AMOUNT) {
            throw new Error(
              "PAYMENT AMOUNT MISMATCH"
            );
          }

          // F. SUBMIT PAYMENT TO PI TESTNET BLOCKCHAIN
          txid = await pi.submitPayment(paymentId);

          if (!txid) {
            throw new Error(
              "SUBMIT DID NOT RETURN TXID"
            );
          }

          console.log(
            "[SUBMIT OK]",
            target.username,
            txid
          );

          await saveMarker(env, ledgerKey, {
            ...reservation,
            state: "processing",
            stage: "submitted",
            paymentId,
            txid
          });

          // G. COMPLETE PAYMENT ON PI SERVER
          const completed = await pi.completePayment(
            paymentId,
            txid
          );

          const verified =
            completed.status?.transaction_verified === true &&
            completed.status?.developer_completed === true &&
            completed.transaction?.verified === true &&
            completed.transaction?.txid === txid &&
            completed.network === NETWORK_REQUIRED;

          if (!verified) {
            throw new Error(
              "COMPLETION RETURNED BUT PAYMENT STATUS IS NOT FULLY VERIFIED"
            );
          }

          // H. PERMANENT SUCCESS LEDGER
          await saveMarker(env, ledgerKey, {
            state: "paid",
            uid: target.uid,
            username: target.username,
            paymentId,
            txid,
            network: completed.network,
            amount: completed.amount,
            toAddress: completed.to_address,
            completedAt: new Date().toISOString()
          });

          console.log(
            "[PAYMENT SUCCESS]",
            target.username,
            txid
          );

          results.push({
            uid: target.uid,
            username: target.username,
            success: true,
            paymentId,
            txid,
            network: completed.network,
            amount: completed.amount,
            toAddress: completed.to_address
          });

        } catch (error) {
          console.error(
            "[PAYMENT ERROR]",
            target.username,
            error.message
          );

          // DO NOT AUTOMATICALLY RETRY.
          // Keep the UID reserved for manual inspection.
          try {
            const current = await getMarker(
              env,
              ledgerKey
            );

            if (current?.state !== "blocked_wrong_network") {
              await saveMarker(env, ledgerKey, {
                ...reservation,
                state: "needs_review",
                stage: current?.stage || "unknown",
                paymentId,
                txid,
                error: error.message,
                updatedAt: new Date().toISOString()
              });
            }
          } catch (ledgerError) {
            console.error(
              "[LEDGER ERROR]",
              ledgerError.message
            );
          }

          results.push({
            uid: target.uid,
            username: target.username,
            success: false,
            paymentId,
            txid,
            error: error.message
          });

          stopBatch = true;
          break;
        }

        // I. DELAY BETWEEN PAYMENTS
        if (i < TARGETS.length - 1 && !stopBatch) {
          await sleep(1200);
        }
      }

    } finally {
      // RELEASE ONLY OUR OWN LOCK
      const currentLock = await kv(
        env,
        ["GET", lockKey]
      );

      if (currentLock === lockToken) {
        await kv(env, ["DEL", lockKey]);
      }
    }

    const successCount = results.filter(
      item => item.success
    ).length;

    const paidCount = results.filter(
      item => item.success && !item.skipped
    ).length;

    const allPaid =
      successCount === TARGETS.length &&
      !stopBatch;

    console.log("[BATCH SUMMARY]", {
      total: TARGETS.length,
      successCount,
      paidCount,
      stopBatch
    });

    return res.status(allPaid ? 200 : 207).json({
      success: allPaid,
      environment: "TESTNET ONLY",
      total: TARGETS.length,
      successCount,
      paidCount,
      results
    });

  } catch (error) {
    console.error("[FATAL]", error.message);

    return res.status(
      error.message.startsWith("403") ? 403 : 500
    ).json({
      success: false,
      error: error.message
    });
  }
}
