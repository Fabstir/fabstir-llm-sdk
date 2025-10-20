// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

// MIT License
// Copyright (c) 2021 Skynet Labs

import { CryptoImplementation } from "../../api/crypto.js";
import { wordlist } from "./wordlist.js";

export const SEED_LENGTH = 16;
export const SEED_WORDS_LENGTH = 13;
export const CHECKSUM_WORDS_LENGTH = 2;
export const PHRASE_LENGTH = SEED_WORDS_LENGTH + CHECKSUM_WORDS_LENGTH;

const LAST_WORD_INDEX = 12;
const PHRASE_DELIMITER = " ";

/**
 * Generates a 15-word seed phrase for 16 bytes of entropy plus 20 bits of checksum. The dictionary length is 1024 which gives 10 bits of entropy per word.
 *
 * @returns - The generated phrase.
 */
export function generatePhrase(crypto: CryptoImplementation): string {
    const seedWords = randomUint16Words(SEED_WORDS_LENGTH, crypto);

    // Populate the seed words from the random values.
    for (let i = 0; i < SEED_WORDS_LENGTH; i++) {
        let numBits = 10;
        // For the 13th word, only the first 256 words are considered valid.
        if (i === LAST_WORD_INDEX) {
            numBits = 8;
        }
        seedWords[i] = seedWords[i] % (1 << numBits);
    }

    // Generate checksum from hash of the seed.
    const checksumWords = generateChecksumWordsFromSeedWords(seedWords, crypto);

    const phraseWords: string[] = new Array(PHRASE_LENGTH);
    let phraseWord = 0;
    for (let i = 0; i < SEED_WORDS_LENGTH; i++) {
        phraseWords[phraseWord++] = wordlist[seedWords[i]];
    }
    for (let i = 0; i < CHECKSUM_WORDS_LENGTH; i++) {
        phraseWords[phraseWord++] = wordlist[checksumWords[i]];
    }

    return phraseWords.join(PHRASE_DELIMITER);
}

/**
 * Converts the input seed phrase to the actual seed bytes.
 *
 * @param phrase - The input seed phrase.
 * @returns - The seed bytes.
 * @throws - Will throw if the phrase fails to validate, with the reason that the seed is invalid.
 */
export function phraseToSeed(phrase: string, crypto: CryptoImplementation): Uint8Array {
    phrase = sanitizePhrase(phrase);
    const [valid, error, seed] = validatePhrase(phrase, crypto);
    if (!valid || !seed) {
        throw new Error(error);
    }

    return seed;
}

/**
 * Validate the phrase by checking that for every word, there is a dictionary
 * word that starts with the first 3 letters of the word. For the last word of
 * the seed phrase (the 13th word; words 14 and 15 are checksum words), only the
 * first 256 words of the dictionary are considered valid.
 *
 * @param phrase - The input seed phrase to check.
 * @returns - A boolean indicating whether the phrase is valid, a string explaining the error if it's not, and the final seed bytes.
 */
export function validatePhrase(phrase: string, crypto: CryptoImplementation): [boolean, string, Uint8Array | null] {
    phrase = sanitizePhrase(phrase);
    const phraseWords = phrase.split(" ");
    if (phraseWords.length !== PHRASE_LENGTH) {
        return [false, `Phrase must be '${PHRASE_LENGTH}' words long, was '${phraseWords.length}'`, null];
    }

    // Build the seed words from phrase words.
    const seedWords = new Uint16Array(SEED_WORDS_LENGTH);
    let i = 0;
    for (const word of phraseWords) {
        // Check word length.
        if (word.length < 3) {
            return [false, `Word ${i + 1} is not at least 3 letters long`, null];
        }

        // Iterate through the dictionary looking for the word prefix.
        const prefix = word.slice(0, 3);
        let bound = wordlist.length;
        if (i === LAST_WORD_INDEX) {
            bound = 256;
        }
        let found = -1;
        for (let j = 0; j < bound; j++) {
            const curPrefix = wordlist[j].slice(0, 3);
            if (curPrefix === prefix) {
                found = j;
                break;
            } else if (curPrefix > prefix) {
                break;
            }
        }
        // The prefix was not found in the dictionary.
        if (found < 0) {
            if (i === LAST_WORD_INDEX) {
                return [false, `Prefix for word ${i + 1} must be found in the first 256 words of the dictionary`, null];
            } else {
                return [false, `Unrecognized prefix "${prefix}" at word ${i + 1}, not found in dictionary`, null];
            }
        }

        seedWords[i] = found;

        i++;
    }
    console.log(seedWords);

    // Validate checksum.
    const checksumWords = generateChecksumWordsFromSeedWords(seedWords, crypto);
    for (let i = 0; i < CHECKSUM_WORDS_LENGTH; i++) {
        const prefix = wordlist[checksumWords[i]].slice(0, 3);
        if (phraseWords[i + SEED_WORDS_LENGTH].slice(0, 3) !== prefix) {
            return [false, `Word "${phraseWords[i + SEED_WORDS_LENGTH]}" is not a valid checksum for the seed`, null];
        }
    }

    return [true, "", seedWordsToSeed(seedWords)];
}

