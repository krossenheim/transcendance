// Main translations index file
import { en } from './locales/en';
import type { TranslationKeys } from './locales/en';
import { ru } from './locales/ru';
import { zh } from './locales/zh';
import { he } from './locales/he';

export type Language = 'en' | 'ru' | 'zh' | 'he';

export const translations: Record<Language, TranslationKeys> = {
  en,
  ru,
  zh,
  he,
};

export const languageNames: { [key in Language]: string } = {
  en: 'English',
  ru: 'Русский',
  zh: '中文',
  he: 'עברית',
};

export const languageFlags: { [key in Language]: string } = {
  en: '🇬🇧',
  ru: '🇷🇺',
  zh: '🇨🇳',
  he: '🇮🇱',
};

export type { TranslationKeys };
