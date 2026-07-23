import UpdateAvailableDialog from '../components/UpdateAvailableDialog'
import { useAppUpdate } from './useAppUpdate'

/** Registers the service worker once at app root and shows the update popup to every user. */
export default function AppUpdateGate({ children }: { children: React.ReactNode }) {
  const { needRefresh, refreshing, refresh } = useAppUpdate()

  return (
    <>
      {children}
      <UpdateAvailableDialog
        open={needRefresh}
        refreshing={refreshing}
        onRefresh={() => void refresh()}
      />
    </>
  )
}
