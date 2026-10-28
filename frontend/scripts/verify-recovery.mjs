import { createAccount, createClient } from 'genlayer-js';
import { studionet } from 'genlayer-js/chains';
import { ClaimRecovery } from '../src/recovery.js';
import { getAddress } from 'viem';
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
const contract='0xA5241D63222Ed286842538DC786b937ab3f7b54b';
const account=createAccount();
const client=createClient({chain:studionet,account});
const values=new Map();
const storage={getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};
const journal=new ClaimRecovery(storage);
const previous=existsSync('../evidence/recovery-pending.json') ? JSON.parse(readFileSync('../evidence/recovery-pending.json','utf8')) : null;
const id=previous?.claim_id || 'recovery-'+Date.now().toString(36);
const args=[id,'Recovery verification claim','A test filing verifies transaction recovery without repeating the write.','This is a synthetic test policy for application recovery, with no payment obligation.','Official rainfall exceeds 100 millimetres within a 24-hour period.','https://en.wikipedia.org/wiki/2024_United_Arab_Emirates_floods','',''];
let sends=0, receipt;
if (previous) {
 const tx=await client.getTransaction({hash:previous.hash});
 storage.setItem(journal.key(contract),JSON.stringify({hash:previous.hash,contract:contract.toLowerCase(),chain:61999,method:'file_claim',claimId:id,sender:tx.from_address||tx.sender}));
 sends=1;
} else try {
 await journal.submit(contract,'file_claim',args,account.address,async()=>{
  sends++;const hash=await client.writeContract({address:contract,functionName:'file_claim',args,value:0n});
  console.log('BROADCAST',hash);
  writeFileSync('../evidence/recovery-pending.json',JSON.stringify({hash,contract,claim_id:id,chain_id:61999},null,2)+'\n');
  return hash;
 },async()=>{throw Error('deliberate client tracking interruption')},()=>{});
} catch(err) { if(!journal.pending(contract))throw err; }
const reload=new ClaimRecovery(storage);
const result=await reload.resume(contract,async hash=>{
 receipt=await client.waitForTransactionReceipt({hash,status:'FINALIZED',interval:3000,retries:100,fullTransaction:true});
 return receipt;
},(address,id)=>client.readContract({address:getAddress(address),functionName:'get_claim',args:[id],transactionHashVariant:'latest-final'}));
if(sends!==1 || reload.pending(contract))throw Error('Recovery invariant failed');
const evidence={verified_at:new Date().toISOString(),chain_id:61999,contract,claim_id:id,hash:result.tx.hash,broadcast_count:sends,tracking_interruption:'Deliberate client-side interruption after broadcast; not a network outage.',resumed_with_new_journal:true,pending_cleared:true,receipt:{status:receipt.statusName||receipt.status_name,result:receipt.resultName||receipt.result_name,execution:receipt.txExecutionResultName,recipient:receipt.to_address||receipt.recipient,consensus_data:receipt.consensus_data},claim:result.claim};
writeFileSync('../evidence/recovery-studionet.json',JSON.stringify(evidence,null,2)+'\n');
console.log('RECOVERY_VERIFIED',result.tx.hash);