// ================
// Helper Functions
// ================

/**
 * Generates 2 10-bit checksum words from the 10-bit seed words.
 *
 * @param seedWords - The array of 10-bit seed words.
 * @returns - The 2 10-bit checksum words.
 * @throws - Will throw if the seed words are of the wrong length.
 */
function generateChecksumWordsFromSeedWords(
    seedWords: Uint16Array,
    crypto: CryptoImplementation
): Uint16Array {
    if (seedWords.length !== SEED_WORDS_LENGTH) {
        throw new Error(`Input seed was not of length ${SEED_WORDS_LENGTH}`);
    }

    const seed = seedWordsToSeed(seedWords);
    const h = crypto.hashBlake3Sync(seed);
    return hashToChecksumWords(h);
}

/**
 * Converts the hash of the seed bytes into 2 10-bit checksum words.
 *
 * @param h - The hash of the seed.
 * @returns - The 2 10-bit checksum words.
 */
export function hashToChecksumWords(h: Uint8Array): Uint16Array {
    let word1 = h[0] << 8;
    word1 += h[1];
    word1 >>= 6;
    let word2 = h[1] << 10;
    word2 &= 0xffff;
    word2 += h[2] << 2;
    word2 >>= 6;
    return new Uint16Array([word1, word2]);
}

/**
 * Returns a uint16 typed array containing random values.
 *
 * NOTE: This has been tested manually only.
 *
 * @param length - The length of the uint16 array.
 * @returns - The uint16 array.
 */
export function randomUint16Words(length: number, crypto: CryptoImplementation): Uint16Array {
    const bytes = crypto.generateSecureRandomBytes(length * 2);
    const words = new Uint16Array(length);

    for (let i = 0; i < length * 2; i += 2) {
        words[i / 2] = (bytes[i] << 8) | bytes[i + 1];
    }

    return words;
}

/**
 * Sanitizes the input phrase by trimming it and lowercasing it.
 *
 * @param phrase - The input seed phrase.
 * @returns - The sanitized phrase.
 */
export function sanitizePhrase(phrase: string): string {
    // Remove duplicate adjacent spaces.
    return phrase.trim().toLowerCase().replaceAll(/\s+/g, " ");
}

/**
 * Converts the input 10-bit seed words into seed bytes (8-bit array).
 *
 * @param seedWords - The array of 10-bit seed words.
 * @returns - The seed bytes.
 * @throws - Will throw if the seed words are of the wrong length.
 */
export function seedWordsToSeed(seedWords: Uint16Array): Uint8Array {
    if (seedWords.length !== SEED_WORDS_LENGTH) {
        throw new Error(`Input seed words should be length '${SEED_WORDS_LENGTH}', was '${seedWords.length}'`);
    }

    // We are getting 16 bytes of entropy.
    const bytes = new Uint8Array(SEED_LENGTH);
    let curByte = 0;
    let curBit = 0;

    for (let i = 0; i < SEED_WORDS_LENGTH; i++) {
        const word = seedWords[i];
        let wordBits = 10;
        if (i === SEED_WORDS_LENGTH - 1) {
            wordBits = 8;
        }

        // Iterate over the bits of the 10- or 8-bit word.
        for (let j = 0; j < wordBits; j++) {
            const bitSet = (word & (1 << (wordBits - j - 1))) > 0;

            if (bitSet) {
                bytes[curByte] |= 1 << (8 - curBit - 1);
            }

            curBit += 1;
            if (curBit >= 8) {
                // Current byte has 8 bits, go to the next byte.
                curByte += 1;
                curBit = 0;
            }
        }
    }

    return bytes;
}