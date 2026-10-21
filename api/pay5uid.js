// api/pay5uid.js
export default async function handler(req,res){
if(req.method!=="POST"){res.setHeader("Allow","POST");return res.status(405).json({success:false,error:"Method Not Allowed"});}
const PI_API_KEY=process.env.PI_API_KEY;
if(!PI_API_KEY)return res.status(500).json({success:false,error:"Missing PI_API_KEY"});
const body=req.body||{};
let targetList=[];
if(Array.isArray(body.uids)&&body.uids.length>0)targetList=body.uids.map(u=>typeof u==='string'?u.trim():'').filter(Boolean);
else if(typeof body.uid==='string'&&body.uid.trim())targetList=[body.uid.trim()];
const DEFAULT_5UIDS=["17bd5195-d292-453f-9257-e3c9d812a7a0","4a0e132a-2689-484b-8d4b-04e6391a89d9","7dc50a3e-e66d-4e06-8077-d2b5306889b1","0c5bbb4d-5306-48b4-b227-383d95399a53","f963dc03-f6f5-41ba-a3f4-54f5a8569b5c"];
if(targetList.length===0)targetList=DEFAULT_5UIDS;
const amount=Number(body.amount)||1;
async function piFetch(path,method="GET",payload){
const r=await fetch(`https://api.minepi.com${path}`,{method,headers:{Authorization:`Key ${PI_API_KEY}`,"Content-Type":"application/json",Accept:"application/json"},body:payload?JSON.stringify(payload):undefined});
const text=await r.text();let data;try{data=text?JSON.parse(text):{};}catch{data={raw:text.slice(0,3000)};}
return{ok:r.ok,status:r.status,data};}
async function cancelOngoingIfFound(piErrorData){
try{
let paymentId=null;
if(piErrorData?.payment?.identifier)paymentId=piErrorData.payment.identifier;
if(!paymentId&&piErrorData?.identifier)paymentId=piErrorData.identifier;
if(!paymentId&&piErrorData?.ongoing_payment?.identifier)paymentId=piErrorData.ongoing_payment.identifier;
if(!paymentId){const inc=await piFetch("/v2/payments/incomplete","GET");const list=inc.data?.incomplete_payments||inc.data||[];if(Array.isArray(list)&&list.length>0)paymentId=list[0].identifier;}
if(paymentId){let result=await piFetch(`/v2/payments/${paymentId}/complete`,"POST",{txid:"a2u_retry_complete"});if(!result.ok)result=await piFetch(`/v2/payments/${paymentId}/cancel`,"POST");return{cancelled:result.ok,paymentId,result:result.data};}
}catch(e){}return{cancelled:false};}
const results=[];
for(let i=0;i<targetList.length;i++){
const uid=targetList[i];let attempt=0;let finalResult=null;
while(attempt<3){attempt++;
const piPayload={payment:{amount,memo:`Lumia 909 Sandbox Test to @${uid.substring(0,6)} - ${i+1}/${targetList.length}`,metadata:{target_uid:uid,batch_index:i,attempt},uid,}};
const piResponse=await piFetch("/v2/payments","POST",piPayload);
if(piResponse.ok){finalResult={uid,success:true,pi_response:piResponse.data,attempts:attempt};break;}
else{
const errStr=JSON.stringify(piResponse.data).toLowerCase();
if(errStr.includes("ongoing_payment_found")||errStr.includes("ongoing payment")){
const cancelRes=await cancelOngoingIfFound(piResponse.data);
if(cancelRes.cancelled){finalResult={uid,success:false,retrying:true,cancelled_old:cancelRes.paymentId};continue;}
else{finalResult={uid,success:false,error:"ongoing_payment_found but cannot cancel",details:piResponse.data,status:piResponse.status};break;}
}else{finalResult={uid,success:false,error:"Pi API rejected",details:piResponse.data,status:piResponse.status,attempts:attempt};break;}}}
if(finalResult?.retrying){
const lastPayload={payment:{amount,memo:`Lumia 909 Retry ${uid}`,metadata:{target_uid:uid},uid}};
const lastResp=await piFetch("/v2/payments","POST",lastPayload);
finalResult=lastResp.ok?{uid,success:true,pi_response:lastResp.data}:{uid,success:false,error:"Failed after cancel",details:lastResp.data};}
results.push(finalResult);
if(i<targetList.length-1)await new Promise(r=>setTimeout(r,800));}
const allOk=results.every(r=>r.success);
return res.status(allOk?200:207).json({success:allOk,total:results.length,results,note:"Fixed ongoing_payment_found by auto cancel + retry"});}
