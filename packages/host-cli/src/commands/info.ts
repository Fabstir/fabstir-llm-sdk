import { Command } from 'commander';
import { ethers } from 'ethers';
import chalk from 'chalk';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { getWallet } from '../utils/wallet';

// Load NodeRegistry ABI - read from file system
const abiPath = path.resolve(__dirname, '../../../sdk-core/src/contracts/abis/NodeRegistry.json');
const NodeRegistryABI = JSON.parse(fs.readFileSync(abiPath, 'utf-8'));

// ERC20 ABI for FAB token balance
const ERC20_ABI = [
  'function balanceOf(address owner) view returns (uint256)',
  'function symbol() view returns (string)'
];

// Load environment variables
const envPath = path.resolve(process.cwd(), '.env.test');
dotenv.config({ path: envPath });

interface NodeFullInfo {
  operator: string;
  stakedAmount: bigint;
  active: boolean;
  metadata: string;
  apiUrl: string;
  modelIds: string[];
}

interface HostDisplayInfo {
  address: string;
  isActive: boolean;
  isRegistered: boolean;
  stakedAmount: string;
  apiUrl: string;
  metadata: any;
  models: string[];
  ethBalance: string;
  fabBalance: string;
}

export function registerInfoCommand(program: Command): void {
  program
    .command('info')
    .description('Display complete host information from blockchain')
    .option('-k, --private-key <key>', 'Private key to use (otherwise uses wallet file)')
    .option('-a, --address <address>', 'Check specific address (default: your address)')
    .option('-j, --json', 'Output in JSON format')
    .option('-r, --rpc-url <url>', 'RPC URL', process.env.RPC_URL_BASE_SEPOLIA)
    .action(async (options) => {
      try {
        // Get the wallet
        const wallet = await getWallet(options.privateKey);

        // Connect to provider
        const provider = new ethers.JsonRpcProvider(options.rpcUrl);
        const signer = wallet.connect(provider);
        const myAddress = await signer.getAddress();

        // Determine which address to check
        const checkAddress = options.address || myAddress;

        // Validate address format
        if (!ethers.isAddress(checkAddress)) {
          throw new Error(`Invalid address format: ${checkAddress}`);
        }

        if (!options.json) {
          console.log(chalk.blue('\n📊 Fetching Host Information...\n'));
        }

        // Get NodeRegistry contract
        const nodeRegistryAddress = process.env.CONTRACT_NODE_REGISTRY;
        if (!nodeRegistryAddress) {
          throw new Error('CONTRACT_NODE_REGISTRY not found in environment');
        }

        const nodeRegistry = new ethers.Contract(
          nodeRegistryAddress,
          NodeRegistryABI,
          provider
        );

        // Get node full info
        let nodeInfo: NodeFullInfo;
        try {
          const result = await nodeRegistry.getNodeFullInfo(checkAddress);
          nodeInfo = {
            operator: result[0],
            stakedAmount: result[1],
            active: result[2],
            metadata: result[3],
            apiUrl: result[4],
            modelIds: result[5] || []
          };
        } catch (error) {
          // Fallback to basic node info if getNodeFullInfo is not available
          const nodeData = await nodeRegistry.nodes(checkAddress);
          nodeInfo = {
            operator: nodeData.operator,
            stakedAmount: nodeData.stakedAmount,
            active: nodeData.active,
            metadata: nodeData.metadata,
            apiUrl: nodeData.apiUrl,
            modelIds: []
          };
        }

        // Check if registered
        const isRegistered = nodeInfo.operator !== ethers.ZeroAddress;

        // Get ETH balance
        const ethBalance = await provider.getBalance(checkAddress);

        // Get FAB balance
        let fabBalance = BigInt(0);
        const fabTokenAddress = process.env.CONTRACT_FAB_TOKEN;
        if (fabTokenAddress) {
          const fabToken = new ethers.Contract(fabTokenAddress, ERC20_ABI, provider);
          try {
            fabBalance = await fabToken.balanceOf(checkAddress);
          } catch (e) {
            // Ignore if FAB token doesn't exist
          }
        }

        // Parse metadata
        let parsedMetadata = {};
        try {
          if (nodeInfo.metadata && nodeInfo.metadata.startsWith('{')) {
            parsedMetadata = JSON.parse(nodeInfo.metadata);
          }
        } catch (e) {
          // Keep empty object if parsing fails
        }

        // Prepare display info
        const displayInfo: HostDisplayInfo = {
          address: checkAddress,
          isActive: nodeInfo.active,
          isRegistered: isRegistered,
          stakedAmount: ethers.formatUnits(nodeInfo.stakedAmount, 18),
          apiUrl: nodeInfo.apiUrl,
          metadata: parsedMetadata,
          models: nodeInfo.modelIds.map(id => id),
          ethBalance: ethers.formatEther(ethBalance),
          fabBalance: ethers.formatUnits(fabBalance, 18)
        };

        // Output results
        if (options.json) {
          console.log(JSON.stringify(displayInfo, null, 2));
        } else {
          displayFormattedInfo(displayInfo, checkAddress === myAddress);
        }

      } catch (error: any) {
        if (options.json) {
          console.log(JSON.stringify({ error: error.message }));
        } else {
          console.error(chalk.red('\n❌ Info failed:'), error.message);
        }
        process.exit(1);
      }
    });
}

