export default async function handler(req,res){
  res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Access-Control-Allow-Methods','GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers','Content-Type, Authorization');
  if(req.method==='OPTIONS') return res.status(200).end();
  if(req.method==='GET') return res.status(200).json({ok:true, wallet:"GCW05...KVCVY 100% Testnet", single:true});
  if(req.method!=='POST') return res.status(405).json({success:false, error:"Method Not Allowed"});

  const PI_API_KEY = process.env.PI_API_KEY;
  if(!PI_API_KEY) return res.status(500).json({success:false, error:"Missing PI_API_KEY"});

  const body = req.body || {};
  // CHI NHAN 1 UID DUY NHAT - KHONG NHAN MANG
  let uid = null;
  if(body.uid) uid = String(body.uid).trim();
  else if(Array.isArray(body.uids) && body.uids.length>0) uid = String(body.uids[0]).trim();
  else if(body.target_uid) uid = String(body.target_uid).trim();

  if(!uid) return res.status(400).json({success:false, error:"Missing uid - Gui {uid: '...'} 1 cai thoi"});

  const amount = Number(body.amount)||1;

  async function piCall(path,method,payload){
    const r = await fetch(`https://api.minepi.com${path}`,{
      method,
      headers:{ Authorization:`Key ${PI_API_KEY}`, "Content-Type":"application/json" },
      body: payload?JSON.stringify(payload):undefined
    });
    const txt = await r.text();
    let data; try{ data=JSON.parse(txt);}catch{ data={raw:txt.slice(0,1000)}; }
    console.log(`[Pi SINGLE] ${method} ${path} UID ${uid.slice(0,8)} -> ${r.status} ${JSON.stringify(data).slice(0,800)}`);
    return {ok:r.ok,status:r.status,data};
  }

  try{
    const create = await piCall('/v2/payments','POST',{ amount, memo:`Lovely SINGLE ${uid.slice(0,4)}`, metadata:{ target_uid: uid, single:true }, uid });
    if(!create.ok || !create.data.identifier) throw new Error(create.data.error?.message || create.data.error || JSON.stringify(create.data).slice(0,500));

    const pid = create.data.identifier;
    const approve = await piCall(`/v2/payments/${pid}/approve`,'POST',{});
    if(!approve.ok) throw new Error(approve.data.error?.message || "Approve fail");

    const fakeTxid = "b".repeat(64);
    const complete = await piCall(`/v2/payments/${pid}/complete`,'POST',{ txid: fakeTxid });
    if(!complete.ok) throw new Error(complete.data.error?.message || "Complete fail");

    return res.status(200).json({ success:true, uid, paymentId: pid, single:true, api:"api.minepi.com" });
  }catch(e){
    console.error(`[SINGLE FAIL] ${uid}: ${e.message}`);
    return res.status(207).json({ success:false, uid, error:e.message, single:true });
  }
}
