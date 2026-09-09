import { useLocale } from '../i18n'
import FileConfigBrowser from './FileConfigBrowser'
import type { ServerInstance } from '../types'

interface Props {
  server: ServerInstance
}

// Paper writes its own config (paper-global.yml, paper-world-defaults.yml,
// plus one paper-world.yml per world folder) under config/ starting with
// modern Paper - none of it exists until the server has actually booted
// once, so FileConfigBrowser's own "folder is empty" state doubles as the
// "start the server first" message here rather than needing a separate one.
function ServerPaperConfigTab({ server }: Props): React.JSX.Element {
  const { t } = useLocale()
  return (
    <div className="detail-tab">
      <p className="instance-meta">{t('serverHost.paperConfig.explainer')}</p>
      <FileConfigBrowser serverId={server.id} rootDir="config" emptyLabel={t('serverHost.paperConfig.empty')} />
    </div>
  )
}

export default ServerPaperConfigTab
