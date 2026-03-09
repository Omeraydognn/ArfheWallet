import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en.json';
import tr from './locales/tr.json';

/**
 * ArfheWallet i18n Configuration
 *
 * Supported languages: English (en), Turkish (tr)
 * Locale files: src/locales/en.json, src/locales/tr.json
 *
 * NOTE: The build output also contains locale strings from @web3auth/ui
 * (dutch, english, french, german, japanese, korean, mandarin, portuguese,
 * spanish, turkish — ~41KB total). These are internal to Web3Auth's modal
 * UI and cannot be tree-shaken. They do NOT affect our app's i18n.
 *
 * To add a new language:
 *   1. Create src/locales/{code}.json (copy en.json as template)
 *   2. Import it here and add to resources
 *   3. Add entry to LANGUAGES array
 */

// Get saved language or default to English
const savedLang = localStorage.getItem('arfhe_language') || 'en';

i18n
    .use(initReactI18next)
    .init({
        resources: {
            en: { translation: en },
            tr: { translation: tr },
        },
        lng: savedLang,
        fallbackLng: 'en',
        interpolation: {
            escapeValue: false, // React already escapes by default
        },
    });

export default i18n;

/**
 * Change app language and persist to localStorage.
 */
export function changeLanguage(lang: string) {
    i18n.changeLanguage(lang);
    localStorage.setItem('arfhe_language', lang);
}

/**
 * Available languages.
 */
export const LANGUAGES = [
    { code: 'en', label: 'English', flag: '🇬🇧' },
    { code: 'tr', label: 'Türkçe', flag: '🇹🇷' },
];
