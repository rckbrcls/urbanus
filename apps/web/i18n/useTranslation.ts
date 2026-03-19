import { useLocaleStore } from '@/stores/localeStore';
import { ptBR } from './dictionaries/pt-BR';
import { en } from './dictionaries/en';
import type { Dictionary } from './types';

const dictionaries: Record<string, Dictionary> = {
  'pt-BR': ptBR,
  en,
};

export function useTranslation(): Dictionary;
export function useTranslation<K extends keyof Dictionary>(ns: K): Dictionary[K];
export function useTranslation<K extends keyof Dictionary>(ns?: K) {
  const locale = useLocaleStore((s) => s.locale);
  const dict = dictionaries[locale] ?? ptBR;
  return ns ? dict[ns] : dict;
}
