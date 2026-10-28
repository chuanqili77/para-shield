import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ClaimRecovery, executionOutcome } from './recovery.js';
const contract='0x'+'a'.repeat(40), sender='0x'+'b'.repeat(40), hash='0x'+'c'.repeat(64);
const receipt={to_address:contract,statusName:'FINALIZED',resultName:'MAJORITY_AGREE',txExecutionResultName:'FINISHED_WITH_RETURN'};
const claim={claim_id:'rain',status:'FILED',filer:sender};
function setup(){const m=new Map();const storage={getItem:k=>m.get(k)??null,setItem:(k,v)=>m.set(k,v),removeItem:k=>m.delete(k)};return {storage,j:new ClaimRecovery(storage)}}
const submit=(j,wait=async()=>receipt,read=async()=>claim,broadcast=async()=>hash,method='file_claim')=>j.submit(contract,method,['rain'],sender,broadcast,wait,read);
test('finality requires execution and agreement',()=>{
 assert.equal(executionOutcome({statusName:'FINALIZED'}),'unknown');
 assert.equal(executionOutcome({...receipt,resultName:'MAJORITY_DISAGREE'}),'failed');
 assert.equal(executionOutcome({...receipt,txExecutionResultName:'ERROR'}),'failed');
 assert.equal(executionOutcome({...receipt,statusName:'PENDING'}),'pending');assert.equal(executionOutcome(receipt),'success');
 assert.equal(executionOutcome({status_name:'FINALIZED',result:6,consensus_data:{leader_receipt:[{mode:'leader',execution_result:'SUCCESS',result:{status:'return'}}]}}),'success');
});
test('timeout persists through reload and resume never rebroadcasts',async()=>{
 const {j,storage}=setup();let sends=0;
 await assert.rejects(submit(j,async()=>{throw Error('timeout')},undefined,async()=>{sends++;return hash}));
 const reloaded=new ClaimRecovery(storage);await assert.rejects(submit(reloaded),/Resume/);
 await reloaded.resume(contract,async()=>receipt,async()=>claim);assert.equal(sends,1);assert.equal(reloaded.pending(contract),null);
});
test('read failure retains successful transaction for recovery',async()=>{
 const {j}=setup();await assert.rejects(submit(j,undefined,async()=>{throw Error('offline')}));assert.equal(j.pending(contract).hash,hash);
 await j.resume(contract,async()=>receipt,async()=>claim);assert.equal(j.pending(contract),null);
});
test('read-back validates claim identity, filer and assessment state',async()=>{
 for(const bad of [{...claim,claim_id:'other'},{...claim,filer:contract}]){const {j}=setup();await assert.rejects(submit(j,undefined,async()=>bad),/read-back/);assert.ok(j.pending(contract));}
 const {j}=setup();await assert.rejects(submit(j,undefined,async()=>claim,undefined,'assess_claim'),/read-back/);
 await j.resume(contract,async()=>receipt,async()=>({...claim,status:'DECIDED',verdict:'DENIED'}));
});
test('double click during wallet prompt is blocked',async()=>{
 const {j}=setup();let release;const first=submit(j,undefined,undefined,()=>new Promise(r=>release=r));
 await assert.rejects(submit(j),/already running/);release(hash);await first;
});
test('wallet rejection unlocks with no pending transaction',async()=>{
 const {j}=setup();await assert.rejects(submit(j,undefined,undefined,async()=>{throw Error('rejected')}));assert.equal(j.busy,false);assert.equal(j.pending(contract),null);
});
test('wrong recipient stays pending; failed consensus clears the record',async()=>{
 const {j}=setup();await assert.rejects(submit(j,async()=>({...receipt,to_address:sender})),/another contract/);assert.ok(j.pending(contract));
 await assert.rejects(j.resume(contract,async()=>({...receipt,resultName:'MAJORITY_DISAGREE'}),async()=>claim),/without successful/);assert.equal(j.pending(contract),null);
});
test('corrupt storage and quota failure stop before signing',async()=>{
 const {j,storage}=setup();storage.setItem(j.key(contract),'{bad');let sends=0;const broadcast=async()=>{sends++;return hash};
 await assert.rejects(submit(j,undefined,undefined,broadcast));storage.removeItem(j.key(contract));storage.setItem=()=>{throw Error('quota')};await assert.rejects(submit(j,undefined,undefined,broadcast));assert.equal(sends,0);
});
test('storage failure after broadcast keeps an in-memory recovery ID',async()=>{
 const {j,storage}=setup();const save=storage.setItem;storage.setItem=(k,v)=>{if(!k.endsWith(':probe'))throw Error('quota');save(k,v)};
 await assert.rejects(submit(j),/saving failed/);assert.equal(j.pending(contract).hash,hash);await j.resume(contract,async()=>receipt,async()=>claim);
});
test('pending transactions are isolated by deployment',async()=>{
 const {j}=setup();await assert.rejects(submit(j,async()=>{throw Error('timeout')}));assert.equal(j.pending(sender),null);
});

test('incomplete finalized receipt keeps the write blocked',async()=>{
 const {j}=setup();await assert.rejects(submit(j,async()=>({to_address:contract,statusName:'FINALIZED'})),/not yet verified/);assert.ok(j.pending(contract));
});
