// A journal entry is retained until both execution and claim read-back are verified.
export const CHAIN_ID = 61999;
export function address(value) {
  if (!/^0x[0-9a-fA-F]{40}$/.test(value || '')) throw Error('Enter a valid contract address.');
  return value.toLowerCase();
}
export function executionOutcome(receipt) {
  const status = receipt.statusName || receipt.status_name;
  const vote = receipt.resultName || receipt.result_name ||
    ['IDLE','AGREE','DISAGREE','TIMEOUT','DETERMINISTIC_VIOLATION','NO_MAJORITY','MAJORITY_AGREE','MAJORITY_DISAGREE'][receipt.result];
  const leaders = receipt.consensus_data?.leader_receipt;
  const leader = (Array.isArray(leaders) ? leaders : [leaders]).find(r => r?.mode === 'leader');
  const execution = receipt.txExecutionResultName || receipt.tx_execution_result_name;
  const returned = execution ? execution === 'FINISHED_WITH_RETURN' :
    (leader?.execution_result === 'SUCCESS' && leader?.result?.status === 'return');
  if (['CANCELED','UNDETERMINED'].includes(status)) return 'failed';
  if (status !== 'FINALIZED') return 'pending';
  if (['DISAGREE','MAJORITY_DISAGREE','NO_MAJORITY','TIMEOUT','DETERMINISTIC_VIOLATION'].includes(vote)) return 'failed';
  if ((execution && execution !== 'FINISHED_WITH_RETURN') || (leader?.execution_result && !returned)) return 'failed';
  if (!returned || !vote) return 'unknown';
  return ['AGREE','MAJORITY_AGREE','SUCCESS'].includes(vote) ? 'success' : 'unknown';
}
export class ClaimRecovery {
  constructor(storage) { this.storage = storage; this.busy = false; this.unsaved = new Map(); }
  key(contract) { return `parashield:pending:${CHAIN_ID}:${address(contract)}`; }
  pending(contract) {
    const key = this.key(contract);
    if (this.unsaved.has(key)) return this.unsaved.get(key);
    const raw = this.storage.getItem(key);
    if (!raw) return null;
    let tx;
    try { tx = JSON.parse(raw); } catch { throw Error('Saved transaction is unreadable. Restore browser storage before sending.'); }
    if (!/^0x[0-9a-fA-F]{64}$/.test(tx.hash || '') || tx.contract !== address(contract) ||
        tx.chain !== CHAIN_ID || !['file_claim','assess_claim'].includes(tx.method) ||
        !/^[A-Za-z0-9_-]{1,64}$/.test(tx.claimId || '') ||
        !/^0x[0-9a-fA-F]{40}$/.test(tx.sender || '')) throw Error('Saved transaction is invalid. Restore browser storage before sending.');
    return tx;
  }
  async exclusive(action) {
    if (this.busy) throw Error('An action is already running.');
    this.busy = true;
    try { return await action(); } finally { this.busy = false; }
  }
  async submit(contract, method, args, sender, broadcast, wait, read) {
    return this.exclusive(async () => {
      const target = address(contract);
      if (this.pending(target)) throw Error('Resume the saved transaction before sending another.');
      const key = this.key(target);
      this.storage.setItem(key + ':probe', '1');
      this.storage.removeItem(key + ':probe');
      const submitted = await broadcast();
      const hash = typeof submitted === 'string' ? submitted : submitted.hash;
      sender = submitted.sender || sender;
      if (!/^0x[0-9a-fA-F]{64}$/.test(hash || '')) throw Error('No transaction ID returned. Inspect wallet activity before retrying.');
      const tx = { hash, contract: target, chain: CHAIN_ID, method, claimId: args[0], sender, submittedAt: new Date().toISOString() };
      this.unsaved.set(key, tx);
      try { this.storage.setItem(key, JSON.stringify(tx)); }
      catch { throw Error(`Submitted ${hash}; saving failed. Keep this page open and resume. Do not resubmit.`); }
      return this.confirm(tx, wait, read);
    });
  }
  async resume(contract, wait, read) {
    return this.exclusive(async () => {
      const tx = this.pending(contract);
      if (!tx) throw Error('No pending transaction for this contract.');
      return this.confirm(tx, wait, read);
    });
  }
  async confirm(tx, wait, read) {
    const receipt = await wait(tx.hash);
    const recipient = receipt.to_address || receipt.recipient;
    if (!recipient || address(recipient) !== tx.contract) throw Error('Receipt belongs to another contract; pending record retained.');
    const outcome = executionOutcome(receipt);
    if (outcome === 'pending' || outcome === 'unknown') throw Error('Execution is not yet verified. Resume tracking; do not resubmit.');
    if (outcome === 'failed') {
      this.clear(tx);
      throw Error('Transaction ended without successful execution and consensus. No success is recorded.');
    }
    const raw = await read(tx.contract, tx.claimId);
    const claim = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (claim?.claim_id !== tx.claimId ||
        (tx.method === 'file_claim' && (!['FILED','DECIDED'].includes(claim.status) || claim.filer?.toLowerCase() !== tx.sender.toLowerCase())) ||
        (tx.method === 'assess_claim' && (claim.status !== 'DECIDED' || !['APPROVED','DENIED','UNVERIFIED'].includes(claim.verdict))))
      throw Error('Claim read-back does not confirm the action. Pending record retained; resume later.');
    this.clear(tx);
    return { tx, claim };
  }
  clear(tx) { this.storage.removeItem(this.key(tx.contract)); this.unsaved.delete(this.key(tx.contract)); }
}
