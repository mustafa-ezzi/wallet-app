/** Home (books) currencies — codes, symbols, and country defaults. */

export type HomeCurrency = {
  code: string
  name: string
  symbol: string
}

export const DEFAULT_HOME_CURRENCY = 'PKR'

export const HOME_CURRENCIES: HomeCurrency[] = [
  { code: 'PKR', name: 'Pakistani Rupee', symbol: 'Rs' },
  { code: 'INR', name: 'Indian Rupee', symbol: '₹' },
  { code: 'AED', name: 'UAE Dirham', symbol: 'AED' },
  { code: 'SAR', name: 'Saudi Riyal', symbol: 'SAR' },
  { code: 'USD', name: 'US Dollar', symbol: '$' },
  { code: 'EUR', name: 'Euro', symbol: '€' },
  { code: 'GBP', name: 'British Pound', symbol: '£' },
  { code: 'CAD', name: 'Canadian Dollar', symbol: 'C$' },
  { code: 'AUD', name: 'Australian Dollar', symbol: 'A$' },
  { code: 'TRY', name: 'Turkish Lira', symbol: '₺' },
  { code: 'MYR', name: 'Malaysian Ringgit', symbol: 'RM' },
  { code: 'QAR', name: 'Qatari Riyal', symbol: 'QAR' },
  { code: 'OMR', name: 'Omani Rial', symbol: 'OMR' },
  { code: 'BHD', name: 'Bahraini Dinar', symbol: 'BHD' },
  { code: 'KWD', name: 'Kuwaiti Dinar', symbol: 'KWD' },
  { code: 'CNY', name: 'Chinese Yuan', symbol: '¥' },
  { code: 'THB', name: 'Thai Baht', symbol: '฿' },
]

const BY_CODE: Record<string, HomeCurrency> = Object.fromEntries(
  HOME_CURRENCIES.map((c) => [c.code, c]),
)

const COUNTRY_CURRENCY: Record<string, string> = {
  Pakistan: 'PKR',
  India: 'INR',
  'United Arab Emirates': 'AED',
  'Saudi Arabia': 'SAR',
  'United Kingdom': 'GBP',
  'United States': 'USD',
  Canada: 'CAD',
  Australia: 'AUD',
  Germany: 'EUR',
  Other: 'USD',
}

let currentCode = DEFAULT_HOME_CURRENCY

export function isHomeCurrency(code: string | null | undefined): boolean {
  const c = String(code || '').trim().toUpperCase()
  return Boolean(c && BY_CODE[c])
}

export function normalizeHomeCurrency(code?: string | null): string {
  const c = String(code || '').trim().toUpperCase()
  return BY_CODE[c] ? c : DEFAULT_HOME_CURRENCY
}

export function setHomeCurrency(code?: string | null): string {
  currentCode = normalizeHomeCurrency(code)
  return currentCode
}

export function getHomeCurrencyCode(): string {
  return currentCode
}

export function getHomeCurrency(code?: string | null): HomeCurrency {
  const c = normalizeHomeCurrency(code ?? currentCode)
  return BY_CODE[c] || BY_CODE[DEFAULT_HOME_CURRENCY]
}

export function homeCurrencySymbol(code?: string | null): string {
  return getHomeCurrency(code).symbol
}

export function defaultCurrencyForCountry(country: string): string {
  return COUNTRY_CURRENCY[country] || DEFAULT_HOME_CURRENCY
}

/** Prefix an already-formatted number with the currency symbol. */
export function withCurrencySymbol(formattedNumber: string, code?: string | null): string {
  const symbol = homeCurrencySymbol(code)
  if (/[A-Za-z]$/.test(symbol) && !symbol.includes('$')) {
    return `${symbol} ${formattedNumber}`
  }
  return `${symbol}${formattedNumber}`
}

export function maskedMoney(code?: string | null): string {
  return withCurrencySymbol('••••', code)
}
