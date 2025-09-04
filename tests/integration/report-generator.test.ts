import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { TestReportGenerator } from './report-generator';
import { ethers } from 'ethers';
import { config as loadEnv } from 'dotenv';
import * as fs from 'fs/promises';
import path from 'path';

loadEnv({ path: '.env.test' });

describe('Test Report Generator', () => {
  let reportGenerator: TestReportGenerator;
  let provider: ethers.providers.JsonRpcProvider;

  beforeAll(() => {
    provider = new ethers.providers.JsonRpcProvider(
      process.env.RPC_URL_BASE_SEPOLIA,
      { chainId: 84532, name: 'base-sepolia' }
    );
    reportGenerator = new TestReportGenerator(provider);
  });

  it('should collect transaction data from hashes', async () => {
    // Use real transaction hash from stress test
    const txHashes = [
      '0xd37be77c67e7553f51b4f2c5384678aa426a1d439d7c7ecdbe3f75ca918751b0'
    ];
    
    const details = await reportGenerator.collectTransactionData(txHashes);
    
    expect(details.length).toBe(1);
    expect(details[0].hash).toBe(txHashes[0]);
    expect(details[0].gasUsed).toBeDefined();
    expect(details[0].from.toLowerCase()).toBe(process.env.TEST_USER_1_ADDRESS?.toLowerCase());
  }, 30000);

  it('should calculate gas costs summary', async () => {
    const transactions = [
      {
        hash: '0xtest1',
        from: '0xuser',
        to: '0xcontract',
        value: '1000000000000000',
        gasUsed: '21000',
        gasPrice: '1000000000',
        totalCost: '21000000000000',
        blockNumber: 123456,
        timestamp: Date.now() / 1000
      },
      {
        hash: '0xtest2',
        from: '0xuser',
        to: '0xcontract',
        value: '2000000000000000',
        gasUsed: '25000',
        gasPrice: '1000000000',
        totalCost: '25000000000000',
        blockNumber: 123457,
        timestamp: Date.now() / 1000
      }
    ];
    
    const summary = await reportGenerator.calculateGasCosts(transactions as any);
    
    expect(summary.transactionCount).toBe(2);
    expect(summary.totalGasUsed).toBe('46000');
    expect(parseFloat(summary.totalETHSpent)).toBeGreaterThan(0);
  });

  it('should generate balance report for addresses', async () => {
    const addresses = [
      process.env.TEST_USER_1_ADDRESS!,
      process.env.TEST_HOST_1_ADDRESS!
    ];
    
    const report = await reportGenerator.generateBalanceReport(addresses);
    
    expect(report.balances).toHaveProperty(addresses[0].toLowerCase());
    expect(report.balances).toHaveProperty(addresses[1].toLowerCase());
    expect(report.totalETH).toBeDefined();
  }, 30000);

  it('should load existing test reports', async () => {
    const reports = await reportGenerator.loadTestReports('test-reports');
    
    expect(reports.length).toBeGreaterThan(0);
    expect(reports[0]).toHaveProperty('timestamp');
  });

  it('should generate markdown report', async () => {
    const data = {
      transactions: [
        { 
          hash: '0xd37be77c67e7553f51b4f2c5384678aa426a1d439d7c7ecdbe3f75ca918751b0',
          from: '0x8D642988E3e7b6DB15b6058461d5563835b04bF6',
          to: '0xD937c594682Fe74E6e3d06239719805C04BE804A',
          value: '500000000000000',
          gasUsed: '359168',
          gasPrice: '1000000000',
          totalCost: '359168000000000',
          blockNumber: 30651523,
          timestamp: 1756967747
        }
      ],
      gasCosts: {
        totalETHSpent: '0.000359168',
        totalGasUsed: '359168',
        averageGasPrice: '1',
        transactionCount: 1
      },
      timestamp: Date.now()
    };
    
    const markdown = await reportGenerator.generateMarkdownReport(data as any);
    
    expect(markdown).toContain('# Test Report');
    expect(markdown).toContain('## Transaction Summary');
    expect(markdown).toContain('## Gas Costs');
    expect(markdown).toContain('0xd37be');
  });

  it('should generate CSV report', async () => {
    const data = {
      transactions: [
        { 
          hash: '0xd37be77c67e7553f51b4f2c5384678aa426a1d439d7c7ecdbe3f75ca918751b0',
          from: '0x8D642988E3e7b6DB15b6058461d5563835b04bF6',
          to: '0xD937c594682Fe74E6e3d06239719805C04BE804A',
          value: '500000000000000',
          gasUsed: '359168',
          gasPrice: '1000000000',
          totalCost: '359168000000000',
          blockNumber: 30651523,
          timestamp: 1756967747
        }
      ]
    };
    
    const csv = await reportGenerator.generateCSVReport(data as any);
    
    expect(csv).toContain('hash,from,to,value,gasUsed');
    expect(csv).toContain('0xd37be77c67e7553f51b4f2c5384678aa426a1d439d7c7ecdbe3f75ca918751b0');
    expect(csv.split('\n').length).toBeGreaterThan(1);
  });

  it('should generate full comprehensive report', async () => {
    const reportPath = path.join('test-reports', 'FULL_REPORT.md');
    const csvPath = path.join('test-reports', 'transactions.csv');
    
    // Clean up any existing reports
    try {
      await fs.unlink(reportPath);
      await fs.unlink(csvPath);
    } catch (e) {
      // Files might not exist
    }
    
    await reportGenerator.generateFullReport();
    
    // Verify reports were created
    const reportExists = await fs.access(reportPath).then(() => true).catch(() => false);
    const csvExists = await fs.access(csvPath).then(() => true).catch(() => false);
    
    expect(reportExists).toBe(true);
    expect(csvExists).toBe(true);
    
    // Verify content
    const reportContent = await fs.readFile(reportPath, 'utf-8');
    expect(reportContent).toContain('# Comprehensive Test Report');
    expect(reportContent).toContain('## Summary');
  }, 60000);
});