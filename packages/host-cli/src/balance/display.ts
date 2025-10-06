/**
 * Balance display module
 * Formats and displays balance information
 */

import {
  getETHBalance,
  getFABBalance,
  getStakingStatus,
  formatETHBalance,
  formatFABBalance
} from './checker';
import {
  checkAllRequirements,
  MINIMUM_REQUIREMENTS,
  formatRequirementsReport,
  getRequirementsStatus
} from './requirements';

/**
 * ANSI color codes for terminal output
 */
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

/**
 * Apply color to text if enabled
 */
function colorize(text: string, color: string, useColors: boolean): string {
  if (!useColors) return text;
  return `${color}${text}${colors.reset}`;
}

/**
 * Display all balances clearly
 */
export async function displayBalances(useColors = false): Promise<string> {
  const lines: string[] = [];

  // Header
  lines.push(colorize('╔════════════════════════════════════╗', colors.cyan, useColors));
  lines.push(colorize('║        Current Balances            ║', colors.cyan, useColors));
  lines.push(colorize('╚════════════════════════════════════╝', colors.cyan, useColors));
  lines.push('');

  try {
    // ETH Balance
    const ethBalance = await getETHBalance();
    const ethFormatted = formatETHBalance(ethBalance, 6);
    const ethColor = ethBalance >= MINIMUM_REQUIREMENTS.ETH ? colors.green : colors.red;
    lines.push(`${colorize('ETH:', colors.bright, useColors)} ${colorize(ethFormatted, ethColor, useColors)}`);

    // FAB Balance
    const fabBalance = await getFABBalance();
    const fabFormatted = formatFABBalance(fabBalance, 2);
    const fabColor = fabBalance >= MINIMUM_REQUIREMENTS.FAB ? colors.green : colors.red;
    lines.push(`${colorize('FAB:', colors.bright, useColors)} ${colorize(fabFormatted, fabColor, useColors)}`);

    // Staking Status
    const staking = await getStakingStatus();
    const stakedFormatted = formatFABBalance(staking.stakedAmount, 0);
    const stakingColor = staking.isStaked ? colors.green : colors.yellow;
    lines.push(`${colorize('Staked:', colors.bright, useColors)} ${colorize(stakedFormatted, stakingColor, useColors)}`);

  } catch (error: any) {
    lines.push(colorize(`Error: ${error.message}`, colors.red, useColors));
  }

  return lines.join('\n');
}

/**
 * Display requirements status
 */
export async function displayRequirements(useColors = false, forRegistration = false): Promise<string> {
  const lines: string[] = [];

  // Header
  lines.push(colorize('╔════════════════════════════════════╗', colors.blue, useColors));
  lines.push(colorize('║        Host Requirements           ║', colors.blue, useColors));
  lines.push(colorize('╚════════════════════════════════════════╝', colors.blue, useColors));
  lines.push('');

  // Display minimum requirements
  lines.push(colorize('Minimum Requirements:', colors.bright, useColors));
  lines.push(`  • Minimum ETH: ${formatETHBalance(MINIMUM_REQUIREMENTS.ETH, 4)}`);
  lines.push(`  • Minimum FAB: ${formatFABBalance(MINIMUM_REQUIREMENTS.FAB, 0)}`);
  if (!forRegistration) {
    lines.push(`  • Required Stake: ${formatFABBalance(MINIMUM_REQUIREMENTS.STAKING, 0)}`);
  }
  lines.push('');

  try {
    // Check requirements (wallet balances only for registration, full check for existing hosts)
    const { checkRegistrationRequirements } = await import('./requirements');
    const requirements = forRegistration
      ? await checkRegistrationRequirements()
      : await checkAllRequirements();

    // Status line
    lines.push(colorize('Status:', colors.bright, useColors));

    if (requirements.meetsAll) {
      lines.push(colorize('  ✓ All requirements met', colors.green, useColors));
      lines.push(colorize('  Ready to operate as host', colors.green, useColors));
    } else {
      lines.push(colorize('  ✗ Requirements not met', colors.red, useColors));
      lines.push('');
      lines.push(colorize('  Missing:', colors.yellow, useColors));
      requirements.errors.forEach(error => {
        lines.push(`    • ${error}`);
      });
    }

  } catch (error: any) {
    lines.push(colorize(`Error: ${error.message}`, colors.red, useColors));
  }

  return lines.join('\n');
}

/**
 * Display comprehensive balance report
 */
export async function displayFullReport(useColors = false): Promise<string> {
  const sections: string[] = [];

  // Get balances
  sections.push(await displayBalances(useColors));
  sections.push('');

  // Get requirements
  sections.push(await displayRequirements(useColors));

  return sections.join('\n');
}

/**
 * Display requirements status table
 */
export async function displayRequirementsTable(useColors = false): Promise<string> {
  const status = await getRequirementsStatus();

  if (useColors) {
    // Colorized version
    const lines = formatRequirementsReport(status).split('\n');
    return lines.map(line => {
      if (line.includes('✓')) {
        return line.replace(/✓/g, colorize('✓', colors.green, true));
      } else if (line.includes('✗')) {
        return line.replace(/✗/g, colorize('✗', colors.red, true));
      } else if (line.startsWith('═') || line.startsWith('─')) {
        return colorize(line, colors.cyan, true);
      } else if (line.includes('Requirements Status')) {
        return colorize(line, colors.bright, true);
      } else if (line.includes('Ready to operate')) {
        return colorize(line, colors.green, true);
      } else if (line.includes('Cannot operate')) {
        return colorize(line, colors.red, true);
      }
      return line;
    }).join('\n');
  }

  return formatRequirementsReport(status);
}