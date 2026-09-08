import { LOCALE_LABELS, useLocale, type Locale } from './i18n'

function LanguageSwitcher(): React.JSX.Element {
  const { locale, setLocale, t } = useLocale()

  return (
    <select
      className="language-switcher"
      value={locale}
      onChange={(e) => setLocale(e.target.value as Locale)}
      title={t('common.language')}
    >
      {(Object.keys(LOCALE_LABELS) as Locale[]).map((code) => (
        <option key={code} value={code}>
          {LOCALE_LABELS[code]}
        </option>
      ))}
    </select>
  )
}

export default LanguageSwitcher
