import { ethers } from 'ethers';
import * as fs from 'fs/promises';
import path from 'path';

export interface TransactionDetails {
  hash: string; from: string; to: string; value: string; gasUsed: string;
  gasPrice: string; totalCost: string; blockNumber: number; timestamp: number;
}

export interface GasCostSummary {
  totalETHSpent: string; totalGasUsed: string;
  averageGasPrice: string; transactionCount: number;
}

export interface BalanceReport {
  balances: { [address: string]: string }; totalETH: string; timestamp: number;
}

export interface ReportData {
  transactions: TransactionDetails[]; gasCosts?: GasCostSummary;
  balances?: BalanceReport; timestamp: number;
}

export class TestReportGenerator {
  constructor(private provider: ethers.providers.JsonRpcProvider) {}

  async collectTransactionData(txHashes: string[]): Promise<TransactionDetails[]> {
    const details: TransactionDetails[] = [];
    for (const hash of txHashes) {
      try {
        const tx = await this.provider.getTransaction(hash);
        const receipt = await this.provider.getTransactionReceipt(hash);
        const block = await this.provider.getBlock(receipt.blockNumber);
        details.push({
          hash, from: tx.from, to: tx.to || '', value: tx.value.toString(),
          gasUsed: receipt.gasUsed.toString(), gasPrice: tx.gasPrice?.toString() || '0',
          totalCost: receipt.gasUsed.mul(tx.gasPrice || 0).toString(),
          blockNumber: receipt.blockNumber, timestamp: block.timestamp
        });
      } catch (e) { console.error(`Failed tx ${hash}:`, e); }
    }
    return details;
  }

  async calculateGasCosts(transactions: TransactionDetails[]): Promise<GasCostSummary> {
    let totalGas = ethers.BigNumber.from(0), totalCost = ethers.BigNumber.from(0);
    let totalGasPrice = ethers.BigNumber.from(0);
    for (const tx of transactions) {
      totalGas = totalGas.add(tx.gasUsed);
      totalCost = totalCost.add(tx.totalCost);
      totalGasPrice = totalGasPrice.add(tx.gasPrice);
    }
    return {
      totalETHSpent: ethers.utils.formatEther(totalCost),
      totalGasUsed: totalGas.toString(),
      averageGasPrice: transactions.length > 0 ? 
        totalGasPrice.div(transactions.length).toString() : '0',
      transactionCount: transactions.length
    };
  }

  async generateBalanceReport(addresses: string[]): Promise<BalanceReport> {
    const balances: { [address: string]: string } = {};
    let total = ethers.BigNumber.from(0);
    for (const address of addresses) {
      const balance = await this.provider.getBalance(address);
      balances[address.toLowerCase()] = ethers.utils.formatEther(balance);
      total = total.add(balance);
    }
    return { balances, totalETH: ethers.utils.formatEther(total), timestamp: Date.now() };
  }

  async loadTestReports(directory: string): Promise<any[]> {
    const reports: any[] = [];
    const files = await fs.readdir(directory);
    for (const file of files.filter(f => f.endsWith('.json'))) {
      try {
        const content = await fs.readFile(path.join(directory, file), 'utf-8');
        reports.push(JSON.parse(content));
      } catch (e) { console.error(`Failed ${file}:`, e); }
    }
    return reports;
  }

  async generateMarkdownReport(data: ReportData): string {
    const date = new Date(data.timestamp).toISOString();
    let md = `# Test Report\n\n**Generated:** ${date}\n\n`;
    md += `## Transaction Summary\n\n| Hash | From | Value (ETH) | Gas Used |\n`;
    md += `|------|------|-------------|----------|\n`;
    for (const tx of data.transactions) {
      const hash = tx.hash.substring(0, 10) + '...';
      const from = tx.from.substring(0, 10) + '...';
      const value = ethers.utils.formatEther(tx.value);
      md += `| ${hash} | ${from} | ${value} | ${tx.gasUsed} |\n`;
    }
    if (data.gasCosts) {
      md += `\n## Gas Costs\n\n`;
      md += `- **Total ETH Spent:** ${data.gasCosts.totalETHSpent}\n`;
      md += `- **Total Gas Used:** ${data.gasCosts.totalGasUsed}\n`;
      md += `- **Transaction Count:** ${data.gasCosts.transactionCount}\n`;
    }
    return md;
  }

  async generateCSVReport(data: ReportData): string {
    const headers = 'hash,from,to,value,gasUsed,gasPrice,totalCost,blockNumber,timestamp\n';
    const rows = data.transactions.map(tx => 
      `${tx.hash},${tx.from},${tx.to},${tx.value},${tx.gasUsed},${tx.gasPrice},${tx.totalCost},${tx.blockNumber},${tx.timestamp}`
    ).join('\n');
    return headers + rows;
  }

  async generateFullReport(): Promise<void> {
    console.log('Generating comprehensive test report...');
    const reports = await this.loadTestReports('test-reports');
    const allTxHashes: string[] = [];
    
    reports.forEach(report => {
      if (report.transactions?.length) {
        report.transactions.forEach((tx: any) => {
          if (tx.txHash) allTxHashes.push(tx.txHash);
        });
      }
      if (report.ethJobs?.length) {
        report.ethJobs.forEach((job: any) => {
          if (job.tx) allTxHashes.push(job.tx);
        });
      }
      if (report.usdcJobs?.length) {
        report.usdcJobs.forEach((job: any) => {
          if (job.tx) allTxHashes.push(job.tx);
        });
      }
    });
    
    const uniqueTxHashes = [...new Set(allTxHashes)];
    const transactions = await this.collectTransactionData(uniqueTxHashes);
    const gasCosts = await this.calculateGasCosts(transactions);
    const reportData: ReportData = {
      transactions, gasCosts, timestamp: Date.now()
    };
    
    const markdown = `# Comprehensive Test Report\n\n## Summary\n- Reports Analyzed: ${reports.length}\n- Transactions: ${transactions.length}\n- Total Gas Cost: ${gasCosts.totalETHSpent} ETH\n\n` + 
      await this.generateMarkdownReport(reportData);
    const csv = await this.generateCSVReport(reportData);
    
    await fs.writeFile('test-reports/FULL_REPORT.md', markdown);
    await fs.writeFile('test-reports/transactions.csv', csv);
    console.log('Reports generated successfully!');
  }
}