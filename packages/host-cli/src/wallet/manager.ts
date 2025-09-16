import { Wallet, HDNodeWallet, Mnemonic } from 'ethers';

export async function generateWallet(): Promise<HDNodeWallet> {
  return Wallet.createRandom();
}

export async function generateWalletWithEntropy(entropy: string): Promise<HDNodeWallet> {
  if (!entropy.match(/^0x[a-fA-F0-9]{32}$/)) {
    throw new Error('Invalid entropy');
  }
  const mnemonic = Mnemonic.fromEntropy(entropy);
  return HDNodeWallet.fromMnemonic(mnemonic);
}

export async function deriveWalletFromMnemonic(
  mnemonicPhrase: string,
  path: string = "m/44'/60'/0'/0/0"
): Promise<HDNodeWallet> {
  try {
    const mnemonic = Mnemonic.fromPhrase(mnemonicPhrase.trim());
    return HDNodeWallet.fromMnemonic(mnemonic, path);
  } catch (error) {
    throw new Error('Invalid mnemonic');
  }
}

export async function validateWallet(wallet: { address: string; privateKey: string }): Promise<boolean> {
  try {
    if (!wallet.address.match(/^0x[a-fA-F0-9]{40}$/)) {
      return false;
    }
    if (!wallet.privateKey.match(/^0x[a-fA-F0-9]{64}$/)) {
      return false;
    }
    const recoveredWallet = new Wallet(wallet.privateKey);
    return recoveredWallet.address === wallet.address;
  } catch {
    return false;
  }
}

export async function importFromPrivateKey(privateKey: string): Promise<Wallet> {
  try {
    const cleanKey = privateKey.trim();
    const keyWithPrefix = cleanKey.startsWith('0x') ? cleanKey : `0x${cleanKey}`;

    if (!keyWithPrefix.match(/^0x[a-fA-F0-9]{64}$/)) {
      throw new Error('Invalid private key');
    }

    return new Wallet(keyWithPrefix);
  } catch (error) {
    throw new Error('Invalid private key');
  }
}

export async function importFromMnemonic(
  mnemonicPhrase: string,
  path: string = "m/44'/60'/0'/0/0"
): Promise<HDNodeWallet> {
  try {
    const cleanMnemonic = mnemonicPhrase.trim().replace(/\s+/g, ' ');
    const mnemonic = Mnemonic.fromPhrase(cleanMnemonic);
    return HDNodeWallet.fromMnemonic(mnemonic, path);
  } catch (error) {
    throw new Error('Invalid mnemonic');
  }
}

export async function importFromJSON(json: string, password: string): Promise<Wallet | HDNodeWallet> {
  try {
    const parsed = JSON.parse(json);
    // Check for valid keystore JSON structure
    if (!parsed.address || (!parsed.crypto && !parsed.Crypto)) {
      throw new Error('Invalid JSON wallet');
    }
    return await Wallet.fromEncryptedJson(json, password);
  } catch (error: any) {
    if (error.message === 'Invalid JSON wallet') {
      throw error;
    }
    if (error.message.includes('JSON')) {
      throw new Error('Invalid JSON wallet');
    }
    throw error;
  }
}

export async function validateImportedWallet(wallet: any): Promise<boolean> {
  if (!wallet || !wallet.address || !wallet.privateKey) {
    return false;
  }
  return validateWallet(wallet);
}