function displayFormattedInfo(info: HostDisplayInfo, isOwnAddress: boolean) {
  console.log(chalk.cyan('═══════════════════════════════════════════'));
  console.log(chalk.bold.cyan('           🖥️  Host Information'));
  console.log(chalk.cyan('═══════════════════════════════════════════\n'));

  // Address and ownership
  console.log(chalk.gray('Address:      '), chalk.bold(info.address));
  if (!isOwnAddress) {
    console.log(chalk.gray('              '), chalk.yellow('(Viewing other address)'));
  }

  // Registration status
  console.log(chalk.gray('Status:       '), info.isRegistered
    ? (info.isActive
      ? chalk.green('● Active')
      : chalk.yellow('○ Inactive'))
    : chalk.red('✗ Not Registered')
  );

  if (!info.isRegistered) {
    console.log('\n' + chalk.yellow('ℹ️  This address is not registered as a host node'));
    console.log(chalk.gray('   Use "fabstir-host register" to register as a host'));
  } else {
    // Staking info
    console.log(chalk.gray('Staked:       '), chalk.bold(`${info.stakedAmount} FAB`));

    // API URL
    console.log(chalk.gray('API URL:      '), info.apiUrl || chalk.gray('Not set'));

    // Models
    if (info.models.length > 0) {
      console.log(chalk.gray('Models:       '), info.models.length, 'registered');
      info.models.forEach((model, i) => {
        console.log(chalk.gray(`  ${i + 1}.`), model);
      });
    } else {
      console.log(chalk.gray('Models:       '), chalk.gray('None'));
    }

    // Metadata
    if (Object.keys(info.metadata).length > 0) {
      console.log(chalk.gray('\nMetadata:'));

      // Hardware info
      if (info.metadata.hardware) {
        console.log(chalk.gray('  Hardware:'));
        if (info.metadata.hardware.gpu) {
          console.log(chalk.gray('    GPU:     '), info.metadata.hardware.gpu);
        }
        if (info.metadata.hardware.vram) {
          console.log(chalk.gray('    VRAM:    '), `${info.metadata.hardware.vram} GB`);
        }
        if (info.metadata.hardware.ram) {
          console.log(chalk.gray('    RAM:     '), `${info.metadata.hardware.ram} GB`);
        }
      }

      // Capabilities
      if (info.metadata.capabilities) {
        console.log(chalk.gray('  Capabilities:'),
          Array.isArray(info.metadata.capabilities)
            ? info.metadata.capabilities.join(', ')
            : info.metadata.capabilities
        );
      }

      // Location
      if (info.metadata.location) {
        console.log(chalk.gray('  Location:   '), info.metadata.location);
      }

      // Pricing
      if (info.metadata.costPerToken !== undefined) {
        console.log(chalk.gray('  Price/Token:'), `$${info.metadata.costPerToken}`);
      }

      // Concurrency
      if (info.metadata.maxConcurrent) {
        console.log(chalk.gray('  Max Jobs:   '), info.metadata.maxConcurrent);
      }
    }
  }

  // Balances
  console.log(chalk.gray('\nBalances:'));
  console.log(chalk.gray('  ETH:        '), `${info.ethBalance} ETH`);
  console.log(chalk.gray('  FAB:        '), `${info.fabBalance} FAB`);

  console.log(chalk.cyan('\n═══════════════════════════════════════════'));
}