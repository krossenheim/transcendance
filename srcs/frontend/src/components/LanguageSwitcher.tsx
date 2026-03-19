import { useState, useRef, useEffect } from 'react';
import { useLanguage, languageNames, languageFlags } from '../i18n';

type SupportedLanguage = 'en' | 'ru' | 'zh' | 'he' | 'es' | 'nl' | 'fy' | 'cy' | 'tlh' | 'sjn' | 'la' | 'pig';

// Languages that use image flags instead of emoji
const imageFlags: Partial<Record<SupportedLanguage, string>> = {
  fy: '/static/react_dist/flags/fy.png',
  tlh: '/static/react_dist/flags/tlh.svg',
  sjn: '/static/react_dist/flags/sjn.svg',
  la: '/static/react_dist/flags/la.svg',
  pig: '/static/react_dist/flags/pig.png',
};

function FlagDisplay({ lang, className }: { lang: SupportedLanguage; className?: string }) {
  if (imageFlags[lang]) {
    return <img src={imageFlags[lang]} alt="" className={`w-5 h-4 object-cover rounded-sm ${className || ''}`} />;
  }
  return <span className={`text-lg ${className || ''}`} aria-hidden="true">{languageFlags[lang]}</span>;
}

export default function LanguageSwitcher() {
  const { language, setLanguage, t } = useLanguage();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const languages: SupportedLanguage[] = ['en', 'ru', 'zh', 'he', 'es', 'nl', 'fy', 'cy', 'tlh', 'sjn', 'la', 'pig'];

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
    return undefined;
  }, [isOpen]);

  const currentLang = language as SupportedLanguage;

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-2 hover:bg-gray-100/40 dark:hover:bg-dark-700 transition-colors text-gray-700 dark:text-gray-300"
        aria-label={t('language.select')}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
      >
        <FlagDisplay lang={currentLang} />
        <span className="text-sm font-medium hidden sm:inline">{languageNames[currentLang]}</span>
        <svg
          className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div 
          className="absolute right-0 mt-2 w-48 glass-light-sm dark:glass-dark-sm glass-border shadow-lg dark:shadow-dark-700 py-2 z-[10000]"
          role="listbox"
          aria-label={t('language.select')}
        >
          <div className="px-3 py-2 text-xs font-semibold text-gray-800 dark:text-gray-200 uppercase tracking-wider border-b border-gray-200 dark:border-gray-700">
            {t('language.title')}
          </div>
          {languages.map((lang) => (
            <button
              key={lang}
              onClick={() => {
                setLanguage(lang);
                setIsOpen(false);
              }}
              className={`w-full text-left px-4 py-2 text-sm flex items-center gap-3 transition-colors ${
                currentLang === lang
                  ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 font-semibold'
                  : 'text-gray-900 dark:text-gray-100 hover:bg-gray-100/40 dark:hover:bg-dark-700'
              }`}
              role="option"
              aria-selected={currentLang === lang}
            >
              <FlagDisplay lang={lang} />
              <span>{languageNames[lang]}</span>
              {currentLang === lang && (
                <svg className="w-4 h-4 ml-auto text-blue-500" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
