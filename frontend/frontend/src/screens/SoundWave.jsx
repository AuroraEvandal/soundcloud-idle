import { useState } from 'react'
import AppBar from '../components/AppBar'
import Tabs from '../components/Tabs'
import Icon from '../components/Icon'
import Feed from './Feed'
import Battle from './Battle'

export default function SoundWave({ onClose }) {
  const [tab, setTab] = useState('battle')
  return (
    <div className="app sw">
      <AppBar onBack={onClose}>
        <span className="logo">
          <Icon name="cloud" size={22} color="var(--accent)" /> SoundWave
        </span>
      </AppBar>
      <Tabs
        tabs={[
          ['feed', 'Лента'],
          ['battle', 'Батл'],
        ]}
        value={tab}
        onChange={setTab}
      />
      <div className="app-body">{tab === 'feed' ? <Feed /> : <Battle />}</div>
    </div>
  )
}
