import { ethers } from 'ethers';
interface ProofData { jobId: number; prompt: string; response: string; tokensProven: number; }
interface ProofStatus { success: boolean; txHash: string; gasUsed: string; confirmations: number; }

export class ProofHandler {
  private provider: ethers.JsonRpcProvider;
  private contractAddress: string;
  private hostPrivateKey: string;

  constructor(rpcUrl: string, contractAddress: string, hostPrivateKey: string) {
    this.provider = new ethers.JsonRpcProvider(rpcUrl);
    this.contractAddress = contractAddress;
    this.hostPrivateKey = hostPrivateKey;
  }

  async generateProof(data: ProofData): Promise<string> {
    const proofBytes = ethers.randomBytes(256); // mock EZKL proof
    const model_hash = ethers.keccak256(ethers.toUtf8Bytes('llama-2-7b'));
    const input_hash = ethers.keccak256(ethers.toUtf8Bytes(data.prompt));
    const output_hash = ethers.keccak256(ethers.toUtf8Bytes(data.response));
    const combinedProof = ethers.concat([
      proofBytes,
      ethers.getBytes(model_hash).slice(0, 32),
      ethers.getBytes(input_hash).slice(0, 32),
      ethers.getBytes(output_hash).slice(0, 32)
    ]);
    return ethers.hexlify(combinedProof);
  }

  async submitProof(jobId: number, proof: string, tokensProven: number): Promise<ProofStatus> {
    const hostSigner = new ethers.Wallet(this.hostPrivateKey, this.provider);
    const abi = ['function submitProofOfWork(uint256 jobId, bytes proof, uint256 tokensProven) returns (bool)'];
    const contract = new ethers.Contract(this.contractAddress, abi, hostSigner);
    
    try {
      const tx = await contract.submitProofOfWork(jobId, proof, tokensProven, { gasLimit: 300000 });
      const receipt = await tx.wait();
      return {
        success: receipt.status === 1,
        txHash: tx.hash,
        gasUsed: receipt.gasUsed.toString(),
        confirmations: receipt.confirmations
      };
    } catch (error: any) {
      throw new Error(`Proof submission failed: ${error.message}`);
    }
  }

  async submitProofForJob(data: ProofData): Promise<ProofStatus> {
    const proof = await this.generateProof(data);
    return await this.submitProof(data.jobId, proof, data.tokensProven);
  }
}