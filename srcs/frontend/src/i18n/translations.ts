// Main translations index file
import { en } from './locales/en';
import type { TranslationKeys } from './locales/en';
import { ru } from './locales/ru';
import { zh } from './locales/zh';
import { he } from './locales/he';
import { es } from './locales/es';
import { nl } from './locales/nl';

export type Language = 'en' | 'ru' | 'zh' | 'he' | 'es' | 'nl';

export const translations: Record<Language, TranslationKeys> = {
  en,
  ru,
  zh,
  he,
  es,
  nl,
};

export const languageNames: { [key in Language]: string } = {
  en: 'English',
  ru: 'Русский',
  zh: '中文',
  he: 'עברית',
  es: 'Venezuelan',
  nl: 'Belgian',
};

export const languageFlags: { [key in Language]: string } = {
  en: '\u{1F1EC}\u{1F1E7}',
  ru: '\u{1F1F7}\u{1F1FA}',
  zh: '\u{1F1E8}\u{1F1F3}',
  he: '\u{1F1EE}\u{1F1F1}',
  es: '\u{1F1FB}\u{1F1EA}',
  nl: '\u{1F1E7}\u{1F1EA}',
};

export type { TranslationKeys };
