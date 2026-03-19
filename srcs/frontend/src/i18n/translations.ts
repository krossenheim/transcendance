// Main translations index file
import { en } from './locales/en';
import type { TranslationKeys } from './locales/en';
import { ru } from './locales/ru';
import { zh } from './locales/zh';
import { he } from './locales/he';
import { es } from './locales/es';
import { nl } from './locales/nl';
import { fy } from './locales/fy';
import { cy } from './locales/cy';
import { tlh } from './locales/tlh';
import { sjn } from './locales/sjn';
import { la } from './locales/la';
import { pig } from './locales/pig';

export type Language = 'en' | 'ru' | 'zh' | 'he' | 'es' | 'nl' | 'fy' | 'cy' | 'tlh' | 'sjn' | 'la' | 'pig';

export const translations: Record<Language, TranslationKeys> = {
  en,
  ru,
  zh,
  he,
  es,
  nl,
  fy,
  cy,
  tlh,
  sjn,
  la,
  pig,
};

export const languageNames: { [key in Language]: string } = {
  en: 'English',
  ru: 'Русский',
  zh: '中文',
  he: 'עברית',
  es: 'Venezuelan',
  nl: 'Belgian',
  fy: 'Frysk',
  cy: 'Cymraeg',
  tlh: 'tlhIngan',
  sjn: 'Sindarin',
  la: 'Latina',
  pig: 'Igpay Atinlay',
};

export const languageFlags: { [key in Language]: string } = {
  en: '\u{1F1EC}\u{1F1E7}',
  ru: '\u{1F1F7}\u{1F1FA}',
  zh: '\u{1F1E8}\u{1F1F3}',
  he: '\u{1F1EE}\u{1F1F1}',
  es: '\u{1F1FB}\u{1F1EA}',
  nl: '\u{1F1E7}\u{1F1EA}',
  fy: '\u{1F1F3}\u{1F1F1}',
  cy: '\u{1F3F4}\u{E0067}\u{E0062}\u{E0077}\u{E006C}\u{E0073}\u{E007F}',
  tlh: '',
  sjn: '',
  la: '',
  pig: '',
};

export type { TranslationKeys };
