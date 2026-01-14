// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * ProofHandler - Security Audit Migration
 *
 * Updated to use the new 5-param submitProofOfWork signature:
 * submitProofOfWork(uint256 jobId, uint256 tokensClaimed, bytes32 proofHash, bytes signature, string proofCID)
 *
 * The contract now requires ECDSA signatures from the host to verify proof submissions.
 */

import { ethers } from 'ethers';

interface ProofData {
  jobId: number;
  prompt: string;
  response: string;
  tokensProven: number;
  proofCID: string;  // S5 CID for proof storage
}

interface ProofStatus {
  success: boolean;
  txHash: string;
  gasUsed: string;
  confirmations: number;
}

interface SignedProof {
  proofHash: string;
  signature: string;
  proofCID: string;
}

export class ProofHandler {
  private provider: ethers.JsonRpcProvider;
  private contractAddress: string;
  private hostPrivateKey: string;

  constructor(rpcUrl: string, contractAddress: string, hostPrivateKey: string) {
    this.provider = new ethers.JsonRpcProvider(rpcUrl);
    this.contractAddress = contractAddress;
    this.hostPrivateKey = hostPrivateKey;
  }

  /**
   * Generate and sign proof data for submission
   *
   * @param data - Proof data including prompt, response, and token count
   * @returns SignedProof with proofHash, signature, and proofCID
   */
  async generateAndSignProof(data: ProofData): Promise<SignedProof> {
    // Generate proof data (model + input + output hashes)
    const model_hash = ethers.keccak256(ethers.toUtf8Bytes('llama-2-7b'));
    const input_hash = ethers.keccak256(ethers.toUtf8Bytes(data.prompt));
    const output_hash = ethers.keccak256(ethers.toUtf8Bytes(data.response));

    // Combine proof components
    const proofData = ethers.concat([
      ethers.getBytes(model_hash),
      ethers.getBytes(input_hash),
      ethers.getBytes(output_hash)
    ]);

    // Get host wallet
    const hostSigner = new ethers.Wallet(this.hostPrivateKey, this.provider);
    const hostAddress = await hostSigner.getAddress();

    // Generate proofHash
    const proofHash = ethers.keccak256(proofData);

    // Create data hash for signing: keccak256(proofHash, hostAddress, tokensClaimed)
    const dataHash = ethers.keccak256(
      ethers.solidityPacked(
        ['bytes32', 'address', 'uint256'],
        [proofHash, hostAddress, BigInt(data.tokensProven)]
      )
    );

    // Sign with EIP-191 prefix (65-byte signature)
    const signature = await hostSigner.signMessage(ethers.getBytes(dataHash));

    return {
      proofHash,
      signature,
      proofCID: data.proofCID
    };
  }

  /**
   * Submit proof to the contract with ECDSA signature
   *
   * Security Audit: Uses new 5-param signature
   */
  async submitProof(
    jobId: number,
    proofHash: string,
    signature: string,
    tokensProven: number,
    proofCID: string
  ): Promise<ProofStatus> {
    const hostSigner = new ethers.Wallet(this.hostPrivateKey, this.provider);

    // New 5-param ABI for security audit
    const abi = [
      'function submitProofOfWork(uint256 jobId, uint256 tokensClaimed, bytes32 proofHash, bytes signature, string proofCID)'
    ];
    const contract = new ethers.Contract(this.contractAddress, abi, hostSigner);

    try {
      const tx = await contract.submitProofOfWork(
        jobId,
        tokensProven,
        proofHash,
        signature,
        proofCID,
        { gasLimit: 300000 }
      );
      const receipt = await tx.wait(3); // Wait for 3 confirmations

      return {
        success: receipt.status === 1,
        txHash: tx.hash,
        gasUsed: receipt.gasUsed.toString(),
        confirmations: receipt.confirmations
      };
    } catch (error: any) {
      // Handle specific error types from security audit
      const errorMessage = error.message || '';
      if (errorMessage.includes('Invalid signature length')) {
        throw new Error('Proof submission failed: Invalid signature length (must be 65 bytes)');
      } else if (errorMessage.includes('Invalid proof signature')) {
        throw new Error('Proof submission failed: Invalid proof signature (signer must match session.host)');
      } else if (errorMessage.includes('Host not registered')) {
        throw new Error('Proof submission failed: Host not registered');
      } else if (errorMessage.includes('Proof already submitted')) {
        throw new Error('Proof submission failed: Proof already submitted (replay attack detected)');
      }
      throw new Error(`Proof submission failed: ${error.message}`);
    }
  }

  /**
   * Convenience method: Generate proof, sign it, and submit in one call
   */
  async submitProofForJob(data: ProofData): Promise<ProofStatus> {
    const { proofHash, signature, proofCID } = await this.generateAndSignProof(data);
    return await this.submitProof(data.jobId, proofHash, signature, data.tokensProven, proofCID);
  }

  // ============= Legacy method for backward compatibility =============

  /**
   * @deprecated Use generateAndSignProof instead
   * Legacy method that only generates proof bytes (no signature)
   */
  async generateProof(data: ProofData): Promise<string> {
    console.warn('DEPRECATED: generateProof() is deprecated. Use generateAndSignProof() for security audit compliance.');
    const model_hash = ethers.keccak256(ethers.toUtf8Bytes('llama-2-7b'));
    const input_hash = ethers.keccak256(ethers.toUtf8Bytes(data.prompt));
    const output_hash = ethers.keccak256(ethers.toUtf8Bytes(data.response));
    const combinedProof = ethers.concat([
      ethers.getBytes(model_hash),
      ethers.getBytes(input_hash),
      ethers.getBytes(output_hash)
    ]);
    return ethers.hexlify(combinedProof);
  }
}
